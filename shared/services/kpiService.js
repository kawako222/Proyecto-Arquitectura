'use strict';

const Joi = require('joi');
const { Reservacion, Habitacion, MovimientoCaja } = require('../models');
const { ROLES, ZONAS_LISTA, ESTADOS_RESERVACION, ESTADOS_QUE_OCUPAN } = require('../config/constants');
const { validate, inicioDelDia, redondear, MS_DIA } = require('../utils/helpers');
const { badRequest } = require('../utils/errors');
const { requireRole } = require('./authService');

const E = ESTADOS_RESERVACION;

const rangoSchema = Joi.object({
  desde: Joi.date().iso(),
  hasta: Joi.date().iso(),
  anio: Joi.number().integer().min(2000).max(2100)
});

/** Rango por defecto: ultimos 30 dias hasta hoy. */
function resolverRango(filtros = {}) {
  const input = validate(rangoSchema, filtros);
  const hasta = input.hasta ? inicioDelDia(input.hasta) : new Date(inicioDelDia(new Date()).getTime() + MS_DIA);
  const desde = input.desde ? inicioDelDia(input.desde) : new Date(hasta.getTime() - 30 * MS_DIA);
  if (hasta <= desde) throw badRequest('El parámetro "hasta" debe ser posterior a "desde"');
  return { desde, hasta };
}

/** Ticket promedio de estancias finalizadas cuya salida cae en el rango. */
async function ticketPromedio(actor, filtros = {}) {
  requireRole(actor, [ROLES.ADMIN]);
  const { desde, hasta } = resolverRango(filtros);
  const [r] = await Reservacion.aggregate([
    { $match: { estado: E.FINALIZADA, fechaSalida: { $gte: desde, $lt: hasta } } },
    { $group: { _id: null, promedio: { $avg: '$total' }, suma: { $sum: '$total' }, estancias: { $sum: 1 } } }
  ]);
  return {
    desde, hasta,
    ticketPromedio: redondear(r ? r.promedio : 0),
    ingresosEstancias: redondear(r ? r.suma : 0),
    estanciasFinalizadas: r ? r.estancias : 0
  };
}

/** Ingresos, gastos y utilidad por mes (movimientos de caja). */
async function ingresosMensuales(actor, filtros = {}) {
  requireRole(actor, [ROLES.ADMIN]);
  const input = validate(rangoSchema, filtros);
  const anio = input.anio || new Date().getUTCFullYear();
  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));
  const filas = await MovimientoCaja.aggregate([
    { $match: { fecha: { $gte: desde, $lt: hasta } } },
    { $group: { _id: { mes: { $month: '$fecha' }, tipo: '$tipo' }, total: { $sum: '$monto' } } }
  ]);
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: `${anio}-${String(i + 1).padStart(2, '0')}`, ingresos: 0, gastos: 0, utilidad: 0 }));
  filas.forEach((f) => {
    const m = meses[f._id.mes - 1];
    if (f._id.tipo === 'INGRESO') m.ingresos = redondear(f.total);
    else m.gastos = redondear(f.total);
  });
  meses.forEach((m) => { m.utilidad = redondear(m.ingresos - m.gastos); });
  return {
    anio,
    meses,
    totalIngresos: redondear(meses.reduce((a, m) => a + m.ingresos, 0)),
    totalGastos: redondear(meses.reduce((a, m) => a + m.gastos, 0))
  };
}

/** Tasa de ocupacion por zona = noches ocupadas / (habitaciones x noches del rango). */
async function ocupacionPorZona(actor, filtros = {}) {
  requireRole(actor, [ROLES.ADMIN]);
  const { desde, hasta } = resolverRango(filtros);
  const nochesRango = Math.round((hasta - desde) / MS_DIA);
  const habitaciones = await Habitacion.aggregate([{ $match: { activa: true } }, { $group: { _id: '$zona', total: { $sum: 1 } } }]);
  const reservaciones = await Reservacion.find({
    estado: { $in: [...ESTADOS_QUE_OCUPAN, E.FINALIZADA] },
    fechaEntrada: { $lt: hasta },
    fechaSalida: { $gt: desde }
  }).select('zona fechaEntrada fechaSalida');

  const ocupadas = Object.fromEntries(ZONAS_LISTA.map((z) => [z, 0]));
  reservaciones.forEach((r) => {
    const inicio = Math.max(r.fechaEntrada.getTime(), desde.getTime());
    const fin = Math.min(r.fechaSalida.getTime(), hasta.getTime());
    const noches = Math.max(0, Math.round((fin - inicio) / MS_DIA));
    if (ocupadas[r.zona] !== undefined) ocupadas[r.zona] += noches;
  });

  const zonas = ZONAS_LISTA.map((zona) => {
    const fila = habitaciones.find((h) => h._id === zona);
    const total = fila ? fila.total : 0;
    const capacidad = total * nochesRango;
    return {
      zona,
      habitaciones: total,
      nochesDisponibles: capacidad,
      nochesOcupadas: ocupadas[zona],
      tasaOcupacion: capacidad ? redondear((ocupadas[zona] / capacidad) * 100) : 0
    };
  });
  const capacidadTotal = zonas.reduce((a, z) => a + z.nochesDisponibles, 0);
  const ocupadasTotal = zonas.reduce((a, z) => a + z.nochesOcupadas, 0);
  return {
    desde, hasta, nochesRango, zonas,
    tasaOcupacionGlobal: capacidadTotal ? redondear((ocupadasTotal / capacidadTotal) * 100) : 0
  };
}

/** Tasa de cancelacion de reservaciones creadas en el rango. */
async function cancelaciones(actor, filtros = {}) {
  requireRole(actor, [ROLES.ADMIN]);
  const { desde, hasta } = resolverRango(filtros);
  const filas = await Reservacion.aggregate([
    { $match: { createdAt: { $gte: desde, $lt: hasta }, estado: { $ne: E.COTIZACION } } },
    { $group: { _id: '$estado', total: { $sum: 1 } } }
  ]);
  const porEstado = Object.fromEntries(Object.values(E).map((e) => [e, 0]));
  filas.forEach((f) => { porEstado[f._id] = f.total; });
  const total = filas.reduce((a, f) => a + f.total, 0);
  return {
    desde, hasta,
    totalReservaciones: total,
    canceladas: porEstado[E.CANCELADA],
    tasaCancelacion: total ? redondear((porEstado[E.CANCELADA] / total) * 100) : 0,
    porEstado
  };
}

async function resumen(actor, filtros = {}) {
  requireRole(actor, [ROLES.ADMIN]);
  const [ticket, ocupacion, cancel, ingresos] = await Promise.all([
    ticketPromedio(actor, filtros),
    ocupacionPorZona(actor, filtros),
    cancelaciones(actor, filtros),
    ingresosMensuales(actor, { anio: filtros.anio })
  ]);
  return { ticketPromedio: ticket, ocupacionPorZona: ocupacion, cancelaciones: cancel, ingresosMensuales: ingresos };
}

module.exports = { ticketPromedio, ingresosMensuales, ocupacionPorZona, cancelaciones, resumen };

'use strict';

const Joi = require('joi');
const { TurnoCaja, MovimientoCaja } = require('../models');
const {
  ROLES, ESTADOS_TURNO, TIPOS_MOVIMIENTO, METODOS_PAGO, CATEGORIAS_GASTO, CATEGORIAS_INGRESO
} = require('../config/constants');
const { validate, assertObjectId, redondear, paginar } = require('../utils/helpers');
const { notFound, conflict, precondition, badRequest } = require('../utils/errors');
const { requireRole } = require('./authService');

const PERSONAL = [ROLES.ADMIN, ROLES.STAFF];

const abrirSchema = Joi.object({
  montoInicial: Joi.number().min(0).required(),
  notas: Joi.string().trim().max(500).allow('', null)
});

const cerrarSchema = Joi.object({
  efectivoContado: Joi.number().min(0).required(),
  notas: Joi.string().trim().max(500).allow('', null)
});

const movimientoSchema = Joi.object({
  tipo: Joi.string().valid(...Object.values(TIPOS_MOVIMIENTO)).required(),
  categoria: Joi.string().required(),
  concepto: Joi.string().trim().min(3).max(200).required(),
  monto: Joi.number().positive().precision(2).required(),
  metodoPago: Joi.string().valid(...METODOS_PAGO).default('EFECTIVO'),
  reservacion: Joi.string().hex().length(24)
});

async function turnoAbierto() {
  return TurnoCaja.findOne({ estado: ESTADOS_TURNO.ABIERTO });
}

async function calcularTotales(turno) {
  const movimientos = await MovimientoCaja.find({ turno: turno._id });
  let totalIngresos = 0;
  let totalGastos = 0;
  let ingresosEfectivo = 0;
  let gastosEfectivo = 0;
  movimientos.forEach((m) => {
    const efectivo = m.metodoPago === 'EFECTIVO';
    if (m.tipo === TIPOS_MOVIMIENTO.INGRESO) {
      totalIngresos += m.monto;
      if (efectivo) ingresosEfectivo += m.monto;
    } else {
      totalGastos += m.monto;
      if (efectivo) gastosEfectivo += m.monto;
    }
  });
  return {
    totalIngresos: redondear(totalIngresos),
    totalGastos: redondear(totalGastos),
    efectivoEsperado: redondear(turno.montoInicial + ingresosEfectivo - gastosEfectivo),
    movimientos: movimientos.length
  };
}

async function estadoActual(actor) {
  requireRole(actor, PERSONAL);
  const turno = await turnoAbierto();
  if (!turno) return { abierto: false, turno: null, totales: null };
  return { abierto: true, turno: turno.toJSON(), totales: await calcularTotales(turno) };
}

async function abrirTurno(actor, data) {
  requireRole(actor, PERSONAL);
  const input = validate(abrirSchema, data);
  if (await turnoAbierto()) throw conflict('Ya existe un turno de caja abierto. Ciérralo antes de abrir otro.');
  const turno = await TurnoCaja.create({
    montoInicial: input.montoInicial,
    notas: input.notas || undefined,
    abiertoPor: actor.id,
    efectivoEsperado: input.montoInicial
  });
  return turno.toJSON();
}

/**
 * Registra un ingreso o gasto en el turno abierto.
 * Tambien lo usa reservacionService al liquidar pagos.
 */
async function registrarMovimiento(actor, data) {
  requireRole(actor, PERSONAL);
  const input = validate(movimientoSchema, data);
  const permitidas = input.tipo === TIPOS_MOVIMIENTO.GASTO ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO;
  if (!permitidas.includes(input.categoria)) {
    throw badRequest(`Categoría inválida para ${input.tipo}. Opciones: ${permitidas.join(', ')}`);
  }
  const turno = await turnoAbierto();
  if (!turno) throw precondition('No hay un turno de caja abierto. Abre la caja antes de registrar movimientos.');
  const movimiento = await MovimientoCaja.create({ ...input, turno: turno._id, registradoPor: actor.id });
  const totales = await calcularTotales(turno);
  turno.totalIngresos = totales.totalIngresos;
  turno.totalGastos = totales.totalGastos;
  turno.efectivoEsperado = totales.efectivoEsperado;
  await turno.save();
  return movimiento.toJSON();
}

async function cerrarTurno(actor, data) {
  requireRole(actor, PERSONAL);
  const input = validate(cerrarSchema, data);
  const turno = await turnoAbierto();
  if (!turno) throw precondition('No hay un turno de caja abierto');
  const totales = await calcularTotales(turno);
  Object.assign(turno, {
    estado: ESTADOS_TURNO.CERRADO,
    cerradoPor: actor.id,
    fechaCierre: new Date(),
    totalIngresos: totales.totalIngresos,
    totalGastos: totales.totalGastos,
    efectivoEsperado: totales.efectivoEsperado,
    efectivoContado: input.efectivoContado,
    diferencia: redondear(input.efectivoContado - totales.efectivoEsperado),
    notas: input.notas || turno.notas
  });
  await turno.save();
  return turno.toJSON();
}

async function listarTurnos(actor, filtros = {}) {
  requireRole(actor, PERSONAL);
  const { limit, skip } = paginar(filtros);
  const query = {};
  if (filtros.estado) query.estado = filtros.estado;
  const turnos = await TurnoCaja.find(query).sort({ fechaApertura: -1 }).skip(skip).limit(limit)
    .populate('abiertoPor', 'nombre').populate('cerradoPor', 'nombre');
  return turnos.map((t) => t.toJSON());
}

async function obtenerTurno(actor, id) {
  requireRole(actor, PERSONAL);
  assertObjectId(id);
  const turno = await TurnoCaja.findById(id).populate('abiertoPor', 'nombre').populate('cerradoPor', 'nombre');
  if (!turno) throw notFound('Turno no encontrado');
  const movimientos = await MovimientoCaja.find({ turno: id }).sort({ fecha: 1 }).populate('registradoPor', 'nombre');
  return { ...turno.toJSON(), movimientos: movimientos.map((m) => m.toJSON()) };
}

async function listarMovimientos(actor, filtros = {}) {
  requireRole(actor, PERSONAL);
  const { limit, skip } = paginar(filtros);
  const query = {};
  if (filtros.tipo) query.tipo = filtros.tipo;
  if (filtros.turno) query.turno = assertObjectId(filtros.turno, 'turno');
  if (filtros.desde || filtros.hasta) {
    query.fecha = {};
    if (filtros.desde) query.fecha.$gte = new Date(filtros.desde);
    if (filtros.hasta) query.fecha.$lte = new Date(filtros.hasta);
  }
  const movimientos = await MovimientoCaja.find(query).sort({ fecha: -1 }).skip(skip).limit(limit)
    .populate('registradoPor', 'nombre');
  return movimientos.map((m) => m.toJSON());
}

module.exports = {
  turnoAbierto,
  estadoActual,
  abrirTurno,
  registrarMovimiento,
  cerrarTurno,
  listarTurnos,
  obtenerTurno,
  listarMovimientos
};

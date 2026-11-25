'use strict';

const Joi = require('joi');
const { Reservacion, Mascota, Habitacion } = require('../models');
const {
  ROLES, ZONAS, ZONAS_LISTA, ESTADOS_RESERVACION, ESTADOS_QUE_OCUPAN, ESTADOS_HABITACION,
  SERVICIOS_EXTRA, METODOS_PAGO
} = require('../config/constants');
const { validate, assertObjectId, inicioDelDia, calcularNoches, redondear, paginar, MS_DIA } = require('../utils/helpers');
const { notFound, forbidden, conflict, precondition, badRequest } = require('../utils/errors');
const { requireRole, esPersonal } = require('./authService');
const { estadoVacunas, esGeriatrica } = require('./mascotaService');
const cajaService = require('./cajaService');

const E = ESTADOS_RESERVACION;
const PERSONAL = [ROLES.ADMIN, ROLES.STAFF];
const CLAVES_SERVICIO = Object.keys(SERVICIOS_EXTRA);
const POPULATE = [
  { path: 'mascota', select: 'nombre raza edad tamano condiciones' },
  { path: 'tutor', select: 'nombre email telefono' },
  { path: 'habitacion', select: 'numero zona precioNoche estado' }
];

const cotizarSchema = Joi.object({
  mascota: Joi.string().hex().length(24).required(),
  habitacion: Joi.string().hex().length(24),
  zona: Joi.string().valid(...ZONAS_LISTA),
  fechaEntrada: Joi.date().iso().required(),
  fechaSalida: Joi.date().iso().greater(Joi.ref('fechaEntrada')).required()
    .messages({ 'date.greater': 'La fecha de salida debe ser posterior a la de entrada' }),
  servicios: Joi.array().items(Joi.string().valid(...CLAVES_SERVICIO)).unique().default([]),
  notas: Joi.string().trim().max(1000).allow('', null)
}).or('habitacion', 'zona').messages({ 'object.missing': 'Indica una habitacion o una zona' });

const crearSchema = cotizarSchema.keys({
  confirmar: Joi.boolean().default(true)
});

const actualizarSchema = Joi.object({
  habitacion: Joi.string().hex().length(24),
  fechaEntrada: Joi.date().iso(),
  fechaSalida: Joi.date().iso(),
  servicios: Joi.array().items(Joi.string().valid(...CLAVES_SERVICIO)).unique(),
  notas: Joi.string().trim().max(1000).allow('', null)
}).min(1);

const pagoSchema = Joi.object({
  monto: Joi.number().positive().precision(2).required(),
  metodo: Joi.string().valid(...METODOS_PAGO).required(),
  referencia: Joi.string().trim().max(100).allow('', null)
});

const notaSchema = Joi.object({
  notas: Joi.string().trim().max(500).allow('', null),
  observaciones: Joi.string().trim().max(500).allow('', null),
  motivo: Joi.string().trim().max(500).allow('', null)
});

/* ------------------------------------------------------------------ */
/* Reglas de negocio                                                  */
/* ------------------------------------------------------------------ */

function validarZonaParaMascota(mascota, zona) {
  if (zona === ZONAS.GERIATRICOS && !esGeriatrica(mascota)) {
    throw precondition('La zona Geriátricos es exclusiva para mascotas de 8 años o más, o marcadas como geriátricas');
  }
  if (zona === ZONAS.ESPECIALES && !(mascota.condiciones && mascota.condiciones.necesidadesEspeciales)) {
    throw precondition('La zona Especiales requiere que la mascota tenga necesidades especiales registradas');
  }
}

function validarFechas(fechaEntrada, fechaSalida) {
  const entrada = inicioDelDia(fechaEntrada);
  const salida = inicioDelDia(fechaSalida);
  if (salida <= entrada) throw badRequest('La fecha de salida debe ser al menos un día después de la entrada');
  const ayer = new Date(inicioDelDia(new Date()).getTime() - MS_DIA);
  if (entrada < ayer) throw badRequest('La fecha de entrada no puede estar en el pasado');
  if (calcularNoches(entrada, salida) > 60) throw badRequest('La estancia máxima es de 60 noches');
  return { entrada, salida };
}

async function obtenerMascotaAccesible(actor, mascotaId) {
  assertObjectId(mascotaId, 'mascota');
  const mascota = await Mascota.findById(mascotaId);
  if (!mascota || !mascota.activa) throw notFound('Mascota no encontrada o inactiva');
  if (!esPersonal(actor) && String(mascota.tutor) !== String(actor.id)) {
    throw forbidden('Solo puedes reservar para tus propias mascotas');
  }
  return mascota;
}

async function habitacionLibre(habitacionId, entrada, salida, excluirId) {
  const query = {
    habitacion: habitacionId,
    estado: { $in: ESTADOS_QUE_OCUPAN },
    fechaEntrada: { $lt: salida },
    fechaSalida: { $gt: entrada }
  };
  if (excluirId) query._id = { $ne: excluirId };
  return !(await Reservacion.exists(query));
}

async function mascotaSinTraslape(mascotaId, entrada, salida, excluirId) {
  const query = {
    mascota: mascotaId,
    estado: { $in: ESTADOS_QUE_OCUPAN },
    fechaEntrada: { $lt: salida },
    fechaSalida: { $gt: entrada }
  };
  if (excluirId) query._id = { $ne: excluirId };
  if (await Reservacion.exists(query)) {
    throw conflict('La mascota ya tiene una reservación activa que se traslapa con esas fechas');
  }
}

/** Elige habitacion: la indicada (validando) o la primera libre de la zona. */
async function resolverHabitacion({ habitacionId, zona, entrada, salida, excluirId }) {
  if (habitacionId) {
    assertObjectId(habitacionId, 'habitacion');
    const habitacion = await Habitacion.findById(habitacionId);
    if (!habitacion || !habitacion.activa) throw notFound('Habitación no encontrada o inactiva');
    if (habitacion.estado === ESTADOS_HABITACION.MANTENIMIENTO) throw conflict(`La habitación ${habitacion.numero} está en mantenimiento`);
    if (!(await habitacionLibre(habitacion._id, entrada, salida, excluirId))) {
      throw conflict(`La habitación ${habitacion.numero} ya está reservada en esas fechas`);
    }
    return habitacion;
  }
  const candidatas = await Habitacion.find({
    zona, activa: true, estado: { $ne: ESTADOS_HABITACION.MANTENIMIENTO }
  }).sort({ numero: 1 });
  for (const h of candidatas) {
    if (await habitacionLibre(h._id, entrada, salida, excluirId)) return h;
  }
  throw conflict(`No hay habitaciones disponibles en la zona "${zona}" para esas fechas`);
}

function calcularMontos(habitacion, noches, claves) {
  const servicios = claves.map((clave) => ({ clave, nombre: SERVICIOS_EXTRA[clave].nombre, precio: SERVICIOS_EXTRA[clave].precio }));
  const subtotalHospedaje = redondear(habitacion.precioNoche * noches);
  const subtotalServicios = redondear(servicios.reduce((acc, s) => acc + s.precio, 0));
  return { servicios, subtotalHospedaje, subtotalServicios, total: redondear(subtotalHospedaje + subtotalServicios) };
}

async function construirCotizacion(actor, input, excluirId) {
  const mascota = await obtenerMascotaAccesible(actor, input.mascota);
  const { entrada, salida } = validarFechas(input.fechaEntrada, input.fechaSalida);
  let zona = input.zona;
  if (input.habitacion) {
    assertObjectId(input.habitacion, 'habitacion');
    const h = await Habitacion.findById(input.habitacion);
    if (!h) throw notFound('Habitación no encontrada');
    zona = h.zona;
  }
  validarZonaParaMascota(mascota, zona);
  await mascotaSinTraslape(mascota._id, entrada, salida, excluirId);
  const habitacion = await resolverHabitacion({ habitacionId: input.habitacion, zona, entrada, salida, excluirId });
  const noches = calcularNoches(entrada, salida);
  const montos = calcularMontos(habitacion, noches, input.servicios || []);
  return {
    mascota,
    habitacion,
    datos: {
      mascota: mascota._id,
      tutor: mascota.tutor,
      habitacion: habitacion._id,
      zona: habitacion.zona,
      fechaEntrada: entrada,
      fechaSalida: salida,
      noches,
      precioNoche: habitacion.precioNoche,
      ...montos
    }
  };
}

async function cargar(id) {
  assertObjectId(id);
  const reservacion = await Reservacion.findById(id);
  if (!reservacion) throw notFound('Reservación no encontrada');
  return reservacion;
}

function asegurarAcceso(actor, reservacion) {
  if (esPersonal(actor)) return;
  if (String(reservacion.tutor) !== String(actor.id)) throw forbidden('Solo puedes ver tus propias reservaciones');
}

function exigirEstado(reservacion, permitidos, accion) {
  if (!permitidos.includes(reservacion.estado)) {
    throw precondition(`No se puede ${accion} una reservación en estado ${reservacion.estado}. Estados permitidos: ${permitidos.join(', ')}`);
  }
}

async function respuesta(reservacion) {
  await reservacion.populate(POPULATE);
  return reservacion.toJSON();
}

/* ------------------------------------------------------------------ */
/* Casos de uso                                                       */
/* ------------------------------------------------------------------ */

/** Cotizacion sin guardar (simulador de precio). */
async function cotizar(actor, data) {
  requireRole(actor);
  const input = validate(cotizarSchema, data);
  const { habitacion, mascota, datos } = await construirCotizacion(actor, input);
  return {
    mascota: { id: String(mascota._id), nombre: mascota.nombre },
    habitacion: { id: String(habitacion._id), numero: habitacion.numero, zona: habitacion.zona },
    fechaEntrada: datos.fechaEntrada,
    fechaSalida: datos.fechaSalida,
    noches: datos.noches,
    precioNoche: datos.precioNoche,
    servicios: datos.servicios,
    subtotalHospedaje: datos.subtotalHospedaje,
    subtotalServicios: datos.subtotalServicios,
    total: datos.total
  };
}

async function crear(actor, data) {
  requireRole(actor);
  const input = validate(crearSchema, data);
  const { datos } = await construirCotizacion(actor, input);
  const estado = input.confirmar ? E.CONFIRMADA : E.COTIZACION;
  const reservacion = await Reservacion.create({
    ...datos,
    pagado: 0,
    saldo: datos.total,
    estado,
    notas: input.notas || undefined,
    creadoPor: actor.id,
    historial: [{ estado, usuario: actor.id, nota: input.confirmar ? 'Reservación agendada' : 'Cotización guardada' }]
  });
  return respuesta(reservacion);
}

async function listar(actor, filtros = {}) {
  requireRole(actor);
  const { limit, skip } = paginar(filtros);
  const query = {};
  if (!esPersonal(actor)) query.tutor = actor.id;
  if (filtros.estado) {
    const estados = String(filtros.estado).split(',').map((s) => s.trim().toUpperCase());
    query.estado = { $in: estados };
  }
  if (filtros.zona) query.zona = filtros.zona;
  if (filtros.mascota) query.mascota = assertObjectId(filtros.mascota, 'mascota');
  if (filtros.habitacion) query.habitacion = assertObjectId(filtros.habitacion, 'habitacion');
  if (filtros.desde) query.fechaSalida = { $gt: inicioDelDia(filtros.desde) };
  if (filtros.hasta) query.fechaEntrada = { $lt: inicioDelDia(filtros.hasta) };
  const reservaciones = await Reservacion.find(query).sort({ fechaEntrada: -1 }).skip(skip).limit(limit).populate(POPULATE);
  return reservaciones.map((r) => r.toJSON());
}

async function obtener(actor, id) {
  requireRole(actor);
  const reservacion = await cargar(id);
  asegurarAcceso(actor, reservacion);
  return respuesta(reservacion);
}

async function actualizar(actor, id, data) {
  requireRole(actor);
  const input = validate(actualizarSchema, data);
  const reservacion = await cargar(id);
  asegurarAcceso(actor, reservacion);
  const editables = esPersonal(actor) ? [E.COTIZACION, E.CONFIRMADA, E.VALIDADA] : [E.COTIZACION, E.CONFIRMADA];
  exigirEstado(reservacion, editables, 'modificar');

  const cambiaLogistica = input.habitacion || input.fechaEntrada || input.fechaSalida || input.servicios;
  if (cambiaLogistica) {
    const nuevaHabitacion = input.habitacion || String(reservacion.habitacion);
    const { datos } = await construirCotizacion(actor, {
      mascota: String(reservacion.mascota),
      habitacion: nuevaHabitacion,
      fechaEntrada: input.fechaEntrada || reservacion.fechaEntrada,
      fechaSalida: input.fechaSalida || reservacion.fechaSalida,
      servicios: input.servicios || reservacion.servicios.map((s) => s.clave)
    }, reservacion._id);
    if (datos.total < reservacion.pagado) {
      throw conflict(`El nuevo total ($${datos.total}) es menor a lo ya pagado ($${reservacion.pagado})`);
    }
    Object.assign(reservacion, datos, { saldo: redondear(datos.total - reservacion.pagado) });
    if (reservacion.estado === E.VALIDADA) {
      reservacion.estado = E.CONFIRMADA;
      reservacion.validacionMedica = { aprobada: false };
      reservacion.historial.push({ estado: E.CONFIRMADA, usuario: actor.id, nota: 'Cambio de fechas/habitación: requiere nueva validación médica' });
    }
  }
  if (input.notas !== undefined) reservacion.notas = input.notas;
  await reservacion.save();
  return respuesta(reservacion);
}

async function confirmar(actor, id) {
  requireRole(actor);
  const reservacion = await cargar(id);
  asegurarAcceso(actor, reservacion);
  exigirEstado(reservacion, [E.COTIZACION], 'confirmar');
  if (!(await habitacionLibre(reservacion.habitacion, reservacion.fechaEntrada, reservacion.fechaSalida, reservacion._id))) {
    throw conflict('La habitación ya fue ocupada por otra reservación; genera una nueva cotización');
  }
  await mascotaSinTraslape(reservacion.mascota, reservacion.fechaEntrada, reservacion.fechaSalida, reservacion._id);
  reservacion.estado = E.CONFIRMADA;
  reservacion.historial.push({ estado: E.CONFIRMADA, usuario: actor.id, nota: 'Cotización confirmada' });
  await reservacion.save();
  return respuesta(reservacion);
}

async function validarMedica(actor, id, data = {}) {
  requireRole(actor, PERSONAL);
  const input = validate(notaSchema, data);
  const reservacion = await cargar(id);
  exigirEstado(reservacion, [E.CONFIRMADA], 'validar médicamente');
  const mascota = await Mascota.findById(reservacion.mascota);
  if (!mascota) throw notFound('La mascota de la reservación ya no existe');
  const vacunas = estadoVacunas(mascota, reservacion.fechaSalida);
  if (!vacunas.vigentes) {
    throw precondition('Validación médica rechazada: vacunas obligatorias faltantes o vencidas', vacunas);
  }
  reservacion.estado = E.VALIDADA;
  reservacion.validacionMedica = { aprobada: true, fecha: new Date(), validadoPor: actor.id, observaciones: input.observaciones || undefined };
  reservacion.historial.push({ estado: E.VALIDADA, usuario: actor.id, nota: 'Cartilla de vacunación vigente' });
  await reservacion.save();
  return respuesta(reservacion);
}

async function checkIn(actor, id, data = {}) {
  requireRole(actor, PERSONAL);
  const input = validate(notaSchema, data);
  const reservacion = await cargar(id);
  exigirEstado(reservacion, [E.VALIDADA], 'hacer check-in de');
  const habitacion = await Habitacion.findById(reservacion.habitacion);
  if (!habitacion) throw notFound('La habitación de la reservación ya no existe');
  if ([ESTADOS_HABITACION.OCUPADA, ESTADOS_HABITACION.MANTENIMIENTO].includes(habitacion.estado)) {
    throw conflict(`La habitación ${habitacion.numero} está ${habitacion.estado}; no es posible hacer check-in`);
  }
  habitacion.estado = ESTADOS_HABITACION.OCUPADA;
  await habitacion.save();
  reservacion.estado = E.EN_CURSO;
  reservacion.checkIn = { fecha: new Date(), usuario: actor.id, notas: input.notas || undefined };
  reservacion.historial.push({ estado: E.EN_CURSO, usuario: actor.id, nota: 'Check-in realizado' });
  await reservacion.save();
  return respuesta(reservacion);
}

async function registrarPago(actor, id, data) {
  requireRole(actor, PERSONAL);
  const input = validate(pagoSchema, data);
  const reservacion = await cargar(id);
  exigirEstado(reservacion, [E.CONFIRMADA, E.VALIDADA, E.EN_CURSO], 'registrar pagos en');
  if (input.monto > reservacion.saldo + 0.001) {
    throw badRequest(`El pago ($${input.monto}) excede el saldo pendiente ($${reservacion.saldo})`);
  }
  const movimiento = await cajaService.registrarMovimiento(actor, {
    tipo: 'INGRESO',
    categoria: 'RESERVACION',
    concepto: `Pago reservación ${reservacion.folio}`,
    monto: input.monto,
    metodoPago: input.metodo,
    reservacion: String(reservacion._id)
  });
  reservacion.pagos.push({
    monto: input.monto,
    metodo: input.metodo,
    referencia: input.referencia || undefined,
    registradoPor: actor.id,
    movimientoCaja: movimiento.id
  });
  reservacion.pagado = redondear(reservacion.pagado + input.monto);
  reservacion.saldo = redondear(Math.max(0, reservacion.total - reservacion.pagado));
  await reservacion.save();
  return respuesta(reservacion);
}

async function checkOut(actor, id, data = {}) {
  requireRole(actor, PERSONAL);
  const input = validate(notaSchema, data);
  const reservacion = await cargar(id);
  exigirEstado(reservacion, [E.EN_CURSO], 'hacer check-out de');
  if (reservacion.saldo > 0) {
    throw precondition(`No se puede hacer check-out: saldo pendiente de $${reservacion.saldo}. Liquida el saldo primero.`);
  }
  await Habitacion.updateOne({ _id: reservacion.habitacion }, { estado: ESTADOS_HABITACION.LIMPIEZA });
  reservacion.estado = E.FINALIZADA;
  reservacion.checkOut = { fecha: new Date(), usuario: actor.id, notas: input.notas || undefined };
  reservacion.historial.push({ estado: E.FINALIZADA, usuario: actor.id, nota: 'Check-out realizado' });
  await reservacion.save();
  return respuesta(reservacion);
}

async function cancelar(actor, id, data = {}) {
  requireRole(actor);
  const input = validate(notaSchema, data);
  const reservacion = await cargar(id);
  asegurarAcceso(actor, reservacion);
  exigirEstado(reservacion, [E.COTIZACION, E.CONFIRMADA, E.VALIDADA], 'cancelar');
  reservacion.estado = E.CANCELADA;
  reservacion.cancelacion = { fecha: new Date(), usuario: actor.id, motivo: input.motivo || 'Sin motivo especificado' };
  const nota = reservacion.pagado > 0 ? `Cancelada con $${reservacion.pagado} pagados (reembolso a revisión de administración)` : 'Cancelada';
  reservacion.historial.push({ estado: E.CANCELADA, usuario: actor.id, nota });
  await reservacion.save();
  return respuesta(reservacion);
}

async function eliminar(actor, id) {
  requireRole(actor, [ROLES.ADMIN]);
  const reservacion = await cargar(id);
  exigirEstado(reservacion, [E.COTIZACION, E.CANCELADA], 'eliminar');
  if (reservacion.pagado > 0) throw conflict('No se puede eliminar una reservación con pagos registrados (se conserva para auditoría)');
  await reservacion.deleteOne();
  return reservacion.toJSON();
}

module.exports = {
  cotizar,
  crear,
  listar,
  obtener,
  actualizar,
  confirmar,
  validarMedica,
  checkIn,
  registrarPago,
  checkOut,
  cancelar,
  eliminar
};

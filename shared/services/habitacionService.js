'use strict';

const Joi = require('joi');
const { Habitacion, Reservacion } = require('../models');
const {
  ROLES, ZONAS_LISTA, PLAN_HABITACIONES, MAX_HABITACIONES, ESTADOS_HABITACION, ESTADOS_QUE_OCUPAN
} = require('../config/constants');
const { validate, assertObjectId, inicioDelDia } = require('../utils/helpers');
const { notFound, conflict, precondition, badRequest } = require('../utils/errors');
const { requireRole } = require('./authService');

const PREFIJO_POR_ZONA = Object.fromEntries(PLAN_HABITACIONES.map((p) => [p.zona, p.prefijo]));

const crearSchema = Joi.object({
  numero: Joi.string().trim().uppercase().pattern(/^[A-Z]{3}-\d{2}$/).required()
    .messages({ 'string.pattern.base': 'El número debe tener formato AAA-00 (ej. VIP-07)' }),
  zona: Joi.string().valid(...ZONAS_LISTA).required(),
  capacidad: Joi.number().integer().min(1).max(4).default(1),
  precioNoche: Joi.number().min(0).required(),
  estado: Joi.string().valid(...Object.values(ESTADOS_HABITACION)).default(ESTADOS_HABITACION.DISPONIBLE),
  amenidades: Joi.array().items(Joi.string().trim().max(60)).default([]),
  notas: Joi.string().trim().max(500).allow('', null),
  activa: Joi.boolean().default(true)
});

const actualizarSchema = Joi.object({
  numero: Joi.string().trim().uppercase().pattern(/^[A-Z]{3}-\d{2}$/),
  zona: Joi.string().valid(...ZONAS_LISTA),
  capacidad: Joi.number().integer().min(1).max(4),
  precioNoche: Joi.number().min(0),
  estado: Joi.string().valid(...Object.values(ESTADOS_HABITACION)),
  amenidades: Joi.array().items(Joi.string().trim().max(60)),
  notas: Joi.string().trim().max(500).allow('', null),
  activa: Joi.boolean()
}).min(1);

/** Campos que STAFF puede modificar (operacion diaria). */
const CAMPOS_STAFF = ['estado', 'notas'];

function validarPrefijo(numero, zona) {
  const esperado = PREFIJO_POR_ZONA[zona];
  if (esperado && !numero.startsWith(`${esperado}-`)) {
    throw badRequest(`Las habitaciones de la zona "${zona}" deben usar el prefijo ${esperado}- (ej. ${esperado}-01)`);
  }
}

/** Ids de habitaciones ocupadas en un rango [entrada, salida). */
async function habitacionesOcupadasEnRango(entrada, salida, excluirReservacionId) {
  const query = {
    estado: { $in: ESTADOS_QUE_OCUPAN },
    fechaEntrada: { $lt: salida },
    fechaSalida: { $gt: entrada }
  };
  if (excluirReservacionId) query._id = { $ne: excluirReservacionId };
  const ids = await Reservacion.distinct('habitacion', query);
  return ids.map(String);
}

async function listar(actor, filtros = {}) {
  requireRole(actor);
  const query = {};
  if (filtros.zona) {
    if (!ZONAS_LISTA.includes(filtros.zona)) throw badRequest(`Zona inválida. Opciones: ${ZONAS_LISTA.join(', ')}`);
    query.zona = filtros.zona;
  }
  if (filtros.estado) query.estado = filtros.estado;
  if (filtros.activa !== undefined && filtros.activa !== null && filtros.activa !== '') {
    query.activa = String(filtros.activa) === 'true';
  }
  let habitaciones = await Habitacion.find(query).sort({ zona: 1, numero: 1 });

  if (filtros.disponibleDesde && filtros.disponibleHasta) {
    const entrada = inicioDelDia(filtros.disponibleDesde);
    const salida = inicioDelDia(filtros.disponibleHasta);
    if (Number.isNaN(entrada.getTime()) || Number.isNaN(salida.getTime()) || salida <= entrada) {
      throw badRequest('Rango de fechas de disponibilidad inválido');
    }
    const ocupadas = new Set(await habitacionesOcupadasEnRango(entrada, salida));
    habitaciones = habitaciones.filter(
      (h) => h.activa && h.estado !== ESTADOS_HABITACION.MANTENIMIENTO && !ocupadas.has(String(h._id))
    );
  }
  return habitaciones.map((h) => h.toJSON());
}

async function obtener(actor, id) {
  requireRole(actor);
  assertObjectId(id);
  const habitacion = await Habitacion.findById(id);
  if (!habitacion) throw notFound('Habitación no encontrada');
  return habitacion.toJSON();
}

async function crear(actor, data) {
  requireRole(actor, [ROLES.ADMIN]);
  const input = validate(crearSchema, data);
  validarPrefijo(input.numero, input.zona);
  const total = await Habitacion.countDocuments();
  if (total >= MAX_HABITACIONES) {
    throw precondition(`El hotel tiene un máximo físico de ${MAX_HABITACIONES} habitaciones (actualmente ${total}). Edita o elimina una existente.`);
  }
  const habitacion = await Habitacion.create(input);
  return habitacion.toJSON();
}

async function actualizar(actor, id, data) {
  requireRole(actor, [ROLES.ADMIN, ROLES.STAFF]);
  assertObjectId(id);
  const input = validate(actualizarSchema, data);
  if (actor.rol === ROLES.STAFF) {
    const prohibidos = Object.keys(input).filter((k) => !CAMPOS_STAFF.includes(k));
    if (prohibidos.length) {
      throw precondition(`STAFF solo puede modificar: ${CAMPOS_STAFF.join(', ')}. Campos no permitidos: ${prohibidos.join(', ')}`);
    }
  }
  const habitacion = await Habitacion.findById(id);
  if (!habitacion) throw notFound('Habitación no encontrada');
  const zona = input.zona || habitacion.zona;
  const numero = input.numero || habitacion.numero;
  if (input.zona || input.numero) validarPrefijo(numero, zona);
  if (input.zona && input.zona !== habitacion.zona) {
    const activas = await Reservacion.countDocuments({ habitacion: id, estado: { $in: ESTADOS_QUE_OCUPAN } });
    if (activas) throw conflict('No puedes cambiar de zona una habitación con reservaciones activas');
  }
  Object.assign(habitacion, input);
  await habitacion.save();
  return habitacion.toJSON();
}

async function eliminar(actor, id) {
  requireRole(actor, [ROLES.ADMIN]);
  assertObjectId(id);
  const habitacion = await Habitacion.findById(id);
  if (!habitacion) throw notFound('Habitación no encontrada');
  const activas = await Reservacion.countDocuments({ habitacion: id, estado: { $in: ESTADOS_QUE_OCUPAN } });
  if (activas) throw conflict(`La habitación tiene ${activas} reservación(es) activa(s); no se puede eliminar`);
  await habitacion.deleteOne();
  return habitacion.toJSON();
}

/** Resumen de ocupacion actual por zona (usado por dashboards). */
async function resumenPorZona(actor) {
  requireRole(actor);
  const resultado = await Habitacion.aggregate([
    { $group: { _id: { zona: '$zona', estado: '$estado' }, total: { $sum: 1 } } }
  ]);
  return ZONAS_LISTA.map((zona) => {
    const filas = resultado.filter((r) => r._id.zona === zona);
    const porEstado = Object.fromEntries(Object.values(ESTADOS_HABITACION).map((e) => [e, 0]));
    filas.forEach((f) => { porEstado[f._id.estado] = f.total; });
    const total = filas.reduce((acc, f) => acc + f.total, 0);
    return { zona, total, ...porEstado };
  });
}

module.exports = { listar, obtener, crear, actualizar, eliminar, resumenPorZona, habitacionesOcupadasEnRango };

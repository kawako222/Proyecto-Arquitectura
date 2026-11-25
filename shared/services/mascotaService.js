'use strict';

const Joi = require('joi');
const { Mascota, Usuario, Reservacion } = require('../models');
const { ROLES, VACUNAS_OBLIGATORIAS, ESTADOS_QUE_OCUPAN, EDAD_GERIATRICA } = require('../config/constants');
const { validate, assertObjectId } = require('../utils/helpers');
const { notFound, forbidden, conflict, badRequest } = require('../utils/errors');
const { requireRole, esPersonal } = require('./authService');

const vacunaSchema = Joi.object({
  nombre: Joi.string().trim().max(60).required(),
  fechaAplicacion: Joi.date().iso().required(),
  fechaVencimiento: Joi.date().iso().greater(Joi.ref('fechaAplicacion')).required()
    .messages({ 'date.greater': 'La fecha de vencimiento debe ser posterior a la de aplicación' })
});

const condicionesSchema = Joi.object({
  geriatrico: Joi.boolean(),
  sensiblePirotecnia: Joi.boolean(),
  necesidadesEspeciales: Joi.boolean(),
  descripcion: Joi.string().trim().max(500).allow('', null)
});

const base = {
  nombre: Joi.string().trim().min(1).max(60),
  especie: Joi.string().trim().max(30),
  raza: Joi.string().trim().max(60),
  sexo: Joi.string().valid('MACHO', 'HEMBRA'),
  edad: Joi.number().min(0).max(30),
  pesoKg: Joi.number().min(0.5).max(120),
  tamano: Joi.string().valid('CHICO', 'MEDIANO', 'GRANDE', 'GIGANTE'),
  tutor: Joi.string().hex().length(24),
  condiciones: condicionesSchema,
  vacunas: Joi.array().items(vacunaSchema),
  alergias: Joi.array().items(Joi.string().trim().max(60)),
  notasMedicas: Joi.string().trim().max(1000).allow('', null),
  veterinarioContacto: Joi.string().trim().max(120).allow('', null),
  activa: Joi.boolean()
};

const crearSchema = Joi.object({
  ...base,
  nombre: base.nombre.required(),
  sexo: base.sexo.required(),
  edad: base.edad.required(),
  pesoKg: base.pesoKg.required(),
  tamano: base.tamano.required()
});

const actualizarSchema = Joi.object(base).min(1);

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Verifica que todas las vacunas obligatorias esten vigentes hasta "fechaHasta".
 */
function estadoVacunas(mascota, fechaHasta = new Date()) {
  const limite = new Date(fechaHasta);
  const faltantes = [];
  const vencidas = [];
  VACUNAS_OBLIGATORIAS.forEach((obligatoria) => {
    const registros = (mascota.vacunas || []).filter((v) => normalizar(v.nombre) === normalizar(obligatoria));
    if (!registros.length) {
      faltantes.push(obligatoria);
      return;
    }
    const masReciente = registros.reduce((a, b) => (new Date(a.fechaVencimiento) > new Date(b.fechaVencimiento) ? a : b));
    if (new Date(masReciente.fechaVencimiento) < limite) vencidas.push(obligatoria);
  });
  return { vigentes: faltantes.length === 0 && vencidas.length === 0, faltantes, vencidas, revisadoHasta: limite };
}

function esGeriatrica(mascota) {
  return Boolean(mascota.condiciones && mascota.condiciones.geriatrico) || Number(mascota.edad) >= EDAD_GERIATRICA;
}

function asegurarAcceso(actor, mascota) {
  if (esPersonal(actor)) return;
  if (String(mascota.tutor && mascota.tutor._id ? mascota.tutor._id : mascota.tutor) !== String(actor.id)) {
    throw forbidden('Solo puedes consultar o modificar tus propias mascotas');
  }
}

async function validarTutor(tutorId) {
  assertObjectId(tutorId, 'tutor');
  const tutor = await Usuario.findById(tutorId);
  if (!tutor || !tutor.activo) throw badRequest('El tutor indicado no existe o está inactivo');
  if (tutor.rol !== ROLES.CLIENTE) throw badRequest('El tutor debe ser un usuario con rol CLIENTE');
  return tutor;
}

async function listar(actor, filtros = {}) {
  requireRole(actor);
  const query = {};
  if (!esPersonal(actor)) {
    query.tutor = actor.id;
  } else if (filtros.tutor) {
    query.tutor = assertObjectId(filtros.tutor, 'tutor');
  }
  if (filtros.nombre) query.nombre = { $regex: String(filtros.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (filtros.activa !== undefined && filtros.activa !== null && filtros.activa !== '') {
    query.activa = String(filtros.activa) === 'true';
  }
  const mascotas = await Mascota.find(query).populate('tutor', 'nombre email telefono').sort({ nombre: 1 });
  return mascotas.map((m) => m.toJSON());
}

async function obtener(actor, id) {
  requireRole(actor);
  assertObjectId(id);
  const mascota = await Mascota.findById(id).populate('tutor', 'nombre email telefono');
  if (!mascota) throw notFound('Mascota no encontrada');
  asegurarAcceso(actor, mascota);
  return { ...mascota.toJSON(), estadoVacunas: estadoVacunas(mascota) };
}

async function crear(actor, data) {
  requireRole(actor);
  const input = validate(crearSchema, data);
  if (esPersonal(actor)) {
    if (!input.tutor) throw badRequest('Debes indicar el tutor (id de usuario CLIENTE)');
    await validarTutor(input.tutor);
  } else {
    input.tutor = actor.id;
  }
  const mascota = await Mascota.create(input);
  await mascota.populate('tutor', 'nombre email telefono');
  return mascota.toJSON();
}

async function actualizar(actor, id, data) {
  requireRole(actor);
  assertObjectId(id);
  const input = validate(actualizarSchema, data);
  const mascota = await Mascota.findById(id);
  if (!mascota) throw notFound('Mascota no encontrada');
  asegurarAcceso(actor, mascota);
  if (input.tutor) {
    if (!esPersonal(actor)) throw forbidden('Solo el personal puede reasignar el tutor');
    await validarTutor(input.tutor);
  }
  if (input.condiciones) {
    input.condiciones = { ...(mascota.condiciones ? mascota.condiciones.toObject() : {}), ...input.condiciones };
  }
  Object.assign(mascota, input);
  await mascota.save();
  await mascota.populate('tutor', 'nombre email telefono');
  return mascota.toJSON();
}

async function eliminar(actor, id) {
  requireRole(actor);
  assertObjectId(id);
  const mascota = await Mascota.findById(id);
  if (!mascota) throw notFound('Mascota no encontrada');
  asegurarAcceso(actor, mascota);
  const activas = await Reservacion.countDocuments({ mascota: id, estado: { $in: ESTADOS_QUE_OCUPAN } });
  if (activas) throw conflict('La mascota tiene reservaciones activas; cancélalas o finalízalas primero');
  await mascota.deleteOne();
  return mascota.toJSON();
}

module.exports = { listar, obtener, crear, actualizar, eliminar, estadoVacunas, esGeriatrica, asegurarAcceso };

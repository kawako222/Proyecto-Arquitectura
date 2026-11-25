'use strict';

const mongoose = require('mongoose');
const { badRequest } = require('./errors');

const MS_DIA = 24 * 60 * 60 * 1000;

/** Valida datos contra un esquema Joi y devuelve el valor limpio. */
function validate(schema, data) {
  const { value, error } = schema.validate(data ?? {}, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) throw error;
  return value;
}

/** Lanza 400 si el id no es un ObjectId valido. */
function assertObjectId(id, campo = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw badRequest(`El campo ${campo} no es un ObjectId válido`);
  }
  return String(id);
}

/** Normaliza una fecha a las 00:00 UTC del mismo dia. */
function inicioDelDia(fecha) {
  const d = new Date(fecha);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Numero de noches entre dos fechas (minimo 1). */
function calcularNoches(fechaEntrada, fechaSalida) {
  const diff = inicioDelDia(fechaSalida).getTime() - inicioDelDia(fechaEntrada).getTime();
  return Math.max(1, Math.round(diff / MS_DIA));
}

function redondear(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Paginacion comun para listados. */
function paginar({ page = 1, limit = 50 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  return { page: p, limit: l, skip: (p - 1) * l };
}

/** Convierte un documento Mongoose a objeto plano con id string. */
function toPlain(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return obj;
}

module.exports = { validate, assertObjectId, inicioDelDia, calcularNoches, redondear, paginar, toPlain, MS_DIA };

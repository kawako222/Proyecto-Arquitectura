'use strict';

/**
 * Error de dominio independiente del protocolo.
 * Cada API lo traduce: REST -> HTTP status, GraphQL -> extensions.code, gRPC -> status code.
 */
class AppError extends Error {
  constructor(message, code = 'INTERNAL', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

const ERROR_CODES = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PRECONDITION: 'PRECONDITION',
  INTERNAL: 'INTERNAL'
});

const HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION: 412,
  INTERNAL: 500
});

const badRequest = (msg, details) => new AppError(msg, ERROR_CODES.BAD_REQUEST, details);
const validation = (msg, details) => new AppError(msg, ERROR_CODES.VALIDATION, details);
const unauthenticated = (msg = 'Debes iniciar sesión') => new AppError(msg, ERROR_CODES.UNAUTHENTICATED);
const forbidden = (msg = 'No tienes permisos para esta acción') => new AppError(msg, ERROR_CODES.FORBIDDEN);
const notFound = (msg = 'Recurso no encontrado') => new AppError(msg, ERROR_CODES.NOT_FOUND);
const conflict = (msg, details) => new AppError(msg, ERROR_CODES.CONFLICT, details);
const precondition = (msg, details) => new AppError(msg, ERROR_CODES.PRECONDITION, details);

/**
 * Normaliza errores de Mongoose/Mongo/Joi a AppError.
 */
function normalizeError(err) {
  if (err instanceof AppError) return err;
  if (err && err.isJoi) {
    return validation('Datos inválidos', err.details.map((d) => ({ campo: d.path.join('.'), mensaje: d.message })));
  }
  if (err && err.name === 'ValidationError' && err.errors) {
    return validation('Datos inválidos', Object.values(err.errors).map((e) => ({ campo: e.path, mensaje: e.message })));
  }
  if (err && err.name === 'CastError') {
    return badRequest(`Valor inválido para ${err.path}: ${err.value}`);
  }
  if (err && err.code === 11000) {
    const campos = Object.keys(err.keyValue || {}).join(', ');
    return conflict(`Ya existe un registro con ese valor único (${campos})`, err.keyValue);
  }
  const internal = new AppError('Error interno del servidor', ERROR_CODES.INTERNAL);
  internal.original = err;
  return internal;
}

module.exports = {
  AppError,
  ERROR_CODES,
  HTTP_STATUS,
  badRequest,
  validation,
  unauthenticated,
  forbidden,
  notFound,
  conflict,
  precondition,
  normalizeError
};

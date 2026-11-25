'use strict';

const { normalizeError, HTTP_STATUS } = require('../../../../shared/utils/errors');

function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'JSON mal formado en el cuerpo de la petición' } });
  }
  const appError = normalizeError(err);
  const status = HTTP_STATUS[appError.code] || 500;
  if (status >= 500) console.error('[rest-api] Error no controlado:', appError.original || err);
  return res.status(status).json({
    ok: false,
    error: { code: appError.code, message: appError.message, ...(appError.details ? { details: appError.details } : {}) }
  });
}

module.exports = { notFoundHandler, errorHandler };

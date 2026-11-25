'use strict';

const { authService } = require('../../../../shared/services');

const COOKIE_NAME = process.env.COOKIE_NAME || 'nana_token';

/** Extrae el JWT de la cookie HttpOnly o del header Authorization: Bearer. */
function extraerToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Adjunta req.actor (o null). La autorizacion fina la hace la capa de servicios. */
function adjuntarActor(req, _res, next) {
  req.actor = authService.actorOpcional(extraerToken(req));
  next();
}

/** Exige sesion y, opcionalmente, roles especificos. */
function requireAuth(...roles) {
  return (req, _res, next) => {
    authService.requireRole(req.actor, roles);
    next();
  };
}

function opcionesCookie() {
  return {
    httpOnly: true,
    secure: String(process.env.COOKIE_SECURE) === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  };
}

module.exports = { COOKIE_NAME, extraerToken, adjuntarActor, requireAuth, opcionesCookie };

'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { Usuario } = require('../models');
const { ROLES } = require('../config/constants');
const { validate, assertObjectId } = require('../utils/helpers');
const { unauthenticated, forbidden, notFound, conflict } = require('../utils/errors');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET no esta definido o es demasiado corto (minimo 16 caracteres)');
  }
  return secret;
}

const passwordRule = Joi.string().min(8).max(72)
  .pattern(/[A-Za-z]/, 'letra')
  .pattern(/\d/, 'numero')
  .messages({ 'string.pattern.name': 'La contraseña debe incluir al menos una {#name}' });

const registroSchema = Joi.object({
  nombre: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: passwordRule.required(),
  telefono: Joi.string().trim().max(20).allow('', null)
});

const crearUsuarioSchema = registroSchema.keys({
  rol: Joi.string().valid(...Object.values(ROLES)).default(ROLES.CLIENTE)
});

const actualizarUsuarioSchema = Joi.object({
  nombre: Joi.string().trim().min(2).max(120),
  telefono: Joi.string().trim().max(20).allow('', null),
  rol: Joi.string().valid(...Object.values(ROLES)),
  activo: Joi.boolean(),
  password: passwordRule
}).min(1);

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required()
});

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function firmarToken(usuario) {
  return jwt.sign(
    { sub: String(usuario._id || usuario.id), rol: usuario.rol, nombre: usuario.nombre, email: usuario.email },
    jwtSecret(),
    { expiresIn: JWT_EXPIRES_IN, issuer: 'la-casa-de-la-nana' }
  );
}

/** Verifica un JWT y devuelve el "actor" que usan todos los servicios. */
function verificarToken(token) {
  if (!token) throw unauthenticated();
  try {
    const payload = jwt.verify(token, jwtSecret(), { issuer: 'la-casa-de-la-nana' });
    return { id: payload.sub, rol: payload.rol, nombre: payload.nombre, email: payload.email };
  } catch (err) {
    throw unauthenticated('Sesión inválida o expirada');
  }
}

/** Devuelve el actor o null si el token no existe o es invalido (para contextos opcionales). */
function actorOpcional(token) {
  if (!token) return null;
  try {
    return verificarToken(token);
  } catch (err) {
    return null;
  }
}

/** RBAC: exige sesion y (opcionalmente) uno de los roles indicados. */
function requireRole(actor, roles = []) {
  if (!actor) throw unauthenticated();
  if (roles.length && !roles.includes(actor.rol)) {
    throw forbidden(`Acción permitida solo para: ${roles.join(', ')}`);
  }
  return actor;
}

const esPersonal = (actor) => !!actor && (actor.rol === ROLES.ADMIN || actor.rol === ROLES.STAFF);

async function registrar(data) {
  const input = validate(registroSchema, data);
  const existe = await Usuario.exists({ email: input.email });
  if (existe) throw conflict('Ya existe una cuenta con ese email');
  const usuario = await Usuario.create({
    nombre: input.nombre,
    email: input.email,
    telefono: input.telefono || undefined,
    passwordHash: await hashPassword(input.password),
    rol: ROLES.CLIENTE
  });
  return { usuario: usuario.toJSON(), token: firmarToken(usuario) };
}

async function login(data) {
  const { email, password } = validate(loginSchema, data);
  const usuario = await Usuario.findOne({ email }).select('+passwordHash');
  const ok = usuario && usuario.activo && (await bcrypt.compare(password, usuario.passwordHash));
  if (!ok) throw unauthenticated('Credenciales incorrectas');
  usuario.ultimoAcceso = new Date();
  await usuario.save();
  return { usuario: usuario.toJSON(), token: firmarToken(usuario) };
}

async function perfil(actor) {
  requireRole(actor);
  const usuario = await Usuario.findById(actor.id);
  if (!usuario) throw notFound('Usuario no encontrado');
  return usuario.toJSON();
}

async function listarUsuarios(actor, filtros = {}) {
  requireRole(actor, [ROLES.ADMIN, ROLES.STAFF]);
  const query = {};
  if (filtros.rol) query.rol = filtros.rol;
  if (actor.rol === ROLES.STAFF) query.rol = ROLES.CLIENTE;
  const usuarios = await Usuario.find(query).sort({ nombre: 1 });
  return usuarios.map((u) => u.toJSON());
}

async function crearUsuario(actor, data) {
  requireRole(actor, [ROLES.ADMIN]);
  const input = validate(crearUsuarioSchema, data);
  if (await Usuario.exists({ email: input.email })) throw conflict('Ya existe una cuenta con ese email');
  const usuario = await Usuario.create({
    nombre: input.nombre,
    email: input.email,
    telefono: input.telefono || undefined,
    rol: input.rol,
    passwordHash: await hashPassword(input.password)
  });
  return usuario.toJSON();
}

async function actualizarUsuario(actor, id, data) {
  requireRole(actor, [ROLES.ADMIN]);
  assertObjectId(id);
  const input = validate(actualizarUsuarioSchema, data);
  const usuario = await Usuario.findById(id);
  if (!usuario) throw notFound('Usuario no encontrado');
  if (input.password) {
    usuario.passwordHash = await hashPassword(input.password);
    delete input.password;
  }
  Object.assign(usuario, input);
  await usuario.save();
  return usuario.toJSON();
}

async function eliminarUsuario(actor, id) {
  requireRole(actor, [ROLES.ADMIN]);
  assertObjectId(id);
  if (String(actor.id) === String(id)) throw forbidden('No puedes eliminar tu propia cuenta');
  const usuario = await Usuario.findById(id);
  if (!usuario) throw notFound('Usuario no encontrado');
  usuario.activo = false;
  await usuario.save();
  return usuario.toJSON();
}

module.exports = {
  hashPassword,
  firmarToken,
  verificarToken,
  actorOpcional,
  requireRole,
  esPersonal,
  registrar,
  login,
  perfil,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
};

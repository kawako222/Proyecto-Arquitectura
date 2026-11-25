'use strict';

const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const {
  authService, habitacionService, mascotaService, reservacionService, cajaService, kpiService
} = require('../../../../shared/services');
const { Usuario, Mascota, Habitacion } = require('../../../../shared/models');
const { normalizeError } = require('../../../../shared/utils/errors');
const { DateTime, JSONScalar } = require('./scalars');

const COOKIE_NAME = process.env.COOKIE_NAME || 'nana_token';

/** Convierte input de GraphQL (prototipo nulo) en objeto plano y elimina nulls. */
function plano(obj) {
  if (obj === null || obj === undefined) return {};
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === null ? undefined : v)));
}

function aGraphQLError(err) {
  const e = normalizeError(err);
  if (e.code === 'INTERNAL') console.error('[graphql-api] Error no controlado:', e.original || err);
  return new GraphQLError(e.message, { extensions: { code: e.code, ...(e.details ? { details: e.details } : {}) } });
}

/** Envuelve cada resolver raiz para traducir errores de dominio. */
function envolver(mapa) {
  return Object.fromEntries(Object.entries(mapa).map(([nombre, fn]) => [nombre, async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      throw aGraphQLError(err);
    }
  }]));
}

const idDe = (valor) => (valor && valor._id ? String(valor._id) : valor && valor.id ? String(valor.id) : String(valor));
const esReferencia = (valor) => valor instanceof mongoose.Types.ObjectId || typeof valor === 'string';

/** Resuelve un campo que puede venir poblado o como ObjectId. */
function referencia(Model, campos, campoTest) {
  return async (padre, _args, _ctx, info) => {
    const valor = padre[info.fieldName];
    if (!valor) return null;
    if (!esReferencia(valor) && valor[campoTest] !== undefined) return { ...valor, id: idDe(valor) };
    const doc = await Model.findById(idDe(valor)).select(campos).lean();
    return doc ? { ...doc, id: String(doc._id) } : { id: idDe(valor) };
  };
}

const opcionesCookie = () => ({
  httpOnly: true,
  secure: String(process.env.COOKIE_SECURE) === 'true',
  sameSite: 'lax',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
});

const Query = envolver({
  me: (_p, _a, { actor }) => authService.perfil(actor),
  usuarios: (_p, args, { actor }) => authService.listarUsuarios(actor, plano(args)),

  habitaciones: (_p, args, { actor }) => habitacionService.listar(actor, plano(args)),
  habitacion: (_p, { id }, { actor }) => habitacionService.obtener(actor, id),
  resumenZonas: (_p, _a, { actor }) => habitacionService.resumenPorZona(actor),

  mascotas: (_p, args, { actor }) => mascotaService.listar(actor, plano(args)),
  mascota: (_p, { id }, { actor }) => mascotaService.obtener(actor, id),

  reservaciones: (_p, args, { actor }) => reservacionService.listar(actor, plano(args)),
  reservacion: (_p, { id }, { actor }) => reservacionService.obtener(actor, id),
  cotizarReservacion: (_p, { input }, { actor }) => reservacionService.cotizar(actor, plano(input)),

  estadoCaja: (_p, _a, { actor }) => cajaService.estadoActual(actor),
  turnosCaja: (_p, args, { actor }) => cajaService.listarTurnos(actor, plano(args)),
  movimientosCaja: (_p, args, { actor }) => cajaService.listarMovimientos(actor, plano(args)),

  kpis: (_p, { rango }, { actor }) => kpiService.resumen(actor, plano(rango))
});

const Mutation = envolver({
  registro: async (_p, args, { res }) => {
    const r = await authService.registrar(plano(args));
    res.cookie(COOKIE_NAME, r.token, opcionesCookie());
    return r;
  },
  login: async (_p, args, { res }) => {
    const r = await authService.login(plano(args));
    res.cookie(COOKIE_NAME, r.token, opcionesCookie());
    return r;
  },
  logout: (_p, _a, { res }) => {
    const { maxAge, ...opciones } = opcionesCookie();
    res.clearCookie(COOKIE_NAME, opciones);
    return true;
  },

  crearHabitacion: (_p, { input }, { actor }) => habitacionService.crear(actor, plano(input)),
  actualizarHabitacion: (_p, { id, input }, { actor }) => habitacionService.actualizar(actor, id, plano(input)),
  eliminarHabitacion: (_p, { id }, { actor }) => habitacionService.eliminar(actor, id),

  crearMascota: (_p, { input }, { actor }) => mascotaService.crear(actor, plano(input)),
  actualizarMascota: (_p, { id, input }, { actor }) => mascotaService.actualizar(actor, id, plano(input)),
  eliminarMascota: (_p, { id }, { actor }) => mascotaService.eliminar(actor, id),

  crearReservacion: (_p, { input }, { actor }) => reservacionService.crear(actor, plano(input)),
  actualizarReservacion: (_p, { id, input }, { actor }) => reservacionService.actualizar(actor, id, plano(input)),
  eliminarReservacion: (_p, { id }, { actor }) => reservacionService.eliminar(actor, id),
  confirmarReservacion: (_p, { id }, { actor }) => reservacionService.confirmar(actor, id),
  validarMedica: (_p, { id, observaciones }, { actor }) => reservacionService.validarMedica(actor, id, plano({ observaciones })),
  checkIn: (_p, { id, notas }, { actor }) => reservacionService.checkIn(actor, id, plano({ notas })),
  registrarPago: (_p, { id, input }, { actor }) => reservacionService.registrarPago(actor, id, plano(input)),
  checkOut: (_p, { id, notas }, { actor }) => reservacionService.checkOut(actor, id, plano({ notas })),
  cancelarReservacion: (_p, { id, motivo }, { actor }) => reservacionService.cancelar(actor, id, plano({ motivo })),

  abrirTurnoCaja: (_p, args, { actor }) => cajaService.abrirTurno(actor, plano(args)),
  cerrarTurnoCaja: (_p, args, { actor }) => cajaService.cerrarTurno(actor, plano(args)),
  registrarMovimientoCaja: (_p, { input }, { actor }) => cajaService.registrarMovimiento(actor, plano(input))
});

const resolvers = {
  DateTime,
  JSON: JSONScalar,
  Query,
  Mutation,
  Mascota: {
    id: (p) => idDe(p),
    tutor: referencia(Usuario, 'nombre email telefono', 'nombre'),
    vacunas: (p) => p.vacunas || [],
    alergias: (p) => p.alergias || [],
    estadoVacunas: (p) => p.estadoVacunas || mascotaService.estadoVacunas(p)
  },
  Reservacion: {
    id: (p) => idDe(p),
    mascota: referencia(Mascota, 'nombre raza edad tamano', 'nombre'),
    tutor: referencia(Usuario, 'nombre email telefono', 'nombre'),
    habitacion: referencia(Habitacion, 'numero zona precioNoche estado', 'numero')
  },
  Pago: { id: (p) => (p._id ? String(p._id) : p.id || null) },
  MovimientoCaja: { turno: (p) => idDe(p.turno) }
};

module.exports = { resolvers };

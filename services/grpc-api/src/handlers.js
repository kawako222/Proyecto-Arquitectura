'use strict';

const { grpc } = require('./protoLoader');
const {
  authService, habitacionService, mascotaService, reservacionService
} = require('../../../shared/services');
const { normalizeError } = require('../../../shared/utils/errors');
const m = require('./mappers');

const GRPC_CODES = {
  BAD_REQUEST: grpc.status.INVALID_ARGUMENT,
  VALIDATION: grpc.status.INVALID_ARGUMENT,
  UNAUTHENTICATED: grpc.status.UNAUTHENTICATED,
  FORBIDDEN: grpc.status.PERMISSION_DENIED,
  NOT_FOUND: grpc.status.NOT_FOUND,
  CONFLICT: grpc.status.ABORTED,
  PRECONDITION: grpc.status.FAILED_PRECONDITION,
  INTERNAL: grpc.status.INTERNAL
};

/** Lee "authorization: Bearer <token>" de la metadata gRPC. */
function actorDe(call) {
  const valor = call.metadata.get('authorization')[0];
  const token = valor && String(valor).startsWith('Bearer ') ? String(valor).slice(7).trim() : null;
  return authService.actorOpcional(token);
}

/** Envuelve un handler unario: resuelve actor, ejecuta y traduce errores a status gRPC. */
function unario(fn) {
  return async (call, callback) => {
    try {
      const resultado = await fn(call.request, actorDe(call));
      callback(null, resultado);
    } catch (err) {
      const e = normalizeError(err);
      if (e.code === 'INTERNAL') console.error('[grpc-api] Error no controlado:', e.original || err);
      const metadata = new grpc.Metadata();
      metadata.set('error-code', e.code);
      if (e.details) metadata.set('error-details', JSON.stringify(e.details));
      callback({ code: GRPC_CODES[e.code] || grpc.status.UNKNOWN, message: e.message, metadata });
    }
  };
}

const AuthService = {
  Login: unario(async (req) => {
    const { usuario, token } = await authService.login({ email: req.email, password: req.password });
    return { token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } };
  })
};

const HabitacionService = {
  Create: unario(async (req, actor) => m.habitacionAMsg(await habitacionService.crear(actor, m.habitacionInputADominio(req, false)))),
  Get: unario(async (req, actor) => m.habitacionAMsg(await habitacionService.obtener(actor, req.id))),
  List: unario(async (req, actor) => {
    const items = await habitacionService.listar(actor, m.limpiarOpcionales(req));
    return { items: items.map(m.habitacionAMsg), total: items.length };
  }),
  Update: unario(async (req, actor) => m.habitacionAMsg(await habitacionService.actualizar(actor, req.id, m.habitacionInputADominio(req.data, true)))),
  Delete: unario(async (req, actor) => {
    const h = await habitacionService.eliminar(actor, req.id);
    return { ok: true, id: h.id, mensaje: `Habitación ${h.numero} eliminada` };
  })
};

const MascotaService = {
  Create: unario(async (req, actor) => {
    const creada = await mascotaService.crear(actor, m.mascotaInputADominio(req, false));
    return m.mascotaAMsg({ ...creada, estadoVacunas: mascotaService.estadoVacunas(creada) });
  }),
  Get: unario(async (req, actor) => m.mascotaAMsg(await mascotaService.obtener(actor, req.id))),
  List: unario(async (req, actor) => {
    const filtros = m.limpiarOpcionales(req);
    if (filtros.tutorId) filtros.tutor = filtros.tutorId;
    const items = await mascotaService.listar(actor, filtros);
    return { items: items.map((x) => m.mascotaAMsg({ ...x, estadoVacunas: mascotaService.estadoVacunas(x) })), total: items.length };
  }),
  Update: unario(async (req, actor) => {
    const actualizada = await mascotaService.actualizar(actor, req.id, m.mascotaInputADominio(req.data, true));
    return m.mascotaAMsg({ ...actualizada, estadoVacunas: mascotaService.estadoVacunas(actualizada) });
  }),
  Delete: unario(async (req, actor) => {
    const x = await mascotaService.eliminar(actor, req.id);
    return { ok: true, id: x.id, mensaje: `Mascota ${x.nombre} eliminada` };
  })
};

const ReservacionService = {
  Create: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.crear(actor, m.reservacionInputADominio(req)))),
  Get: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.obtener(actor, req.id))),
  List: unario(async (req, actor) => {
    const filtros = m.limpiarOpcionales(req);
    if (filtros.mascotaId) filtros.mascota = filtros.mascotaId;
    delete filtros.mascotaId;
    const items = await reservacionService.listar(actor, filtros);
    return { items: items.map(m.reservacionAMsg), total: items.length };
  }),
  Update: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.actualizar(actor, req.id, m.reservacionUpdateADominio(req.data)))),
  Delete: unario(async (req, actor) => {
    const r = await reservacionService.eliminar(actor, req.id);
    return { ok: true, id: r.id, mensaje: `Reservación ${r.folio} eliminada` };
  }),
  Cotizar: unario(async (req, actor) => {
    const { confirmar, ...datos } = m.reservacionInputADominio(req);
    return m.cotizacionAMsg(await reservacionService.cotizar(actor, datos));
  }),
  Confirmar: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.confirmar(actor, req.id))),
  ValidarMedica: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.validarMedica(actor, req.id, { observaciones: req.nota || undefined }))),
  CheckIn: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.checkIn(actor, req.id, { notas: req.nota || undefined }))),
  RegistrarPago: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.registrarPago(actor, req.id, {
    monto: req.monto, metodo: req.metodo, referencia: req.referencia || undefined
  }))),
  CheckOut: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.checkOut(actor, req.id, { notas: req.nota || undefined }))),
  Cancelar: unario(async (req, actor) => m.reservacionAMsg(await reservacionService.cancelar(actor, req.id, { motivo: req.nota || undefined })))
};

module.exports = { AuthService, HabitacionService, MascotaService, ReservacionService };

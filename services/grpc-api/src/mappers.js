'use strict';

/**
 * Conversiones entre documentos del dominio y mensajes protobuf.
 * Los nombres ya llegan en camelCase gracias a keepCase:false.
 */

const iso = (v) => (v ? new Date(v).toISOString() : '');
const idDe = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.id) return String(v.id);
  if (v._id) return String(v._id);
  return String(v);
};
const campo = (v, nombre) => (v && typeof v === 'object' && v[nombre] !== undefined ? v[nombre] : '');

/** Quita las claves virtuales "_campo" que agrega oneofs:true y los undefined. */
function limpiarOpcionales(obj) {
  if (!obj) return {};
  return Object.fromEntries(Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && v !== undefined && v !== null));
}

function habitacionAMsg(h) {
  return {
    id: idDe(h),
    numero: h.numero,
    zona: h.zona,
    capacidad: h.capacidad,
    precioNoche: h.precioNoche,
    estado: h.estado,
    amenidades: h.amenidades || [],
    notas: h.notas || '',
    activa: Boolean(h.activa),
    createdAt: iso(h.createdAt),
    updatedAt: iso(h.updatedAt)
  };
}

function habitacionInputADominio(data, esUpdate) {
  const input = limpiarOpcionales(data);
  const { reemplazarAmenidades, amenidades, ...resto } = input;
  if (!esUpdate || reemplazarAmenidades) resto.amenidades = amenidades || [];
  return resto;
}

function mascotaAMsg(m) {
  const c = m.condiciones || {};
  const ev = m.estadoVacunas || { vigentes: false, faltantes: [], vencidas: [] };
  return {
    id: idDe(m),
    nombre: m.nombre,
    especie: m.especie || '',
    raza: m.raza || '',
    sexo: m.sexo,
    edad: m.edad,
    pesoKg: m.pesoKg,
    tamano: m.tamano,
    tutorId: idDe(m.tutor),
    tutorNombre: campo(m.tutor, 'nombre'),
    condiciones: {
      geriatrico: Boolean(c.geriatrico),
      sensiblePirotecnia: Boolean(c.sensiblePirotecnia),
      necesidadesEspeciales: Boolean(c.necesidadesEspeciales),
      descripcion: c.descripcion || ''
    },
    vacunas: (m.vacunas || []).map((v) => ({ nombre: v.nombre, fechaAplicacion: iso(v.fechaAplicacion), fechaVencimiento: iso(v.fechaVencimiento) })),
    alergias: m.alergias || [],
    notasMedicas: m.notasMedicas || '',
    veterinarioContacto: m.veterinarioContacto || '',
    activa: Boolean(m.activa),
    estadoVacunas: { vigentes: Boolean(ev.vigentes), faltantes: ev.faltantes || [], vencidas: ev.vencidas || [] },
    createdAt: iso(m.createdAt)
  };
}

function mascotaInputADominio(data, esUpdate) {
  const input = limpiarOpcionales(data);
  const { tutorId, reemplazarVacunas, reemplazarAlergias, vacunas, alergias, condiciones, ...resto } = input;
  if (tutorId) resto.tutor = tutorId;
  if (condiciones) resto.condiciones = condiciones;
  if (!esUpdate || reemplazarVacunas) resto.vacunas = vacunas || [];
  if (!esUpdate || reemplazarAlergias) resto.alergias = alergias || [];
  return resto;
}

function reservacionAMsg(r) {
  return {
    id: idDe(r),
    folio: r.folio,
    mascotaId: idDe(r.mascota),
    mascotaNombre: campo(r.mascota, 'nombre'),
    tutorId: idDe(r.tutor),
    tutorNombre: campo(r.tutor, 'nombre'),
    habitacionId: idDe(r.habitacion),
    habitacionNumero: campo(r.habitacion, 'numero'),
    zona: r.zona,
    fechaEntrada: iso(r.fechaEntrada),
    fechaSalida: iso(r.fechaSalida),
    noches: r.noches,
    precioNoche: r.precioNoche,
    servicios: r.servicios || [],
    subtotalHospedaje: r.subtotalHospedaje,
    subtotalServicios: r.subtotalServicios,
    total: r.total,
    pagado: r.pagado,
    saldo: r.saldo,
    pagos: (r.pagos || []).map((p) => ({ id: idDe(p), monto: p.monto, metodo: p.metodo, fecha: iso(p.fecha), referencia: p.referencia || '' })),
    estado: r.estado,
    validacionAprobada: Boolean(r.validacionMedica && r.validacionMedica.aprobada),
    notas: r.notas || '',
    createdAt: iso(r.createdAt)
  };
}

function reservacionInputADominio(data) {
  const input = limpiarOpcionales(data);
  const { mascotaId, habitacionId, ...resto } = input;
  const salida = { ...resto };
  if (mascotaId) salida.mascota = mascotaId;
  if (habitacionId) salida.habitacion = habitacionId;
  salida.servicios = input.servicios || [];
  return salida;
}

function reservacionUpdateADominio(data) {
  const input = limpiarOpcionales(data);
  const { habitacionId, servicios, reemplazarServicios, ...resto } = input;
  if (habitacionId) resto.habitacion = habitacionId;
  if (reemplazarServicios) resto.servicios = servicios || [];
  return resto;
}

function cotizacionAMsg(c) {
  return {
    mascotaId: c.mascota.id,
    mascotaNombre: c.mascota.nombre,
    habitacionId: c.habitacion.id,
    habitacionNumero: c.habitacion.numero,
    zona: c.habitacion.zona,
    fechaEntrada: iso(c.fechaEntrada),
    fechaSalida: iso(c.fechaSalida),
    noches: c.noches,
    precioNoche: c.precioNoche,
    servicios: c.servicios,
    subtotalHospedaje: c.subtotalHospedaje,
    subtotalServicios: c.subtotalServicios,
    total: c.total
  };
}

module.exports = {
  limpiarOpcionales,
  habitacionAMsg,
  habitacionInputADominio,
  mascotaAMsg,
  mascotaInputADominio,
  reservacionAMsg,
  reservacionInputADominio,
  reservacionUpdateADominio,
  cotizacionAMsg
};

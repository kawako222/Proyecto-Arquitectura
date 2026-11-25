'use strict';

/**
 * Reglas de negocio centrales de La Casa de la Nana.
 * Cualquier servicio (REST, GraphQL, gRPC) debe leer de aqui.
 */

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  CLIENTE: 'CLIENTE'
});

const ZONAS = Object.freeze({
  GERIATRICOS: 'Geriátricos',
  PIROTECNIA: 'Sensibles a pirotecnia',
  ESPECIALES: 'Especiales',
  VIP: 'VIP'
});

const ZONAS_LISTA = Object.freeze(Object.values(ZONAS));

/** Distribucion fisica de las 29 habitaciones (suma = 29). */
const PLAN_HABITACIONES = Object.freeze([
  { zona: ZONAS.GERIATRICOS, prefijo: 'GER', cantidad: 8, precioNoche: 450, capacidad: 1, amenidades: ['Cama ortopédica', 'Piso antiderrapante', 'Rampa de acceso'] },
  { zona: ZONAS.PIROTECNIA, prefijo: 'PIR', cantidad: 8, precioNoche: 500, capacidad: 1, amenidades: ['Aislamiento acústico', 'Ruido blanco', 'Luz tenue'] },
  { zona: ZONAS.ESPECIALES, prefijo: 'ESP', cantidad: 7, precioNoche: 550, capacidad: 1, amenidades: ['Monitoreo 24/7', 'Área de medicación', 'Cámara'] },
  { zona: ZONAS.VIP, prefijo: 'VIP', cantidad: 6, precioNoche: 850, capacidad: 2, amenidades: ['Suite amplia', 'Cámara para tutores', 'Patio privado', 'Clima'] }
]);

const MAX_HABITACIONES = Number(process.env.MAX_HABITACIONES || 29);

const ESTADOS_HABITACION = Object.freeze({
  DISPONIBLE: 'DISPONIBLE',
  OCUPADA: 'OCUPADA',
  LIMPIEZA: 'LIMPIEZA',
  MANTENIMIENTO: 'MANTENIMIENTO'
});

/**
 * Ciclo de vida de una reservacion:
 * COTIZACION -> CONFIRMADA (agendada) -> VALIDADA (vacunas OK) -> EN_CURSO (check-in) -> FINALIZADA (check-out)
 * Cualquier estado previo a EN_CURSO puede pasar a CANCELADA.
 */
const ESTADOS_RESERVACION = Object.freeze({
  COTIZACION: 'COTIZACION',
  CONFIRMADA: 'CONFIRMADA',
  VALIDADA: 'VALIDADA',
  EN_CURSO: 'EN_CURSO',
  FINALIZADA: 'FINALIZADA',
  CANCELADA: 'CANCELADA'
});

/** Estados que bloquean la habitacion en el calendario. */
const ESTADOS_QUE_OCUPAN = Object.freeze([
  ESTADOS_RESERVACION.CONFIRMADA,
  ESTADOS_RESERVACION.VALIDADA,
  ESTADOS_RESERVACION.EN_CURSO
]);

/** Servicios adicionales cotizables (precio por estancia). */
const SERVICIOS_EXTRA = Object.freeze({
  BANO: { nombre: 'Baño y cepillado', precio: 250 },
  PASEO: { nombre: 'Paseo diario extra', precio: 120 },
  MEDICACION: { nombre: 'Administración de medicamentos', precio: 180 },
  TRANSPORTE: { nombre: 'Transporte a domicilio', precio: 300 },
  DIETA_ESPECIAL: { nombre: 'Dieta especial', precio: 200 }
});

/** Vacunas obligatorias que deben estar vigentes hasta la fecha de salida. */
const VACUNAS_OBLIGATORIAS = Object.freeze(['Rabia', 'Múltiple', 'Bordetella']);

/** Edad minima (anios) para considerar a una mascota geriatrica. */
const EDAD_GERIATRICA = 8;

const METODOS_PAGO = Object.freeze(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']);

const TIPOS_MOVIMIENTO = Object.freeze({ INGRESO: 'INGRESO', GASTO: 'GASTO' });

const CATEGORIAS_GASTO = Object.freeze([
  'ALIMENTO', 'LIMPIEZA', 'VETERINARIO', 'NOMINA', 'SERVICIOS', 'MANTENIMIENTO', 'OTRO'
]);

const CATEGORIAS_INGRESO = Object.freeze(['RESERVACION', 'SERVICIO_EXTRA', 'OTRO']);

const ESTADOS_TURNO = Object.freeze({ ABIERTO: 'ABIERTO', CERRADO: 'CERRADO' });

module.exports = {
  ROLES,
  ZONAS,
  ZONAS_LISTA,
  PLAN_HABITACIONES,
  MAX_HABITACIONES,
  ESTADOS_HABITACION,
  ESTADOS_RESERVACION,
  ESTADOS_QUE_OCUPAN,
  SERVICIOS_EXTRA,
  VACUNAS_OBLIGATORIAS,
  EDAD_GERIATRICA,
  METODOS_PAGO,
  TIPOS_MOVIMIENTO,
  CATEGORIAS_GASTO,
  CATEGORIAS_INGRESO,
  ESTADOS_TURNO
};

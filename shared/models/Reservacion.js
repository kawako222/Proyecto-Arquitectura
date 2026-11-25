'use strict';

const mongoose = require('mongoose');
const { ESTADOS_RESERVACION, METODOS_PAGO } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const pagoSchema = new mongoose.Schema(
  {
    monto: { type: Number, required: true, min: 0.01 },
    metodo: { type: String, enum: METODOS_PAGO, required: true },
    fecha: { type: Date, default: Date.now },
    referencia: { type: String, trim: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    movimientoCaja: { type: mongoose.Schema.Types.ObjectId, ref: 'MovimientoCaja' }
  },
  { _id: true }
);

const servicioSchema = new mongoose.Schema(
  {
    clave: { type: String, required: true },
    nombre: { type: String, required: true },
    precio: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const historialSchema = new mongoose.Schema(
  {
    estado: { type: String, enum: Object.values(ESTADOS_RESERVACION), required: true },
    fecha: { type: Date, default: Date.now },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    nota: { type: String, trim: true }
  },
  { _id: false }
);

const reservacionSchema = new mongoose.Schema(
  {
    folio: { type: String, unique: true },
    mascota: { type: mongoose.Schema.Types.ObjectId, ref: 'Mascota', required: true, index: true },
    tutor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    habitacion: { type: mongoose.Schema.Types.ObjectId, ref: 'Habitacion', required: true, index: true },
    zona: { type: String, required: true, index: true },
    fechaEntrada: { type: Date, required: true, index: true },
    fechaSalida: { type: Date, required: true, index: true },
    noches: { type: Number, required: true, min: 1 },
    precioNoche: { type: Number, required: true, min: 0 },
    servicios: { type: [servicioSchema], default: [] },
    subtotalHospedaje: { type: Number, required: true, min: 0 },
    subtotalServicios: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    pagado: { type: Number, default: 0, min: 0 },
    saldo: { type: Number, required: true, min: 0 },
    pagos: { type: [pagoSchema], default: [] },
    estado: { type: String, enum: Object.values(ESTADOS_RESERVACION), default: ESTADOS_RESERVACION.COTIZACION, index: true },
    validacionMedica: {
      aprobada: { type: Boolean, default: false },
      fecha: { type: Date },
      validadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      observaciones: { type: String, trim: true }
    },
    checkIn: { fecha: Date, usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }, notas: String },
    checkOut: { fecha: Date, usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }, notas: String },
    cancelacion: { fecha: Date, usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }, motivo: String },
    notas: { type: String, trim: true, maxlength: 1000 },
    historial: { type: [historialSchema], default: [] },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
  },
  { timestamps: true, collection: 'reservaciones' }
);

reservacionSchema.index({ habitacion: 1, fechaEntrada: 1, fechaSalida: 1 });

reservacionSchema.pre('validate', function asignarFolio() {
  if (!this.folio) {
    const fecha = new Date();
    const yyyymmdd = fecha.toISOString().slice(0, 10).replace(/-/g, '');
    const aleatorio = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.folio = `NANA-${yyyymmdd}-${aleatorio}`;
  }
  if (this.fechaSalida && this.fechaEntrada && this.fechaSalida <= this.fechaEntrada) {
    this.invalidate('fechaSalida', 'La fecha de salida debe ser posterior a la de entrada');
  }
});

reservacionSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Reservacion || mongoose.model('Reservacion', reservacionSchema, 'reservaciones');

'use strict';

const mongoose = require('mongoose');
const { ZONAS_LISTA, ESTADOS_HABITACION } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const habitacionSchema = new mongoose.Schema(
  {
    numero: {
      type: String,
      required: [true, 'El número de habitación es obligatorio'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}-\d{2}$/, 'Formato de número inválido (ej. VIP-01)']
    },
    zona: { type: String, required: true, enum: { values: ZONAS_LISTA, message: 'Zona inválida: {VALUE}' }, index: true },
    capacidad: { type: Number, required: true, min: 1, max: 4, default: 1 },
    precioNoche: { type: Number, required: true, min: [0, 'El precio no puede ser negativo'] },
    estado: { type: String, enum: Object.values(ESTADOS_HABITACION), default: ESTADOS_HABITACION.DISPONIBLE, index: true },
    amenidades: { type: [String], default: [] },
    notas: { type: String, trim: true, maxlength: 500 },
    activa: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'habitaciones' }
);

habitacionSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Habitacion || mongoose.model('Habitacion', habitacionSchema, 'habitaciones');

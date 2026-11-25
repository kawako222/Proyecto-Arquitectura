'use strict';

const mongoose = require('mongoose');
const { TIPOS_MOVIMIENTO, METODOS_PAGO, CATEGORIAS_GASTO, CATEGORIAS_INGRESO } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const movimientoCajaSchema = new mongoose.Schema(
  {
    turno: { type: mongoose.Schema.Types.ObjectId, ref: 'TurnoCaja', required: true, index: true },
    tipo: { type: String, enum: Object.values(TIPOS_MOVIMIENTO), required: true, index: true },
    categoria: {
      type: String,
      required: true,
      enum: [...new Set([...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO])]
    },
    concepto: { type: String, required: [true, 'El concepto es obligatorio'], trim: true, maxlength: 200 },
    monto: { type: Number, required: true, min: [0.01, 'El monto debe ser mayor a 0'] },
    metodoPago: { type: String, enum: METODOS_PAGO, default: 'EFECTIVO' },
    reservacion: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservacion' },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    fecha: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true, collection: 'movimientos_caja' }
);

movimientoCajaSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.MovimientoCaja || mongoose.model('MovimientoCaja', movimientoCajaSchema, 'movimientos_caja');

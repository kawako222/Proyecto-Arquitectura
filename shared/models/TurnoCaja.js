'use strict';

const mongoose = require('mongoose');
const { ESTADOS_TURNO } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

/**
 * Turno de Caja Fija: apertura con fondo inicial y cierre con arqueo.
 */
const turnoCajaSchema = new mongoose.Schema(
  {
    estado: { type: String, enum: Object.values(ESTADOS_TURNO), default: ESTADOS_TURNO.ABIERTO, index: true },
    montoInicial: { type: Number, required: true, min: 0 },
    abiertoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    fechaApertura: { type: Date, default: Date.now },
    cerradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    fechaCierre: { type: Date },
    totalIngresos: { type: Number, default: 0 },
    totalGastos: { type: Number, default: 0 },
    efectivoEsperado: { type: Number, default: 0 },
    efectivoContado: { type: Number },
    diferencia: { type: Number },
    notas: { type: String, trim: true, maxlength: 500 }
  },
  { timestamps: true, collection: 'turnos_caja' }
);

turnoCajaSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.TurnoCaja || mongoose.model('TurnoCaja', turnoCajaSchema, 'turnos_caja');

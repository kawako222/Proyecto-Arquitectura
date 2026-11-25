'use strict';

const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const usuarioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: [true, 'El nombre es obligatorio'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido']
    },
    passwordHash: { type: String, required: true, select: false },
    rol: { type: String, enum: Object.values(ROLES), default: ROLES.CLIENTE, index: true },
    telefono: { type: String, trim: true, maxlength: 20 },
    activo: { type: Boolean, default: true },
    ultimoAcceso: { type: Date }
  },
  { timestamps: true, collection: 'usuarios' }
);

usuarioSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Usuario || mongoose.model('Usuario', usuarioSchema, 'usuarios');

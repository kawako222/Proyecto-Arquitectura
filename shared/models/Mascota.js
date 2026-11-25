'use strict';

const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const vacunaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    fechaAplicacion: { type: Date, required: true },
    fechaVencimiento: { type: Date, required: true }
  },
  { _id: false }
);

const condicionesSchema = new mongoose.Schema(
  {
    geriatrico: { type: Boolean, default: false },
    sensiblePirotecnia: { type: Boolean, default: false },
    necesidadesEspeciales: { type: Boolean, default: false },
    descripcion: { type: String, trim: true, maxlength: 500 }
  },
  { _id: false }
);

const mascotaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: [true, 'El nombre de la mascota es obligatorio'], trim: true, maxlength: 60 },
    especie: { type: String, default: 'Perro', trim: true },
    raza: { type: String, trim: true, default: 'Mestizo' },
    sexo: { type: String, enum: ['MACHO', 'HEMBRA'], required: true },
    edad: { type: Number, min: 0, max: 30, required: true },
    pesoKg: { type: Number, min: 0.5, max: 120, required: true },
    tamano: { type: String, enum: ['CHICO', 'MEDIANO', 'GRANDE', 'GIGANTE'], required: true },
    tutor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: [true, 'La mascota debe tener un tutor'], index: true },
    condiciones: { type: condicionesSchema, default: () => ({}) },
    vacunas: { type: [vacunaSchema], default: [] },
    alergias: { type: [String], default: [] },
    notasMedicas: { type: String, trim: true, maxlength: 1000 },
    veterinarioContacto: { type: String, trim: true, maxlength: 120 },
    activa: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'mascotas' }
);

mascotaSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Mascota || mongoose.model('Mascota', mascotaSchema, 'mascotas');

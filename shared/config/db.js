'use strict';

const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/**
 * Conecta a MongoDB con reintentos (util mientras el contenedor arranca).
 */
async function connectDB({ uri = process.env.MONGO_URI, retries = 10, delayMs = 3000, label = 'servicio' } = {}) {
  if (!uri) {
    throw new Error('MONGO_URI no esta definida. Revisa tu archivo .env');
  }
  for (let intento = 1; intento <= retries; intento += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log(`[${label}] MongoDB conectado (${mongoose.connection.name})`);
      return mongoose.connection;
    } catch (err) {
      console.error(`[${label}] Intento ${intento}/${retries} de conexion a MongoDB fallo: ${err.message}`);
      if (intento === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

function dbStatus() {
  const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];
  return estados[mongoose.connection.readyState] || 'desconocido';
}

module.exports = { connectDB, disconnectDB, dbStatus, mongoose };

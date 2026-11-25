'use strict';

const { connectDB, disconnectDB } = require('../../../shared/config/db');
const { crearApp } = require('./app');

const PORT = Number(process.env.PORT || 4000);

async function main() {
  await connectDB({ label: 'rest-api' });
  const app = crearApp();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[rest-api] Escuchando en http://0.0.0.0:${PORT}  (docs: GET /api)`);
  });

  const apagar = async (senal) => {
    console.log(`[rest-api] ${senal} recibido, cerrando...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

main().catch((err) => {
  console.error('[rest-api] Error fatal al iniciar:', err);
  process.exit(1);
});

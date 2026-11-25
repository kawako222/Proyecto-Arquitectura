'use strict';

const { cargarProto, grpc } = require('./protoLoader');
const { connectDB, disconnectDB } = require('../../../shared/config/db');
const handlers = require('./handlers');

const PORT = Number(process.env.GRPC_PORT || 50051);

async function main() {
  await connectDB({ label: 'grpc-api' });
  const nana = cargarProto();
  const server = new grpc.Server();

  server.addService(nana.AuthService.service, handlers.AuthService);
  server.addService(nana.HabitacionService.service, handlers.HabitacionService);
  server.addService(nana.MascotaService.service, handlers.MascotaService);
  server.addService(nana.ReservacionService.service, handlers.ReservacionService);

  await new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err) => (err ? reject(err) : resolve()));
  });
  console.log(`[grpc-api] Servidor gRPC escuchando en 0.0.0.0:${PORT} (servicios: Auth, Habitacion, Mascota, Reservacion)`);

  const apagar = (senal) => {
    console.log(`[grpc-api] ${senal} recibido, cerrando...`);
    server.tryShutdown(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

main().catch((err) => {
  console.error('[grpc-api] Error fatal al iniciar:', err);
  process.exit(1);
});

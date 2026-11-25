'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { dbStatus } = require('../../../shared/config/db');
const { ZONAS_LISTA, MAX_HABITACIONES, SERVICIOS_EXTRA, VACUNAS_OBLIGATORIAS } = require('../../../shared/config/constants');
const { adjuntarActor, requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const habitacionesRoutes = require('./routes/habitaciones.routes');
const mascotasRoutes = require('./routes/mascotas.routes');
const reservacionesRoutes = require('./routes/reservaciones.routes');
const cajaRoutes = require('./routes/caja.routes');
const kpisRoutes = require('./routes/kpis.routes');
const usuariosRoutes = require('./routes/usuarios.routes');

function crearApp() {
  const app = express();
  const origenes = String(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      // Peticiones sin Origin (curl, Postman, server-to-server) se permiten
      if (!origin || origenes.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));
  // Copia req.query a un objeto plano (Express 5 lo expone como getter)
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'query', { value: { ...req.query }, writable: true, configurable: true, enumerable: true });
    next();
  });
  app.use(adjuntarActor);

  app.get('/health', (_req, res) => {
    const db = dbStatus();
    res.status(db === 'conectado' ? 200 : 503).json({ ok: db === 'conectado', servicio: 'rest-api', db, uptime: process.uptime() });
  });

  app.get('/api', (_req, res) => {
    res.json({
      ok: true,
      servicio: 'La Casa de la Nana - API REST',
      reglas: { maxHabitaciones: MAX_HABITACIONES, zonas: ZONAS_LISTA, vacunasObligatorias: VACUNAS_OBLIGATORIAS, serviciosExtra: SERVICIOS_EXTRA },
      recursos: ['/api/auth', '/api/habitaciones', '/api/mascotas', '/api/reservaciones', '/api/caja', '/api/kpis', '/api/usuarios']
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/habitaciones', requireAuth(), habitacionesRoutes);
  app.use('/api/mascotas', requireAuth(), mascotasRoutes);
  app.use('/api/reservaciones', requireAuth(), reservacionesRoutes);
  app.use('/api/caja', requireAuth('ADMIN', 'STAFF'), cajaRoutes);
  app.use('/api/kpis', requireAuth('ADMIN'), kpisRoutes);
  app.use('/api/usuarios', requireAuth('ADMIN', 'STAFF'), usuariosRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { crearApp };

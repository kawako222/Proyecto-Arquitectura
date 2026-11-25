'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@as-integrations/express5');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { ApolloServerPluginLandingPageLocalDefault } = require('@apollo/server/plugin/landingPage/default');
const { connectDB, disconnectDB, dbStatus } = require('../../../shared/config/db');
const { authService } = require('../../../shared/services');
const { typeDefs } = require('./schema/typeDefs');
const { resolvers } = require('./schema/resolvers');

const PORT = Number(process.env.PORT || 4001);
const COOKIE_NAME = process.env.COOKIE_NAME || 'nana_token';

function extraerToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

async function main() {
  await connectDB({ label: 'graphql-api' });

  const app = express();
  const httpServer = http.createServer(app);
  const origenes = String(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Apollo Sandbox embebido en GET /graphql (tambien en NODE_ENV=production)
      ApolloServerPluginLandingPageLocalDefault({ embed: { initialState: { includeCookies: true } } })
    ],
    formatError: (formatted) => {
      const { stacktrace, ...ext } = formatted.extensions || {};
      return { ...formatted, extensions: ext };
    }
  });
  await server.start();

  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    const db = dbStatus();
    res.status(db === 'conectado' ? 200 : 503).json({ ok: db === 'conectado', servicio: 'graphql-api', db });
  });

  app.use(
    '/graphql',
    cors({
      origin(origin, callback) {
        if (!origin || origenes.includes(origin) || origin === 'https://studio.apollographql.com') return callback(null, true);
        return callback(null, false);
      },
      credentials: true
    }),
    cookieParser(),
    express.json({ limit: '1mb' }),
    expressMiddleware(server, {
      context: async ({ req, res }) => ({ req, res, actor: authService.actorOpcional(extraerToken(req)) })
    })
  );

  await new Promise((resolve) => httpServer.listen({ port: PORT, host: '0.0.0.0' }, resolve));
  console.log(`[graphql-api] Apollo Server listo en http://0.0.0.0:${PORT}/graphql (Sandbox: abre esa URL en el navegador)`);

  const apagar = async (senal) => {
    console.log(`[graphql-api] ${senal} recibido, cerrando...`);
    await server.stop();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

main().catch((err) => {
  console.error('[graphql-api] Error fatal al iniciar:', err);
  process.exit(1);
});

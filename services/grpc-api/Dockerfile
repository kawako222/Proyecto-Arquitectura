# ---------- Etapa 1: dependencias de produccion ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY services/grpc-api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- Etapa 2: imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node shared ./shared
COPY --chown=node:node services/grpc-api/package.json ./services/grpc-api/package.json
COPY --chown=node:node services/grpc-api/proto ./services/grpc-api/proto
COPY --chown=node:node services/grpc-api/src ./services/grpc-api/src
WORKDIR /app/services/grpc-api
USER node
EXPOSE 50051
CMD ["node", "src/server.js"]

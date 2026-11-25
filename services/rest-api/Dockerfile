# ---------- Etapa 1: dependencias de produccion ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY services/rest-api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- Etapa 2: imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# node_modules en /app para que /app/shared y /app/services/* resuelvan las mismas dependencias
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node shared ./shared
COPY --chown=node:node services/rest-api/package.json ./services/rest-api/package.json
COPY --chown=node:node services/rest-api/src ./services/rest-api/src
WORKDIR /app/services/rest-api
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]

#!/usr/bin/env bash
# Espera a que los servicios esten listos y ejecuta las pruebas de REST, GraphQL y gRPC.
# Uso (desde la raiz del proyecto): bash scripts/smoke-test.sh
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/.."

esperar() {
  local nombre="$1" url="$2" intentos=40
  printf 'Esperando %s ' "$nombre"
  until curl -sf "$url" > /dev/null; do
    intentos=$((intentos - 1))
    if [ "$intentos" -le 0 ]; then printf ' TIMEOUT\n'; return 1; fi
    printf '.'; sleep 3
  done
  printf ' listo\n'
}

esperar "REST" "http://localhost:${REST_PORT:-4000}/health" || exit 1
esperar "GraphQL" "http://localhost:${GRAPHQL_PORT:-4001}/health" || exit 1

TOTAL=0
bash scripts/test-rest.sh || TOTAL=$((TOTAL + 1))
bash scripts/test-graphql.sh || TOTAL=$((TOTAL + 1))
printf '\n\033[1;36m== gRPC (cliente dentro del contenedor grpc-api) ==\033[0m\n'
docker compose exec -T grpc-api node src/client.js || TOTAL=$((TOTAL + 1))

if [ "$TOTAL" -eq 0 ]; then
  printf '\n\033[1;32mTODAS LAS PRUEBAS PASARON (REST + GraphQL + gRPC)\033[0m\n'
else
  printf '\n\033[1;31m%s suite(s) con fallos. Revisa: docker compose logs --tail=80\033[0m\n' "$TOTAL"
  exit 1
fi

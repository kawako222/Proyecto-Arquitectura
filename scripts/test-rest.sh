#!/usr/bin/env bash
# Prueba de extremo a extremo de la API REST (requiere el seed cargado).
# Uso: bash scripts/test-rest.sh   [REST_URL=http://localhost:4000]
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/lib.sh"

BASE="${REST_URL:-http://localhost:4000}"
JAR_ADMIN="$(mktemp)"
JAR_CLIENTE="$(mktemp)"
trap 'rm -f "$JAR_ADMIN" "$JAR_CLIENTE"' EXIT

fecha() { python3 -c "import datetime,sys; print((datetime.date.today()+datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }

# req <jar> <METODO> <ruta> [json]
req() {
  local jar="$1" metodo="$2" ruta="$3" cuerpo="${4:-}"
  local salida
  if [ -n "$cuerpo" ]; then
    salida=$(curl -s -w '\n%{http_code}' -b "$jar" -c "$jar" -X "$metodo" -H 'Content-Type: application/json' -d "$cuerpo" "$BASE$ruta")
  else
    salida=$(curl -s -w '\n%{http_code}' -b "$jar" -c "$jar" -X "$metodo" "$BASE$ruta")
  fi
  STATUS="${salida##*$'\n'}"
  RESP="${salida%$'\n'*}"
}

titulo "Salud y descubrimiento ($BASE)"
req "$JAR_ADMIN" GET /health
check "GET /health responde 200 con DB conectada" '[ "$STATUS" = 200 ]'
req "$JAR_ADMIN" GET /api/habitaciones
check "Sin sesión -> 401" '[ "$STATUS" = 401 ]'

titulo "Autenticación (JWT en cookie HttpOnly)"
req "$JAR_ADMIN" POST /api/auth/login '{"email":"admin@lacasadelanana.mx","password":"Admin12345"}'
check "Login ADMIN" '[ "$STATUS" = 200 ] && grep -q nana_token "$JAR_ADMIN"'
req "$JAR_ADMIN" GET /api/auth/me
check "GET /api/auth/me con cookie (rol ADMIN)" '[ "$(jget data.rol)" = ADMIN ]'

titulo "Habitaciones (CRUD + regla de 29)"
req "$JAR_ADMIN" GET /api/habitaciones
check "Listar -> 29 habitaciones" '[ "$(jget total)" = 29 ]'
HAB_ID="$(jget data.0.id)"
req "$JAR_ADMIN" GET "/api/habitaciones?zona=VIP"
check "Filtrar zona VIP -> 6" '[ "$(jget total)" = 6 ]'
req "$JAR_ADMIN" GET /api/habitaciones/resumen/zonas
check "Resumen por zona (4 zonas)" '[ "$(jget len:data)" = 4 ]'
req "$JAR_ADMIN" GET "/api/habitaciones/$HAB_ID"
check "Obtener habitación por id" '[ "$STATUS" = 200 ] && [ "$(jget data.id)" = "$HAB_ID" ]'
req "$JAR_ADMIN" POST /api/habitaciones '{"numero":"VIP-07","zona":"VIP","capacidad":2,"precioNoche":900}'
check "Crear la habitación 30 -> 412 (máximo físico 29)" '[ "$STATUS" = 412 ]'
req "$JAR_ADMIN" PUT "/api/habitaciones/$HAB_ID" '{"notas":"Revisada por test REST"}'
check "Actualizar notas de habitación" '[ "$STATUS" = 200 ] && [ "$(jget data.notas)" = "Revisada por test REST" ]'
req "$JAR_ADMIN" GET /api/habitaciones
VIP05_ID="$(jfind data numero VIP-05 id)"
req "$JAR_ADMIN" DELETE "/api/habitaciones/$VIP05_ID"
check "Eliminar VIP-05 (quedan 28)" '[ "$STATUS" = 200 ]'
req "$JAR_ADMIN" POST /api/habitaciones '{"numero":"VIP-05","zona":"VIP","capacidad":2,"precioNoche":850,"amenidades":["Suite amplia","Cámara para tutores","Patio privado","Clima"]}'
check "Crear VIP-05 de nuevo (vuelven a ser 29)" '[ "$STATUS" = 201 ]'
req "$JAR_ADMIN" POST /api/habitaciones '{"numero":"GER-20","zona":"VIP","precioNoche":10}'
check "Validación: prefijo de zona incorrecto -> 400" '[ "$STATUS" = 400 ] || [ "$STATUS" = 412 ]'

titulo "Mascotas (CRUD)"
req "$JAR_ADMIN" GET "/api/usuarios?rol=CLIENTE"
TUTOR_ID="$(jfind data email jorge@correo.mx id)"
check "Obtener tutor (Jorge)" '[ -n "$TUTOR_ID" ]'
VENCE="$(fecha 365)"; APLICA="$(fecha -10)"
req "$JAR_ADMIN" POST /api/mascotas "{\"nombre\":\"Pelusa REST\",\"raza\":\"Poodle\",\"sexo\":\"HEMBRA\",\"edad\":4,\"pesoKg\":6,\"tamano\":\"CHICO\",\"tutor\":\"$TUTOR_ID\",\"vacunas\":[{\"nombre\":\"Rabia\",\"fechaAplicacion\":\"$APLICA\",\"fechaVencimiento\":\"$VENCE\"},{\"nombre\":\"Múltiple\",\"fechaAplicacion\":\"$APLICA\",\"fechaVencimiento\":\"$VENCE\"},{\"nombre\":\"Bordetella\",\"fechaAplicacion\":\"$APLICA\",\"fechaVencimiento\":\"$VENCE\"}]}"
check "Crear mascota" '[ "$STATUS" = 201 ]'
MASCOTA_ID="$(jget data.id)"
req "$JAR_ADMIN" GET "/api/mascotas/$MASCOTA_ID"
check "Obtener mascota (vacunas vigentes)" '[ "$(jget data.estadoVacunas.vigentes)" = true ]'
req "$JAR_ADMIN" PUT "/api/mascotas/$MASCOTA_ID" '{"pesoKg":6.4,"alergias":["Soya"]}'
check "Actualizar mascota" '[ "$(jget data.pesoKg)" = 6.4 ]'
req "$JAR_ADMIN" GET "/api/mascotas?nombre=pelusa"
check "Buscar mascota por nombre" '[ "$(jget total)" -ge 1 ]'
req "$JAR_ADMIN" POST /api/mascotas '{"nombre":"SinDatos"}'
check "Validación de datos -> 422" '[ "$STATUS" = 422 ]'

titulo "Caja fija"
req "$JAR_ADMIN" GET /api/caja/estado
if [ "$(jget data.abierto)" != true ]; then
  req "$JAR_ADMIN" POST /api/caja/turnos/abrir '{"montoInicial":2000,"notas":"Abierto por test REST"}'
fi
req "$JAR_ADMIN" GET /api/caja/estado
check "Hay un turno de caja abierto" '[ "$(jget data.abierto)" = true ]'
req "$JAR_ADMIN" POST /api/caja/movimientos '{"tipo":"GASTO","categoria":"LIMPIEZA","concepto":"Toallitas (test REST)","monto":120.5,"metodoPago":"EFECTIVO"}'
check "Registrar gasto operativo" '[ "$STATUS" = 201 ]'

titulo "Reservaciones (ciclo de vida completo)"
ENTRADA="$(fecha 45)"; SALIDA="$(fecha 48)"
req "$JAR_ADMIN" POST /api/reservaciones/cotizar "{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"VIP\",\"fechaEntrada\":\"$ENTRADA\",\"fechaSalida\":\"$SALIDA\",\"servicios\":[\"BANO\"]}"
check "Cotizar (3 noches VIP + baño = 2800)" '[ "$(jget data.total)" = 2800 ]'
req "$JAR_ADMIN" POST /api/reservaciones "{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"VIP\",\"fechaEntrada\":\"$ENTRADA\",\"fechaSalida\":\"$SALIDA\",\"servicios\":[\"BANO\"]}"
check "Agendar reservación (CONFIRMADA)" '[ "$STATUS" = 201 ] && [ "$(jget data.estado)" = CONFIRMADA ]'
RES_ID="$(jget data.id)"
req "$JAR_ADMIN" POST /api/reservaciones "{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"VIP\",\"fechaEntrada\":\"$ENTRADA\",\"fechaSalida\":\"$SALIDA\"}"
check "Traslape de la misma mascota -> 409" '[ "$STATUS" = 409 ]'
req "$JAR_ADMIN" PUT "/api/reservaciones/$RES_ID" '{"servicios":["BANO","PASEO"],"notas":"Paseo extra"}'
check "Actualizar servicios (total 2920)" '[ "$(jget data.total)" = 2920 ]'
req "$JAR_ADMIN" GET "/api/reservaciones/$RES_ID"
check "Obtener reservación" '[ "$STATUS" = 200 ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/check-in" '{}'
check "Check-in sin validación médica -> 412" '[ "$STATUS" = 412 ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/validar-medica" '{"observaciones":"Cartilla al día"}'
check "Validación médica/vacunas" '[ "$(jget data.estado)" = VALIDADA ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/pagos" '{"monto":1000,"metodo":"EFECTIVO"}'
check "Anticipo $1000" '[ "$(jget data.saldo)" = 1920 ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/check-in" '{"notas":"Llegó contenta"}'
check "Check-in" '[ "$(jget data.estado)" = EN_CURSO ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/check-out" '{}'
check "Check-out con saldo pendiente -> 412" '[ "$STATUS" = 412 ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/pagos" '{"monto":1920,"metodo":"TARJETA","referencia":"TPV-REST"}'
check "Liquidación de saldo" '[ "$(jget data.saldo)" = 0 ]'
req "$JAR_ADMIN" POST "/api/reservaciones/$RES_ID/check-out" '{"notas":"Entregada"}'
check "Check-out" '[ "$(jget data.estado)" = FINALIZADA ]'

req "$JAR_ADMIN" POST /api/reservaciones "{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"VIP\",\"fechaEntrada\":\"$(fecha 55)\",\"fechaSalida\":\"$(fecha 57)\",\"confirmar\":false}"
check "Guardar como COTIZACION" '[ "$(jget data.estado)" = COTIZACION ]'
COT_ID="$(jget data.id)"
req "$JAR_ADMIN" POST "/api/reservaciones/$COT_ID/cancelar" '{"motivo":"Prueba"}'
check "Cancelar" '[ "$(jget data.estado)" = CANCELADA ]'
req "$JAR_ADMIN" DELETE "/api/reservaciones/$COT_ID"
check "Eliminar reservación cancelada" '[ "$STATUS" = 200 ]'
req "$JAR_ADMIN" GET "/api/reservaciones?estado=CONFIRMADA,VALIDADA,EN_CURSO"
check "Listar reservaciones activas" '[ "$STATUS" = 200 ]'

titulo "KPIs (solo ADMIN)"
req "$JAR_ADMIN" GET /api/kpis/resumen
check "Resumen de KPIs" '[ "$STATUS" = 200 ] && [ -n "$(jget data.ticketPromedio.ticketPromedio)" ]'
printf '    ticket promedio: %s | ocupación global: %s%% | cancelación: %s%%\n' \
  "$(jget data.ticketPromedio.ticketPromedio)" "$(jget data.ocupacionPorZona.tasaOcupacionGlobal)" "$(jget data.cancelaciones.tasaCancelacion)"

titulo "RBAC como CLIENTE"
req "$JAR_CLIENTE" POST /api/auth/login '{"email":"mariana@correo.mx","password":"Cliente12345"}'
check "Login CLIENTE" '[ "$STATUS" = 200 ]'
req "$JAR_CLIENTE" GET /api/mascotas
check "CLIENTE solo ve sus mascotas (Canela y Rocky)" '[ "$(jget total)" = 2 ]'
req "$JAR_CLIENTE" GET /api/kpis/resumen
check "CLIENTE no accede a KPIs -> 403" '[ "$STATUS" = 403 ]'
req "$JAR_CLIENTE" GET "/api/mascotas/$MASCOTA_ID"
check "CLIENTE no ve mascotas ajenas -> 403" '[ "$STATUS" = 403 ]'
req "$JAR_CLIENTE" POST /api/auth/logout
check "Logout" '[ "$STATUS" = 200 ]'

titulo "Limpieza"
req "$JAR_ADMIN" DELETE "/api/mascotas/$MASCOTA_ID"
check "Eliminar mascota de prueba" '[ "$STATUS" = 200 ]'

resumen

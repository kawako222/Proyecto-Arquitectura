#!/usr/bin/env bash
# Prueba de extremo a extremo de la API GraphQL (requiere el seed cargado).
# Uso: bash scripts/test-graphql.sh   [GRAPHQL_URL=http://localhost:4001/graphql]
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/lib.sh"

URL="${GRAPHQL_URL:-http://localhost:4001/graphql}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fecha() { python3 -c "import datetime,sys; print((datetime.date.today()+datetime.timedelta(days=int(sys.argv[1]))).isoformat())" "$1"; }

# gql <query> [variables-json]
gql() {
  local cuerpo
  cuerpo=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1], "variables": json.loads(sys.argv[2])}))' "$1" "${2:-{\}}")
  local salida
  salida=$(curl -s -w '\n%{http_code}' -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' -d "$cuerpo" "$URL")
  STATUS="${salida##*$'\n'}"
  RESP="${salida%$'\n'*}"
}

sin_errores() { [ -z "$(jget errors)" ]; }

titulo "GraphQL ($URL)"
gql '{ habitaciones { id } }'
check "Sin sesión -> UNAUTHENTICATED" '[ "$(jget errors.0.extensions.code)" = UNAUTHENTICATED ]'

gql 'mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token usuario { nombre rol } } }' '{"e":"admin@lacasadelanana.mx","p":"Admin12345"}'
check "Mutation login (cookie HttpOnly)" 'sin_errores && grep -q nana_token "$JAR"'
gql '{ me { nombre rol } }'
check "Query me" '[ "$(jget data.me.rol)" = ADMIN ]'

titulo "Queries"
gql '{ habitaciones { id numero zona precioNoche estado } }'
check "habitaciones -> 29" '[ "$(jget len:data.habitaciones)" = 29 ]'
HAB_ID="$(jget data.habitaciones.0.id)"
gql '{ resumenZonas { zona total DISPONIBLE OCUPADA } }'
check "resumenZonas -> 4 zonas" '[ "$(jget len:data.resumenZonas)" = 4 ]'
gql 'query($id:ID!){ habitacion(id:$id){ numero amenidades } }' "{\"id\":\"$HAB_ID\"}"
check "habitacion(id)" 'sin_errores'
gql '{ mascotas { id nombre tutor { id nombre } estadoVacunas { vigentes faltantes vencidas } } }'
check "mascotas con estadoVacunas calculado" '[ "$(jget len:data.mascotas)" -ge 5 ]'
TUTOR_ID="$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]["mascotas"]; print(next(m["tutor"]["id"] for m in d if m["nombre"]=="Max"))')"
gql '{ reservaciones(estado:"EN_CURSO,CONFIRMADA,VALIDADA") { folio estado saldo mascota { nombre } habitacion { numero zona } } }'
check "reservaciones activas" '[ "$(jget len:data.reservaciones)" -ge 1 ]'
gql '{ estadoCaja { abierto totales { totalIngresos totalGastos efectivoEsperado } } }'
if [ "$(jget data.estadoCaja.abierto)" != true ]; then
  gql 'mutation { abrirTurnoCaja(montoInicial: 2000, notas: "Abierto por test GraphQL") { id } }'
fi
gql '{ estadoCaja { abierto } }'
check "estadoCaja abierto" '[ "$(jget data.estadoCaja.abierto)" = true ]'
gql '{ kpis { ticketPromedio { ticketPromedio estanciasFinalizadas } ocupacionPorZona { tasaOcupacionGlobal zonas { zona tasaOcupacion } } cancelaciones { tasaCancelacion } ingresosMensuales { totalIngresos meses { mes ingresos gastos } } } }'
check "kpis (ticket, ocupación, cancelaciones, ingresos mensuales)" 'sin_errores && [ -n "$(jget data.kpis.ticketPromedio.ticketPromedio)" ]'

titulo "Mutations (CRUD + ciclo de vida)"
gql 'mutation { crearHabitacion(input:{numero:"VIP-07", zona:"VIP", precioNoche:900}) { id } }'
check "crearHabitacion #30 -> PRECONDITION" '[ "$(jget errors.0.extensions.code)" = PRECONDITION ]'
gql 'mutation($id:ID!){ actualizarHabitacion(id:$id, input:{notas:"Revisada vía GraphQL"}) { numero notas } }' "{\"id\":\"$HAB_ID\"}"
check "actualizarHabitacion" '[ "$(jget data.actualizarHabitacion.notas)" = "Revisada vía GraphQL" ]'

VENCE="$(fecha 365)"; APLICA="$(fecha -5)"
gql 'mutation($i:MascotaInput!){ crearMascota(input:$i){ id nombre estadoVacunas { vigentes } } }' \
  "{\"i\":{\"nombre\":\"Kira GraphQL\",\"raza\":\"Husky\",\"sexo\":\"HEMBRA\",\"edad\":3,\"pesoKg\":22,\"tamano\":\"GRANDE\",\"tutor\":\"$TUTOR_ID\",\"vacunas\":[{\"nombre\":\"Rabia\",\"fechaAplicacion\":\"$APLICA\",\"fechaVencimiento\":\"$VENCE\"},{\"nombre\":\"Múltiple\",\"fechaAplicacion\":\"$APLICA\",\"fechaVencimiento\":\"$VENCE\"},{\"nombre\":\"Bordetella\",\"fechaAplicacion\":\"$APLICA\",\"fechaVencimiento\":\"$VENCE\"}]}}"
check "crearMascota" '[ "$(jget data.crearMascota.estadoVacunas.vigentes)" = true ]'
MASCOTA_ID="$(jget data.crearMascota.id)"
gql 'mutation($id:ID!){ actualizarMascota(id:$id, input:{ pesoKg: 23.1, condiciones:{ sensiblePirotecnia: true } }) { pesoKg condiciones { sensiblePirotecnia } } }' "{\"id\":\"$MASCOTA_ID\"}"
check "actualizarMascota" '[ "$(jget data.actualizarMascota.condiciones.sensiblePirotecnia)" = true ]'

ENTRADA="$(fecha 50)"; SALIDA="$(fecha 52)"
gql 'query($i:CotizacionInput!){ cotizarReservacion(input:$i){ total noches habitacion { numero } } }' \
  "{\"i\":{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"Sensibles a pirotecnia\",\"fechaEntrada\":\"$ENTRADA\",\"fechaSalida\":\"$SALIDA\",\"servicios\":[\"PASEO\"]}}"
check "cotizarReservacion (2 noches x 500 + paseo = 1120)" '[ "$(jget data.cotizarReservacion.total)" = 1120 ]'
gql 'mutation($i:ReservacionInput!){ crearReservacion(input:$i){ id folio estado total } }' \
  "{\"i\":{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"Sensibles a pirotecnia\",\"fechaEntrada\":\"$ENTRADA\",\"fechaSalida\":\"$SALIDA\",\"servicios\":[\"PASEO\"]}}"
check "crearReservacion" '[ "$(jget data.crearReservacion.estado)" = CONFIRMADA ]'
RES_ID="$(jget data.crearReservacion.id)"
gql 'mutation($id:ID!){ actualizarReservacion(id:$id, input:{ notas:"Llevar su manta" }) { notas } }' "{\"id\":\"$RES_ID\"}"
check "actualizarReservacion" 'sin_errores'
gql 'mutation($id:ID!){ validarMedica(id:$id, observaciones:"OK") { estado } }' "{\"id\":\"$RES_ID\"}"
check "validarMedica" '[ "$(jget data.validarMedica.estado)" = VALIDADA ]'
gql 'mutation($id:ID!){ checkIn(id:$id) { estado } }' "{\"id\":\"$RES_ID\"}"
check "checkIn" '[ "$(jget data.checkIn.estado)" = EN_CURSO ]'
gql 'mutation($id:ID!){ registrarPago(id:$id, input:{ monto:1120, metodo:TRANSFERENCIA, referencia:"SPEI-123" }) { saldo pagos { monto metodo } } }' "{\"id\":\"$RES_ID\"}"
check "registrarPago (liquida)" '[ "$(jget data.registrarPago.saldo)" = 0 ]'
gql 'mutation($id:ID!){ checkOut(id:$id) { estado historial { estado } } }' "{\"id\":\"$RES_ID\"}"
check "checkOut" '[ "$(jget data.checkOut.estado)" = FINALIZADA ]'
gql 'query($id:ID!){ reservacion(id:$id){ folio mascota { nombre } tutor { nombre } habitacion { numero } } }' "{\"id\":\"$RES_ID\"}"
check "reservacion(id) con referencias resueltas" '[ "$(jget data.reservacion.mascota.nombre)" = "Kira GraphQL" ]'

gql 'mutation($i:ReservacionInput!){ crearReservacion(input:$i){ id estado } }' \
  "{\"i\":{\"mascota\":\"$MASCOTA_ID\",\"zona\":\"VIP\",\"fechaEntrada\":\"$(fecha 60)\",\"fechaSalida\":\"$(fecha 61)\",\"confirmar\":false}}"
COT_ID="$(jget data.crearReservacion.id)"
gql 'mutation($id:ID!){ confirmarReservacion(id:$id) { estado } }' "{\"id\":\"$COT_ID\"}"
check "confirmarReservacion" '[ "$(jget data.confirmarReservacion.estado)" = CONFIRMADA ]'
gql 'mutation($id:ID!){ cancelarReservacion(id:$id, motivo:"Prueba GraphQL") { estado } }' "{\"id\":\"$COT_ID\"}"
check "cancelarReservacion" '[ "$(jget data.cancelarReservacion.estado)" = CANCELADA ]'
gql 'mutation($id:ID!){ eliminarReservacion(id:$id) { id } }' "{\"id\":\"$COT_ID\"}"
check "eliminarReservacion" 'sin_errores'
gql 'mutation { registrarMovimientoCaja(input:{ tipo: GASTO, categoria:"ALIMENTO", concepto:"Premios (test GraphQL)", monto: 99.9 }) { id turno monto } }'
check "registrarMovimientoCaja" 'sin_errores'
gql 'mutation($id:ID!){ eliminarMascota(id:$id) { nombre } }' "{\"id\":\"$MASCOTA_ID\"}"
check "eliminarMascota" '[ "$(jget data.eliminarMascota.nombre)" = "Kira GraphQL" ]'
gql 'mutation { logout }'
check "logout" '[ "$(jget data.logout)" = true ]'

resumen

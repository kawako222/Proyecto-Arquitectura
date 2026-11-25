#!/usr/bin/env bash
# Utilidades compartidas por los scripts de prueba (requiere curl y python3).

OK=0
FAIL=0
RESP=""
STATUS=""

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
rojo() { printf '\033[31m%s\033[0m\n' "$*"; }
titulo() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

# jget <ruta>  -> extrae un valor del JSON en $RESP. Ej: jget data.id | jget data.0.numero | jget 'len:data'
jget() {
  printf '%s' "$RESP" | python3 -c '
import sys, json
ruta = sys.argv[1]
try:
    d = json.load(sys.stdin)
except Exception:
    print(""); sys.exit(0)
contar = ruta.startswith("len:")
if contar:
    ruta = ruta[4:]
for parte in [p for p in ruta.split(".") if p]:
    if isinstance(d, list):
        try:
            d = d[int(parte)]
        except (ValueError, IndexError):
            d = None
    elif isinstance(d, dict):
        d = d.get(parte)
    else:
        d = None
    if d is None:
        break
if contar:
    print(len(d) if isinstance(d, (list, dict)) else 0)
elif isinstance(d, (dict, list)):
    print(json.dumps(d, ensure_ascii=False))
elif isinstance(d, bool):
    print("true" if d else "false")
elif d is None:
    print("")
else:
    print(d)
' "$1"
}

# jfind <ruta_lista> <campo> <valor> <campo_retorno>  -> busca en una lista del JSON
jfind() {
  printf '%s' "$RESP" | python3 -c '
import sys, json
lista, campo, valor, ret = sys.argv[1:5]
d = json.load(sys.stdin)
for p in [x for x in lista.split(".") if x]:
    d = d.get(p, []) if isinstance(d, dict) else []
for item in d:
    if str(item.get(campo)) == valor:
        print(item.get(ret, "")); break
' "$1" "$2" "$3" "$4"
}

check() {
  # check <descripcion> <condicion-bash>
  local desc="$1"; shift
  if eval "$@"; then
    OK=$((OK + 1)); verde "  ✔ $desc"
  else
    FAIL=$((FAIL + 1)); rojo "  ✘ $desc"
    printf '    HTTP %s -> %s\n' "$STATUS" "$(printf '%s' "$RESP" | head -c 400)"
  fi
}

resumen() {
  printf '\nResultado: %s correctos, %s fallidos\n' "$OK" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

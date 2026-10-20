#!/usr/bin/env bash
# Arranca la app en http://localhost:8000 con un solo comando:  ./run.sh
#  - crea el entorno .venv e instala dependencias la primera vez
#  - libera el puerto si quedó una copia anterior abierta
#  - activa el asistente con Claude si encuentra la clave (variable ANTHROPIC_API_KEY
#    o archivo .anthropic_key en esta carpeta, que git ignora)
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8000}"

if [ ! -d .venv ]; then
  echo "→ Creando entorno .venv (solo la primera vez)…"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -q -r requirements.txt

if command -v lsof >/dev/null 2>&1 && lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "→ Cerrando la copia anterior que usaba el puerto $PORT…"
  lsof -ti :"$PORT" | xargs kill 2>/dev/null || true
  sleep 1
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f .anthropic_key ]; then
  ANTHROPIC_API_KEY="$(tr -d '[:space:]' < .anthropic_key)"
  export ANTHROPIC_API_KEY
fi
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "→ Asistente: Claude ACTIVADO (clave ${ANTHROPIC_API_KEY:0:10}…)"
else
  echo "→ Asistente: modo «Reglas (sin IA)». Para activar Claude, guarda tu clave en el archivo .anthropic_key"
fi

echo "→ Abriendo http://localhost:$PORT  (para apagar: Ctrl + C)"
( sleep 3; command -v open >/dev/null 2>&1 && open "http://localhost:$PORT" ) &
exec python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"

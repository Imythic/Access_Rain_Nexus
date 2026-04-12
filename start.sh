#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  RainUSE Nexus — Start All Services
# ─────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       RainUSE Nexus — Startup             ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ── 1. Python Backend ──────────────────────────────────────────────────────
echo "▶ Starting Python FastAPI backend on :8000 ..."
cd "$SCRIPT_DIR/backend"

# Create virtual env if missing
if [ ! -d ".venv" ]; then
  echo "  Creating Python virtual environment..."
  python3 -m venv .venv
fi

# Activate and install
source .venv/bin/activate
pip install -r requirements.txt -q

# Launch in background
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✅ Backend PID: $BACKEND_PID"

# ── 2. Go Logistics Service ────────────────────────────────────────────────
cd "$SCRIPT_DIR/logistics"
echo ""
echo "▶ Starting Go logistics service on :8001 ..."

if command -v go &> /dev/null; then
  go run main.go &
  LOGISTICS_PID=$!
  echo "  ✅ Logistics PID: $LOGISTICS_PID"
else
  echo "  ⚠️  Go not found — logistics service skipped."
  echo "     Install Go from https://go.dev/dl/ to enable it."
fi

# ── 3. Frontend ────────────────────────────────────────────────────────────
echo ""
echo "▶ Serving frontend..."
cd "$SCRIPT_DIR/frontend"

if command -v python3 &> /dev/null; then
  python3 -m http.server 3000 &
  FRONTEND_PID=$!
  echo "  ✅ Frontend PID: $FRONTEND_PID"
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  🌐  Open: http://localhost:3000"
  echo "  🔧  API:  http://localhost:8000"
  echo "  🚚  Go:   http://localhost:8001"
  echo "═══════════════════════════════════════════"
  echo ""
  echo "  Press Ctrl+C to stop all services."
  echo ""
fi

# ── Cleanup on exit ────────────────────────────────────────────────────────
trap "echo ''; echo 'Stopping services...'; kill $BACKEND_PID $LOGISTICS_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait

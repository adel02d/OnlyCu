#!/bin/sh
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/uvicorn ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
if [ ! -f .env ]; then
  cp .env.example .env
fi
exec .venv/bin/uvicorn agent.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload

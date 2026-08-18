import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv, set_key
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from agent.brain import generar_respuesta
from agent.memory import guardar_mensaje, inicializar_db, obtener_historial
from agent.providers import obtener_proveedor

load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
logging.basicConfig(level=logging.DEBUG if ENVIRONMENT == "development" else logging.INFO)
logger = logging.getLogger("agentkit")
PORT = int(os.getenv("PORT", "8000"))
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await inicializar_db()
    logger.info("AgentKit EnergixCu listo en puerto %s", PORT)
    yield


app = FastAPI(title="EnergixCu AgentKit", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/status")
async def health_check():
    return {
        "status": "ok",
        "service": "agentkit",
        "company": "EnergixCu",
        "agent": "Jose",
        "provider": os.getenv("WHATSAPP_PROVIDER", "whapi"),
        "backend": os.getenv("AGENT_BACKEND", "jose"),
        "tokenConfigured": bool(os.getenv("WHAPI_TOKEN") or os.getenv("META_ACCESS_TOKEN")),
        "webhookPath": "/webhook",
        "source": "https://github.com/alanjmr21/whatsapp-agent-kit",
    }


@app.get("/webhook")
async def webhook_verificacion(request: Request):
    proveedor = obtener_proveedor()
    resultado = await proveedor.validar_webhook(request)
    if resultado is not None:
        return resultado if isinstance(resultado, PlainTextResponse) else PlainTextResponse(str(resultado))
    return {"status": "ok"}


@app.post("/webhook")
async def webhook_handler(request: Request):
    try:
        proveedor = obtener_proveedor()
        mensajes = await proveedor.parsear_webhook(request)
        for msg in mensajes:
            if msg.es_propio or not msg.texto:
                continue
            logger.info("Mensaje de %s: %s", msg.telefono, msg.texto[:80])
            historial = await obtener_historial(msg.telefono)
            respuesta = await generar_respuesta(msg.texto, historial, msg.telefono)
            await guardar_mensaje(msg.telefono, "user", msg.texto)
            await guardar_mensaje(msg.telefono, "assistant", respuesta)
            await proveedor.enviar_mensaje(msg.telefono, respuesta)
        return {"status": "ok"}
    except Exception as error:
        logger.error("Error en webhook: %s", error)
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.post("/connect")
async def connect(payload: dict):
    token = str(payload.get("token") or "").strip()
    provider = str(payload.get("provider") or "whapi").strip().lower()
    webhook_url = str(payload.get("webhookUrl") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    if provider not in {"whapi", "meta", "twilio"}:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    ENV_PATH.touch(exist_ok=True)
    set_key(str(ENV_PATH), "WHATSAPP_PROVIDER", provider)
    if provider == "whapi":
        set_key(str(ENV_PATH), "WHAPI_TOKEN", token)
        os.environ["WHAPI_TOKEN"] = token
    elif provider == "meta":
        set_key(str(ENV_PATH), "META_ACCESS_TOKEN", token)
        os.environ["META_ACCESS_TOKEN"] = token
    os.environ["WHATSAPP_PROVIDER"] = provider
    webhook_ok = None
    webhook_error = None
    if provider == "whapi" and webhook_url.startswith("https://"):
        set_key(str(ENV_PATH), "PUBLIC_WEBHOOK_URL", webhook_url)
        os.environ["PUBLIC_WEBHOOK_URL"] = webhook_url
        webhook_ok, webhook_error = await _whapi_set_webhook(token, webhook_url)
    load_dotenv(ENV_PATH, override=True)
    return {
        "saved": True,
        "provider": provider,
        "tokenConfigured": True,
        "webhookConfigured": webhook_ok,
        "webhookError": webhook_error,
    }


@app.get("/chats")
async def list_whapi_chats():
    token = os.getenv("WHAPI_TOKEN")
    if not token:
        return {"chats": [], "error": "Falta el token de Whapi. Pégalo en Conexiones."}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            "https://gate.whapi.cloud/chats",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params={"count": 30},
        )
    if response.status_code >= 300:
        return {"chats": [], "error": f"Whapi {response.status_code}: {response.text[:200]}"}
    payload = response.json()
    raw = payload.get("chats") if isinstance(payload, dict) else payload
    chats = []
    for item in raw or []:
        last = item.get("last_message") or {}
        text = ""
        if isinstance(last.get("text"), dict):
            text = str(last.get("text", {}).get("body") or "")
        elif isinstance(last.get("body"), str):
            text = last["body"]
        chats.append(
            {
                "id": item.get("id"),
                "name": item.get("name") or item.get("pushname") or item.get("id"),
                "lastMessage": text,
                "timestamp": item.get("timestamp") or last.get("timestamp"),
            }
        )
    return {"chats": chats}


async def _whapi_health() -> dict | None:
    token = os.getenv("WHAPI_TOKEN")
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(
                "https://gate.whapi.cloud/health",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
        if response.status_code >= 300:
            return {"ok": False, "detail": response.text[:200]}
        data = response.json()
        return {"ok": True, "status": data.get("status") or data.get("user", {}).get("id"), "raw": data}
    except Exception as error:
        return {"ok": False, "detail": str(error)}


async def _whapi_set_webhook(token: str, url: str) -> tuple[bool | None, str | None]:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.patch(
                "https://gate.whapi.cloud/settings",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json={
                    "webhooks": [
                        {
                            "url": url,
                            "mode": "body",
                            "events": [{"type": "messages", "method": "post"}],
                        }
                    ]
                },
            )
        if response.status_code >= 300:
            return False, response.text[:240]
        return True, None
    except Exception as error:
        return False, str(error)

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

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
    load_dotenv(ENV_PATH, override=True)
    return {"saved": True, "provider": provider, "tokenConfigured": True}

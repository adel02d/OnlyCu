import logging
import os

import httpx
import yaml
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("agentkit")


def _root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cargar_config_prompts() -> dict:
    path = os.path.join(_root(), "config", "prompts.yaml")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return yaml.safe_load(handle) or {}
    except FileNotFoundError:
        logger.error("config/prompts.yaml no encontrado")
        return {}


def cargar_system_prompt() -> str:
    return cargar_config_prompts().get(
        "system_prompt",
        "Eres Jose de EnergixCu. Responde en español.",
    )


def obtener_mensaje_error() -> str:
    return cargar_config_prompts().get(
        "error_message",
        "Lo siento, estoy teniendo problemas técnicos. Intenta de nuevo en unos minutos.",
    )


def obtener_mensaje_fallback() -> str:
    return cargar_config_prompts().get(
        "fallback_message",
        "Disculpa, no entendí tu mensaje. ¿Podrías reformularlo?",
    )


async def generar_respuesta(mensaje: str, historial: list[dict], telefono: str | None = None) -> str:
    if not mensaje or len(mensaje.strip()) < 2:
        return obtener_mensaje_fallback()

    backend = os.getenv("AGENT_BACKEND", "jose").lower()
    if backend == "claude":
        return await _respuesta_claude(mensaje, historial)
    return await _respuesta_jose(mensaje, telefono)


async def _respuesta_jose(mensaje: str, telefono: str | None) -> str:
    origin = os.getenv("WORKER_ORIGIN", "http://127.0.0.1:8787").rstrip("/")
    secret = os.getenv("BRIDGE_SECRET", "energixcu-local-bridge")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{origin}/v1/agent/bridge/turn",
                headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                json={"from": telefono or "whapi-unknown", "text": mensaje, "displayName": None},
            )
        if response.status_code >= 300:
            logger.error("Jose worker %s — %s", response.status_code, response.text[:200])
            return obtener_mensaje_error()
        payload = response.json()
        parts: list[str] = []
        for reply in payload.get("replies") or []:
            if reply.get("type") == "image":
                continue
            text = reply.get("text")
            if text:
                parts.append(text)
        return "\n\n".join(parts) if parts else obtener_mensaje_fallback()
    except Exception as error:
        logger.error("Error llamando a Jose: %s", error)
        return obtener_mensaje_error()


async def _respuesta_claude(mensaje: str, historial: list[dict]) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY ausente; usando Jose")
        return await _respuesta_jose(mensaje, None)
    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        logger.error("anthropic no instalado; usando Jose")
        return await _respuesta_jose(mensaje, None)

    client = AsyncAnthropic(api_key=api_key)
    mensajes = [{"role": item["role"], "content": item["content"]} for item in historial]
    mensajes.append({"role": "user", "content": mensaje})
    try:
        response = await client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            max_tokens=1024,
            system=cargar_system_prompt(),
            messages=mensajes,
        )
        return response.content[0].text
    except Exception as error:
        logger.error("Error Claude API: %s", error)
        return obtener_mensaje_error()

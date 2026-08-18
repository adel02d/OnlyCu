import logging
import os

import httpx
from fastapi import Request

from agent.providers.base import MensajeEntrante, ProveedorWhatsApp

logger = logging.getLogger("agentkit")


class ProveedorWhapi(ProveedorWhatsApp):
    def __init__(self) -> None:
        self.url_envio = "https://gate.whapi.cloud/messages/text"

    def _token(self) -> str | None:
        return os.getenv("WHAPI_TOKEN") or None

    async def parsear_webhook(self, request: Request) -> list[MensajeEntrante]:
        body = await request.json()
        mensajes: list[MensajeEntrante] = []
        for msg in body.get("messages", []):
            texto = ""
            if isinstance(msg.get("text"), dict):
                texto = str(msg.get("text", {}).get("body") or "")
            elif isinstance(msg.get("body"), str):
                texto = msg["body"]
            mensajes.append(
                MensajeEntrante(
                    telefono=str(msg.get("chat_id") or msg.get("from") or ""),
                    texto=texto,
                    mensaje_id=str(msg.get("id") or ""),
                    es_propio=bool(msg.get("from_me", False)),
                )
            )
        return mensajes

    async def enviar_mensaje(self, telefono: str, mensaje: str) -> bool:
        token = self._token()
        if not token:
            logger.warning("WHAPI_TOKEN no configurado — mensaje no enviado")
            return False
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                self.url_envio,
                json={"to": telefono, "body": mensaje},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            if response.status_code != 200:
                logger.error("Error Whapi: %s — %s", response.status_code, response.text[:300])
            return response.status_code == 200

import logging
import os

import httpx
from fastapi import Request
from fastapi.responses import PlainTextResponse

from agent.providers.base import MensajeEntrante, ProveedorWhatsApp

logger = logging.getLogger("agentkit")


class ProveedorMeta(ProveedorWhatsApp):
    def _token(self) -> str | None:
        return os.getenv("META_ACCESS_TOKEN") or os.getenv("WHATSAPP_ACCESS_TOKEN") or None

    def _phone_id(self) -> str | None:
        return os.getenv("META_PHONE_NUMBER_ID") or os.getenv("WHATSAPP_PHONE_NUMBER_ID") or None

    def _verify(self) -> str | None:
        return os.getenv("META_VERIFY_TOKEN") or os.getenv("META_WEBHOOK_VERIFY_TOKEN") or None

    async def validar_webhook(self, request: Request):
        mode = request.query_params.get("hub.mode")
        token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")
        if mode == "subscribe" and challenge and self._verify() and token == self._verify():
            return PlainTextResponse(challenge)
        return None

    async def parsear_webhook(self, request: Request) -> list[MensajeEntrante]:
        body = await request.json()
        mensajes: list[MensajeEntrante] = []
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value") or {}
                for msg in value.get("messages", []):
                    texto = ((msg.get("text") or {}).get("body")) or ""
                    mensajes.append(
                        MensajeEntrante(
                            telefono=str(msg.get("from") or ""),
                            texto=texto,
                            mensaje_id=str(msg.get("id") or ""),
                            es_propio=False,
                        )
                    )
        return mensajes

    async def enviar_mensaje(self, telefono: str, mensaje: str) -> bool:
        token = self._token()
        phone_id = self._phone_id()
        if not token or not phone_id:
            logger.warning("Meta token o phone number id ausente")
            return False
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"https://graph.facebook.com/v21.0/{phone_id}/messages",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={
                    "messaging_product": "whatsapp",
                    "to": telefono,
                    "type": "text",
                    "text": {"preview_url": False, "body": mensaje},
                },
            )
            if response.status_code >= 300:
                logger.error("Error Meta: %s — %s", response.status_code, response.text[:300])
            return response.status_code < 300

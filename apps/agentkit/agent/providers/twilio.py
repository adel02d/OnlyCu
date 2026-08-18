import logging
import os

import httpx
from fastapi import Request

from agent.providers.base import MensajeEntrante, ProveedorWhatsApp

logger = logging.getLogger("agentkit")


class ProveedorTwilio(ProveedorWhatsApp):
    async def parsear_webhook(self, request: Request) -> list[MensajeEntrante]:
        form = await request.form()
        texto = str(form.get("Body") or "")
        telefono = str(form.get("From") or "").replace("whatsapp:", "")
        return [
            MensajeEntrante(
                telefono=telefono,
                texto=texto,
                mensaje_id=str(form.get("MessageSid") or ""),
                es_propio=False,
            )
        ]

    async def enviar_mensaje(self, telefono: str, mensaje: str) -> bool:
        sid = os.getenv("TWILIO_ACCOUNT_SID")
        token = os.getenv("TWILIO_AUTH_TOKEN")
        sender = os.getenv("TWILIO_PHONE_NUMBER")
        if not sid or not token or not sender:
            logger.warning("Twilio no configurado")
            return False
        dest = telefono if telefono.startswith("whatsapp:") else f"whatsapp:{telefono}"
        origin = sender if sender.startswith("whatsapp:") else f"whatsapp:{sender}"
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                data={"From": origin, "To": dest, "Body": mensaje},
                auth=(sid, token),
            )
            return response.status_code < 300

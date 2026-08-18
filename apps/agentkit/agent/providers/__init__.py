import os

from agent.providers.base import ProveedorWhatsApp


def obtener_proveedor() -> ProveedorWhatsApp:
    proveedor = os.getenv("WHATSAPP_PROVIDER", "whapi").lower()
    if proveedor == "whapi":
        from agent.providers.whapi import ProveedorWhapi

        return ProveedorWhapi()
    if proveedor == "meta":
        from agent.providers.meta import ProveedorMeta

        return ProveedorMeta()
    if proveedor == "twilio":
        from agent.providers.twilio import ProveedorTwilio

        return ProveedorTwilio()
    raise ValueError(f"Proveedor no soportado: {proveedor}. Usa: whapi, meta, o twilio")

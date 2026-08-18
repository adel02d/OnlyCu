import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.brain import generar_respuesta
from agent.memory import guardar_mensaje, inicializar_db, limpiar_historial, obtener_historial

TELEFONO_TEST = "test-local-001"


async def main() -> None:
    await inicializar_db()
    print("AgentKit Jose — test local. Escribe 'salir' o 'limpiar'.")
    while True:
        try:
            mensaje = input("Tu: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not mensaje:
            continue
        if mensaje.lower() == "salir":
            break
        if mensaje.lower() == "limpiar":
            await limpiar_historial(TELEFONO_TEST)
            print("[Historial borrado]")
            continue
        historial = await obtener_historial(TELEFONO_TEST)
        respuesta = await generar_respuesta(mensaje, historial, TELEFONO_TEST)
        print(f"Jose: {respuesta}\n")
        await guardar_mensaje(TELEFONO_TEST, "user", mensaje)
        await guardar_mensaje(TELEFONO_TEST, "assistant", respuesta)


if __name__ == "__main__":
    asyncio.run(main())

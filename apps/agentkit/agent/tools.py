import os

import yaml

from agent.brain import _root


def cargar_info_negocio() -> dict:
    path = os.path.join(_root(), "config", "business.yaml")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return yaml.safe_load(handle) or {}
    except FileNotFoundError:
        return {}


def buscar_en_knowledge(consulta: str) -> str:
    knowledge_dir = os.path.join(_root(), "knowledge")
    if not os.path.isdir(knowledge_dir):
        return "No hay archivos de conocimiento disponibles."
    resultados: list[str] = []
    needle = consulta.lower()
    for name in os.listdir(knowledge_dir):
        path = os.path.join(knowledge_dir, name)
        if name.startswith(".") or not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                content = handle.read()
        except (UnicodeDecodeError, OSError):
            continue
        if needle in content.lower():
            resultados.append(f"[{name}]: {content[:800]}")
    return "\n---\n".join(resultados) if resultados else "No encontré eso en el catálogo."

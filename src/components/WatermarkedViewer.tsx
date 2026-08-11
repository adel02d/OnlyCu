"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Visor con marca de agua de ESTUDIO/CREADOR (no punitiva)
 * + overlay sutil con ID anonimizado si se requiere trazabilidad, con aviso explícito.
 * 
 * NOTA ÉTICA: La marca principal es la del creador/OnlyCu. El ID del espectador solo se usa
 * si el creador lo activa y el espectador fue informado, y se muestra como hash corto, no como doxxing.
 * Las protecciones de captura (context menu, drag) son disuasorias, no garantizan nada y no deben
 * impedir reportar abusos (siempre hay botón de Reportar visible).
 */
export function WatermarkedViewer({
  src,
  poster,
  creatorHandle,
  viewerHash, // ej: últimos 6 chars del hash del telegramId, opcional
  isVideo = true,
  onReport,
}: {
  src: string; // presigned URL (60s)
  poster?: string;
  creatorHandle: string;
  viewerHash?: string;
  isVideo?: boolean;
  onReport?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expired, setExpired] = useState(false);

  // Refrescar URL cada 50s
  useEffect(() => {
    const t = setTimeout(() => setExpired(true), 55000);
    return () => clearTimeout(t);
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-xl overflow-hidden select-none group"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none" } as any}
    >
      {isVideo ? (
        <video
          src={expired ? undefined : src}
          poster={poster}
          controls
          playsInline
          controlsList="nodownload"
          className="w-full aspect-[9/16] sm:aspect-video object-contain"
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <img
          src={expired ? poster : src}
          alt="Contenido del creador"
          className="w-full object-contain max-h-[80vh]"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}

      {/* Marca de agua principal: creador */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 opacity-[0.55]">
        <div className="flex justify-between text-[11px] font-medium text-white drop-shadow">
          <span className="bg-black/40 px-2 py-1 rounded-full">@{creatorHandle} • OnlyCu</span>
          {viewerHash && <span className="bg-black/40 px-2 py-1 rounded-full">id:{viewerHash}</span>}
        </div>
        {/* marca diagonal repetida sutil */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.07] rotate-[-20deg] text-4xl font-black tracking-widest text-white pointer-events-none">
          @{creatorHandle} • ONLYCU
        </div>
        <div className="text-[10px] text-white/60 bg-black/30 self-start px-2 py-1 rounded">
          Contenido protegido • No redistribuir • Reportar abuso siempre disponible
        </div>
      </div>

      {/* Botón reportar siempre visible - ético */}
      <button
        onClick={onReport}
        className="absolute top-2 right-2 sm:bottom-3 sm:top-auto bg-red-600/90 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur"
      >
        Reportar
      </button>

      {expired && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <button onClick={() => location.reload()} className="bg-white text-black px-4 py-2 rounded-full text-sm font-medium">
            Sesión expirada (60s) — Recargar
          </button>
        </div>
      )}
    </div>
  );
}

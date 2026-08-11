"use client";
import { useEffect, useRef, useState } from "react";
import { DRM_CONFIG } from "@/lib/drm";

/**
 * Módulo DRM — Visor con marca de agua + protecciones disuasorias + refresh 50s
 * ACLARACIÓN: esto dificulta la redistribución casual, pero NO impide captura a nivel SO.
 * Por eso siempre hay botón Reportar visible y logs de acceso para auditoría.
 */
export function WatermarkedViewer({
  src,
  poster,
  creatorHandle,
  viewerHash,
  isVideo = true,
  onRefresh,
  onReport,
}: {
  src: string; // presigned URL 60s
  poster?: string;
  creatorHandle: string;
  viewerHash?: string; // hash corto anonimizado, ej: a3f9c1
  isVideo?: boolean;
  onRefresh?: () => Promise<string>; // para renovar URL sin recargar página
  onReport?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [expired, setExpired] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: 20 });
  const [showInfo, setShowInfo] = useState(true);

  // Marca en movimiento cada 3s para que no se borre con crop
  useEffect(() => {
    const id = setInterval(() => {
      setPos({ x: 10 + Math.random() * 60, y: 15 + Math.random() * 60 });
    }, DRM_CONFIG.moveIntervalMs);
    return () => clearInterval(id);
  }, []);

  // Expira en 60s - refresca automático si hay onRefresh, sino muestra overlay
  useEffect(() => {
    setExpired(false);
    const t = setTimeout(async () => {
      if (onRefresh) {
        try {
          const newUrl = await onRefresh();
          if (videoRef.current) videoRef.current.src = newUrl;
        } catch { setExpired(true); }
      } else setExpired(true);
    }, (DRM_CONFIG.presignedExpires - DRM_CONFIG.refreshBefore) * 1000);
    return () => clearTimeout(t);
  }, [src, onRefresh]);

  // Pausa video si el usuario cambia de pestaña (reduce grabación desatendida)
  useEffect(() => {
    const h = () => { if (document.hidden) videoRef.current?.pause(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  // Bloqueos disuasorios
  const block = (e: any) => e.preventDefault();

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-xl overflow-hidden select-none group"
      onContextMenu={block}
      onDragStart={block}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as any}
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls
          playsInline
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={block}
          className="w-full aspect-[9/16] sm:aspect-video object-contain"
        />
      ) : (
        <img src={src} alt="Contenido del creador" draggable={false} onContextMenu={block} className="w-full object-contain max-h-[80vh]" />
      )}

      {/* Capa watermark */}
      <div className="pointer-events-none absolute inset-0" style={{ opacity: DRM_CONFIG.watermarkOpacity }}>
        {/* Header */}
        <div className="absolute top-2 left-2 right-2 flex justify-between text-[11px] font-medium text-white">
          <span className="bg-black/50 px-2 py-1 rounded-full backdrop-blur">@{creatorHandle} • OnlyCu</span>
          {viewerHash && <span className="bg-black/50 px-2 py-1 rounded-full backdrop-blur">id:{viewerHash}</span>}
        </div>

        {/* Marca móvil */}
        <div
          className="absolute bg-black/40 text-white text-xs px-2 py-1 rounded-full backdrop-blur transition-all duration-700"
          style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)" }}
        >
          @{creatorHandle} • {viewerHash ? `id:${viewerHash}` : "OnlyCu"}
        </div>

        {/* Mosaico diagonal */}
        <div className="absolute inset-0 flex items-center justify-center rotate-[-18deg] pointer-events-none" style={{ opacity: DRM_CONFIG.mosaicOpacity }}>
          <span className="text-3xl font-black tracking-[0.2em] text-white whitespace-nowrap">
            @{creatorHandle} • ONLYCU • @{creatorHandle} • ONLYCU
          </span>
        </div>

        {/* Micro marcas esquinas */}
        <span className="absolute bottom-2 left-2 text-[9px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">© {creatorHandle}</span>
        <span className="absolute bottom-2 right-14 text-[9px] text-white/60 bg-black/30 px-1.5 py-0.5 rounded hidden sm:block">No redistribuir</span>
      </div>

      {/* Botones flotantes */}
      <button onClick={onReport} className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur">Reportar</button>
      <button onClick={() => setShowInfo(!showInfo)} className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition">DRM activo • 60s • mover bloquea crop</button>

      {showInfo && (
        <div className="absolute inset-x-2 bottom-8 bg-black/70 backdrop-blur text-[10px] text-zinc-300 rounded-lg p-2 pointer-events-none sm:hidden">
          Contenido protegido por watermark del estudio. La captura a nivel SO no se puede impedir técnicamente — usa Reportar si ves abuso.
        </div>
      )}

      {expired && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm font-medium">Sesión de visualización expirada (60s)</p>
          <p className="text-xs text-zinc-400">La URL firmada expiró para evitar filtración. Refresca para seguir viendo.</p>
          {onRefresh ? (
            <button onClick={async () => { const u = await onRefresh(); if (videoRef.current) videoRef.current.src = u; setExpired(false); }} className="bg-white text-black px-5 py-2 rounded-full text-sm font-medium">Refrescar URL</button>
          ) : (
            <button onClick={() => location.reload()} className="bg-white text-black px-5 py-2 rounded-full text-sm font-medium">Recargar</button>
          )}
        </div>
      )}

      {/* Estilo para deshabilitar selección/impresión */}
      <style>{`@media print { div[data-drm] { display:none !important; } }`}</style>
    </div>
  );
}

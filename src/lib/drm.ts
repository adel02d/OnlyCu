/**
 * Módulo de Seguridad y Protección Anti-Filtración (DRM) — OnlyCu
 * 
 * Qué hace y qué NO hace:
 * ✅ Presigned URLs 60s (S3/R2) — nunca exponer s3Key
 * ✅ Watermark estudio + hash anonimizado del espectador (disuasorio, no doxxing)
 * ✅ Marca en movimiento + mosaico diagonal + micro-watermark en esquinas
 * ✅ Anti-clic derecho / drag / selección (disuasorio, no anti-evidencia)
 * ✅ Pausa si pierde foco, refresco automático cada 50s
 * ✅ Logs de acceso (quién vio qué y cuándo) para auditoría
 * ❌ NO impide captura a nivel SO (imposible en web) — se informa como tal
 * ❌ NO geobloqueo punitivo — solo si el creador lo activa, con aviso legal
 * ❌ NO watermark con ID en claro como amenaza — solo hash corto opcional y notificado
 */

import crypto from "crypto";

export function viewerHash(telegramId: string | number): string {
  return crypto.createHash("sha256").update(String(telegramId)).digest("hex").slice(0, 6);
}

export function studioWatermarkText(handle: string): string {
  return `@${handle} • OnlyCu`;
}

// Config central
export const DRM_CONFIG = {
  presignedExpires: 60, // segundos
  refreshBefore: 10, // refrescar 10s antes de expirar
  watermarkOpacity: 0.55,
  mosaicOpacity: 0.07,
  moveIntervalMs: 3000, // mueve la marca cada 3s
};

// Log de acceso para auditoría (guardar en BD si quieres trazabilidad completa)
export type AccessLog = {
  userId: string;
  mediaId: string;
  postId: string;
  viewerHash: string;
  timestamp: string;
  userAgent?: string;
};

export function shouldAllowAccess(opts: {
  isOwner: boolean;
  hasActiveSub: boolean;
  hasPurchase: boolean;
  isPPV: boolean;
}): boolean {
  if (opts.isOwner) return true;
  if (opts.isPPV) return opts.hasPurchase || opts.hasActiveSub;
  return opts.hasActiveSub;
}

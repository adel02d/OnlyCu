# Módulo de Seguridad y Protección Anti-Filtración (DRM) — OnlyCu

## Objetivo
Dificultar la redistribución casual sin impedir la capacidad de reportar abusos.

> **Honestidad técnica:** en la web NO existe forma de impedir captura a nivel SO (OBS, grabadora del móvil, otro teléfono). Este módulo es disuasorio + trazable, no infalible.

## Componentes implementados

### 1. URLs firmadas 60s (`src/lib/s3.ts` + `src/lib/drm.ts`)
- `getPresignedUrl(s3Key, 60)` — la URL real nunca sale del backend.
- `GET /api/media/:id` verifica `JWT + isAdultVerified + suscripción/PPV` antes de firmar.
- Frontend refresca cada 50s via `onRefresh` en `WatermarkedViewer`. Sin refresco, muestra overlay "Sesión expirada".

### 2. Watermark
- **Principal:** `@handle • OnlyCu` (marca del estudio, visible siempre).
- **Secundario opcional:** `id:{hash6}` = `SHA256(telegramId).slice(0,6)` — anonimizado, corto, solo si el usuario fue informado en Términos. No se usa nombre en claro.
- **Mosaico diagonal** `opacity 0.07` + **marca móvil** que cambia de posición cada 3s (rompe crop simple) + micro-marcas en esquinas.

### 3. Protecciones disuasorias
- `user-select: none`, `onContextMenu preventDefault`, `draggable=false`, `controlsList="nodownload noplaybackrate"`, `disablePictureInPicture`, pausa al cambiar de pestaña.
- No se intenta bloquear atajos de SO — se documenta como ineficaz y contraproducente para reportes.

### 4. Trazabilidad
- `viewerHash()` centralizado en `src/lib/drm.ts`
- `AccessLog` sugerido para guardar en BD si quieres: `{userId, mediaId, viewerHash, timestamp}`
- `shouldAllowAccess({isOwner, hasActiveSub, hasPurchase, isPPV})` helper

### 5. Lo NO incluido a propósito
- ❌ Geobloqueo por IP/país como "feature" — genera evasión jurisdiccional. Si lo necesitas, hazlo a nivel CDN/WAF, no en la app, y con base legal.
- ❌ Anti-debugger / bloqueadores de DevTools — rompen accesibilidad y no aportan seguridad real.
- ❌ Watermark con nombre completo + ID en grande como amenaza — es doxxing.

## Cómo usar en un post

```tsx
import { WatermarkedViewer } from "@/components/WatermarkedViewer";
import { viewerHash } from "@/lib/drm";

<WatermarkedViewer
  src={presignedUrl} // de GET /api/media/:id
  creatorHandle="mariana.fit"
  viewerHash={viewerHash(telegramId)} // opcional
  isVideo
  onRefresh={async () => {
    const r = await fetch(`/api/media/${mediaId}`, { headers: { Authorization: `Bearer ${jwt}` } }).then(x=>x.json());
    return r.url;
  }}
  onReport={() => fetch("/api/report", { method:"POST", body: JSON.stringify({ targetId: post.id }) })}
/>
```

## Próximos pasos recomendados (fuera de este módulo)
- Añadir `Report` visible siempre (ya está el botón Reportar).
- Rate-limit en `/api/media/:id` para evitar scraping.
- Firma de imágenes en backend con `sharp` si quieres quemar watermark en el archivo (no solo overlay).

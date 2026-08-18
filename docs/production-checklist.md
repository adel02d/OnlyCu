# Checklist antes de abrir OnlyCu a usuarios reales

## Infraestructura Cloudflare

- [ ] D1 migrado remotamente y restauración/exportación probada.
- [ ] R2 no tiene acceso público.
- [ ] Secretos cargados con `wrangler secret put`, nunca en Git.
- [ ] `APP_ORIGIN` y `API_ORIGIN` usan HTTPS exacto.
- [ ] Cron del Worker verificado manualmente y en producción.
- [ ] Logs revisados sin tokens, wallets privadas, `initData` ni screenshots.
- [ ] Alertas o monitor externo configurado para `/readyz`.
- [ ] Límites de R2, Workers y D1 revisados en Cloudflare Dashboard.

## Pagos directos

- [ ] Cada creador entiende que debe comprobar su cuenta antes de aprobar una captura.
- [ ] Existe proceso de disputa/reembolso para cliente.
- [ ] Los detalles de pago del creador se cifran y sólo se muestran al comprador autorizado.
- [ ] Pruebas de duplicación: mismo comprobante, dos aprobaciones, reintentos y expiración.
- [ ] QvaPay/CUP/USDT/TON están habilitados únicamente después de pruebas con cuentas reales autorizadas.
- [ ] El creador nunca envía seed phrase, clave privada o contraseña a la plataforma.

## Comisión de plataforma

- [ ] Comisión fija validada en 10% (`1000` bps).
- [ ] Tasas CUP/USD/TON → USDT son ingresadas por administrador y revisadas antes de facturar.
- [ ] Cada invoice conserva snapshot de tasa e importe, no se recalcula retroactivamente.
- [ ] Notificación se emite al creador al crear la factura.
- [ ] Suspensión se ejecuta cinco días después de `due_at`.
- [ ] Aprobación de admin reactiva al creador sólo si no existen otras facturas pendientes.

## Registro y contenido

- [ ] Términos y política de privacidad publicados.
- [ ] La autodeclaración 18+ usa texto legal revisado y versión guardada.
- [ ] Se entiende que autodeclaración no equivale a KYC ni verificación legal de edad.
- [ ] Contenido adulto permanece deshabilitado hasta tener política de edad, consentimiento y moderación adecuada.
- [ ] Creadores y administradores conocen proceso de reporte/takedown.

## Multimedia

- [ ] Sólo JPEG/PNG/WebP para capturas, máximo 5 MB.
- [ ] Sólo media de creadores confiables, máximo 25 MB, para MVP.
- [ ] Se añade scanner/transcoder antes de permitir media de usuarios no confiables o vídeo a escala.
- [ ] Media entregada por Worker/R2 privado, con token de 60 segundos y watermark visible.
- [ ] Pruebas de Range requests en Android/iOS/Desktop Telegram.

## Agente EnergixCu

- [ ] Webhooks de WhatsApp y Messenger apuntan a HTTPS del Worker.
- [ ] `META_WEBHOOK_VERIFY_TOKEN` coincide con el verify token de Meta.
- [ ] Secretos de envío (`WHATSAPP_*`, `MESSENGER_*`) cargados con `wrangler secret put`.
- [ ] Firma `X-Hub-Signature-256` activa en producción (`*_APP_SECRET`).
- [ ] Chat de `/agente` genera ticket con los 5 datos y sólo efectivo/transferencia.

## Pruebas

- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run worker:dry-run`
- [ ] Flujo completo cliente → captura → creador aprueba → acceso a media.
- [ ] Flujo completo 30 días → invoice USDT → captura creador → admin aprueba → reactivación.
- [ ] Pruebas desde Telegram Android, iOS, Desktop y Web.

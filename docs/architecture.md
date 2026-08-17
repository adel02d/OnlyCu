# Arquitectura Cloudflare de OnlyCu

## Principio financiero

OnlyCu no recibe ni custodia el dinero del cliente final.

```text
Cliente ── pago directo ──► Creador
Cliente ── captura privada ─► OnlyCu Worker/R2
Creador ── confirmación manual ─► desbloqueo PPV o suscripción

Cada 30 días:
Creador ── 10% consolidado en USDT ──► Plataforma
Creador ── captura privada ───────────► OnlyCu Worker/R2
Administrador ── confirmación manual ─► reactivación / ciclo pagado
```

Esto evita que la plataforma procese automáticamente fondos de clientes. No elimina obligaciones legales, fiscales, de protección al consumidor o de proveedores de pago.

## Componentes

| Componente               | Responsabilidad                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Cloudflare Pages         | Export estático Next.js de la Telegram Mini App.                                     |
| Cloudflare Worker + Hono | API, auth Telegram, CORS, derechos de media, pagos manuales, cron y Bot API webhook. |
| Cloudflare D1            | Usuarios, posts, pruebas, entitlements, ciclos e invoices.                           |
| Cloudflare R2            | Media, screenshots de clientes y screenshots de creadores. Sin acceso público.       |
| Telegram Bot API         | `initData`, Main Mini App, menú y avisos opcionales.                                 |

## Autenticación

1. Telegram abre Pages y aporta `initData` raw.
2. `POST /v1/auth/telegram` valida HMAC con el token del bot.
3. Worker crea/actualiza `users` y emite JWT HS256 corto de 15 minutos.
4. Cada petición protegida consulta el usuario y roles actuales de D1.
5. `session_version` permite invalidar sesiones futuras.

## Registro sin KYC

El registro no pide documento ni selfie:

- Telegram ID firmado;
- aceptación de términos;
- autodeclaración 18+;
- onboarding de creador opcional con handle y precio.

La tabla guarda `adult_declared_at`, no una afirmación falsa de verificación de edad. El contenido marcado `18_PLUS` exige esta autodeclaración, pero debe mantenerse restringido hasta que exista una política legal y de moderación adecuada.

## Pago directo de cliente a creador

1. El creador registra un método: `QVAPAY`, `CUP`, `USDT_TRC20`, `USDT_BEP20` o `TON`.
2. Los datos del receptor se cifran AES-GCM con `PAYMENT_DETAILS_ENCRYPTION_KEY`.
3. El cliente inicia un `payment_claim` para post PPV o suscripción.
4. Worker crea snapshot cifrado del receptor y muestra los datos sólo a ese comprador.
5. El cliente paga fuera de OnlyCu y carga imagen privada de hasta 5 MB.
6. Worker valida firma JPEG/PNG/WebP, la almacena privada en R2 y notifica al creador.
7. El creador confirma que recibió el dinero:
   - PPV: crea `post_entitlement`.
   - Suscripción: crea/extiende 30 días en `subscriptions`.
8. El reclamo aprobado se convierte en venta contabilizable para el ciclo de comisión.

El creador no debe aprobar una captura si no comprobó el dinero en su cuenta. La plataforma debe incluir un proceso de disputa antes de abrir ventas públicas.

## Comisión de plataforma: 10% en USDT

- `platform_settings.commission_bps` queda fijado en `1000` (10%).
- Al cumplirse 30 días, cron agrupa ventas aprobadas por moneda.
- Un admin mantiene `platform_exchange_rates`: `CUP`, `USD`, `USDT` y `TON` → USDT.
- Cada ciclo guarda su propio `usdt_rate_snapshot`, total USDT y 10% calculado.
- La factura se notifica y vence cinco días después.
- El creador transfiere USDT a la wallet de plataforma configurada en Worker, sube captura y espera aprobación de admin.
- Si vence: `creator_profiles.status = SUSPENDED_OVERDUE`.
- Un creador suspendido conserva acceso a sus facturas, pero no vende ni entrega contenido.
- Al aprobar la factura y no existir otra deuda, se reactiva automáticamente.

## Protección de media

R2 no es público. El flujo es:

1. Frontend autenticado solicita `/v1/media/:id/access`.
2. Worker verifica post publicado, estado del creador, autodeclaración 18+, suscripción o entitlement PPV.
3. Registra evento de acceso con IP/User-Agent hasheados.
4. Emite un token HMAC específico para usuario+asset con 60 segundos de vida.
5. El navegador abre `/v1/media/:id/stream?token=...`.
6. Worker vuelve a validar autorización y hace stream privado desde R2, compatible con Range requests.
7. `SecureMediaViewer` superpone watermark de Telegram ID, username y hora.

Esto reduce filtraciones casuales, pero no equivale a DRM inviolable: un usuario autorizado puede grabar otra pantalla o capturar bytes antes de la caducidad.

## Cron

`wrangler.toml` programa cron horario:

```toml
[triggers]
crons = ["0 * * * *"]
```

El cron:

- crea/continúa ciclos de 30 días;
- emite facturas cuando existen tasas;
- marca facturas vencidas;
- suspende creadores atrasados;
- genera notificaciones internas y, si el usuario inició el bot, aviso Telegram opcional.

## Datos sensibles

| Dato                              | Tratamiento                                             |
| --------------------------------- | ------------------------------------------------------- |
| Token bot, JWT, HMAC, AES         | Secret de Cloudflare; nunca Pages/Git.                  |
| Destino CUP/QvaPay/wallet creador | AES-GCM en D1; sólo se descifra a comprador autorizado. |
| Screenshots                       | R2 privado; Worker comprueba permisos.                  |
| IP/User-Agent                     | HMAC antes de almacenarlo.                              |
| Wallet de plataforma              | Variable Worker visible sólo a creadores con invoice.   |

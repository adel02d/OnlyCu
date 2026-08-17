# Despliegue de OnlyCu en Cloudflare Free

Esta guía despliega el MVP con **Cloudflare Pages + Workers + D1 + R2**. No hay Render, Supabase ni monitor keep-alive.

> Mantenerse dentro de cuotas gratuitas no convierte automáticamente el proyecto en una operación de pagos/multimedia lista para producción. Revisa los límites, la legislación y las políticas de Telegram/proveedores antes de activar contenido sensible o dinero real.

## 1. Requisitos

- Cuenta de Cloudflare.
- Node.js 22+ y npm 10+.
- Cuenta Telegram y un bot creado con `@BotFather`.
- Repositorio GitHub para Pages, o Wrangler CLI para deploy manual.

Instala dependencias:

```bash
npm ci
npx wrangler login
```

## 2. Crear recursos Cloudflare

### D1

```bash
npx wrangler d1 create onlycu-db
```

Cloudflare devolverá un `database_id`. Copia ese valor en:

```toml
# apps/worker/wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "onlycu-db"
database_id = "PEGA_AQUI_EL_DATABASE_ID"
```

### R2

```bash
npx wrangler r2 bucket create onlycu-media
```

No habilites acceso público para el bucket. El Worker entrega media sólo después de validar permisos.

### Configurar URLs públicas

En `apps/worker/wrangler.toml`, sustituye:

```toml
APP_ORIGIN = "https://REPLACE_WITH_YOUR_PAGES_DOMAIN.pages.dev"
API_ORIGIN = "https://REPLACE_WITH_YOUR_WORKER.workers.dev"
PLATFORM_USDT_ADDRESS = "REPLACE_WITH_PLATFORM_USDT_WALLET"
```

Usa estos valores finales:

- `APP_ORIGIN`: URL de Pages, por ejemplo `https://onlycu-web.pages.dev`.
- `API_ORIGIN`: URL del Worker, por ejemplo `https://onlycu-api.tu-subdominio.workers.dev`.
- `PLATFORM_USDT_ADDRESS`: wallet USDT de la plataforma a la que los creadores pagarán su 10%.
- `PLATFORM_USDT_NETWORK`: normalmente `TRC20`, salvo que decidas usar otra red.

En el primer despliegue puedes usar las URLs esperadas por nombre y volver a desplegar al obtener las definitivas.

## 3. Aplicar la migración D1

Prueba primero en local:

```bash
npm run worker:d1:migrate:local
```

Después aplica la misma migración remota:

```bash
npm run worker:d1:migrate:remote
```

La migración crea usuarios, roles, creadores, posts, media, reclamos de pago directo, entitlements, facturación USDT, comprobantes, notificaciones y auditoría.

## 4. Cargar secretos

Nunca pongas estos valores en `wrangler.toml`, Git o el frontend.

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put PII_HASH_SECRET
npx wrangler secret put PAYMENT_DETAILS_ENCRYPTION_KEY
```

Genera secretos localmente:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Para `PAYMENT_DETAILS_ENCRYPTION_KEY` necesitas exactamente 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copia el resultado sólo cuando Wrangler lo solicite. No lo pegues en chat, capturas, logs o repositorios.

## 5. Desplegar Worker

```bash
npm run worker:deploy
```

Verifica:

```bash
curl https://TU_WORKER.workers.dev/healthz
curl https://TU_WORKER.workers.dev/readyz
```

Esperado:

```json
{ "status": "ok" }
```

Y:

```json
{ "status": "ready" }
```

## 6. Desplegar frontend en Cloudflare Pages

Primero construye con la URL real del Worker:

```bash
NEXT_PUBLIC_API_ORIGIN=https://TU_WORKER.workers.dev npm run build --workspace=@onlycu/web
```

Crea el proyecto Pages una sola vez:

```bash
npx wrangler pages project create onlycu-web --production-branch main
```

Despliega:

```bash
npx wrangler pages deploy apps/web/out --project-name onlycu-web --branch main
```

Al terminar, Cloudflare muestra una URL parecida a:

```text
https://onlycu-web.pages.dev
```

Actualiza `APP_ORIGIN` en `wrangler.toml` con esa URL y vuelve a desplegar el Worker:

```bash
npm run worker:deploy
```

Después reconstruye/republica Pages si cambió `NEXT_PUBLIC_API_ORIGIN`.

El archivo `apps/web/public/_headers` se copia a `out/_headers` y configura CSP, `Referrer-Policy` y otros headers para Pages. Si utilizas un dominio Worker propio en vez de `workers.dev`, ajusta en ese archivo `connect-src` y `media-src` al dominio HTTPS exacto antes de publicar.

## 7. Configurar Telegram

### Crear bot

En `@BotFather`:

```text
/newbot
```

Nombre visible sugerido:

```text
OnlyCu
```

El username debe ser único y terminar en `bot`, por ejemplo:

```text
OnlyCuAppBot
```

El token del bot se guarda únicamente como secreto del Worker.

### Main Mini App y Menu Button

En `@BotFather`:

1. Ejecuta `/myapps` y crea/configura la Main Mini App.
2. URL: `https://onlycu-web.pages.dev`.
3. Ejecuta `/setmenubutton`.
4. Texto: `Abrir OnlyCu`.
5. URL: la misma URL de Pages.

### Webhook Telegram opcional

El webhook permite que `/start` guarde el chat privado para que el sistema pueda enviar recordatorios de factura por Telegram. Usa un secreto distinto:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://TU_WORKER.workers.dev/v1/telegram/webhook" \
  -d "secret_token=TU_TELEGRAM_WEBHOOK_SECRET"
```

No imprimas el token en tu historial de shell. Puedes exportarlo temporalmente en una terminal privada.

## 8. Crear primer administrador

Después de abrir la Mini App una vez, identifica tu usuario en D1:

```bash
npx wrangler d1 execute onlycu-db --remote \
  --command "SELECT id, telegram_id, username FROM users ORDER BY created_at DESC LIMIT 10"
```

Asigna rol admin:

```bash
npx wrangler d1 execute onlycu-db --remote \
  --command "INSERT OR IGNORE INTO user_roles (user_id, role, assigned_at) VALUES ('TU_UUID', 'ADMIN', datetime('now'))"
```

Para pruebas de creador:

```bash
npx wrangler d1 execute onlycu-db --remote \
  --command "INSERT OR IGNORE INTO user_roles (user_id, role, assigned_at) VALUES ('TU_UUID', 'CREATOR', datetime('now'))"
```

El usuario también puede usar el endpoint de onboarding de creador desde la Mini App después de aceptar términos y autodeclararse 18+.

## 9. Configurar tasas para la factura USDT

La plataforma cobra exactamente 10%, pero el 10% se consolida en USDT. Un admin debe cargar tasas para las monedas usadas por los creadores:

```http
PUT /v1/admin/exchange-rates/CUP
Authorization: Bearer <admin-token>
Content-Type: application/json

{ "usdtPerUnit": "0.003" }
```

Las tasas se congelan en cada línea de factura al emitirla. Nunca se recalcula una factura antigua con una tasa nueva.

## 10. Ciclo de facturación

1. Un creador se registra y su primer ciclo termina a los 30 días.
2. El cron del Worker se ejecuta cada hora.
3. Agrupa reclamos de cliente aprobados por moneda.
4. Convierte cada total a USDT con la tasa vigente del administrador.
5. Calcula el 10%.
6. Emite una factura en USDT y notifica al creador.
7. El creador tiene 5 días para pagar directamente a la wallet de plataforma y subir una captura.
8. El admin aprueba o rechaza la captura.
9. Si no hay pago después de la fecha límite, el creador queda `SUSPENDED_OVERDUE`.
10. Tras aprobación de la factura, el creador se reactiva si no tiene más facturas pendientes.

## 11. Límites recomendados para MVP

- Sólo creadores de confianza.
- Archivos de media máximos de 25 MB.
- Comprobantes máximos de 5 MB y sólo JPEG/PNG/WebP.
- Vídeos MP4/WebM cortos y ya comprimidos.
- No habilitar contenido adulto real sin revisar legalmente edad, consentimiento, moderación y políticas de proveedores.
- No habilitar QvaPay/CUP/cripto para dinero real hasta probar el flujo completo con cuentas de prueba y conciliación humana.

## 12. Verificación antes de invitar usuarios

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run worker:dry-run
```

Prueba desde Telegram:

1. Abrir Mini App.
2. Aceptar términos y autodeclaración 18+.
3. Crear creador y método de pago.
4. Crear post PPV.
5. Cliente crea reclamo y recibe los datos de pago del creador.
6. Cliente sube captura.
7. Creador aprueba y el cliente accede al media.
8. Simular factura mensual, subir comprobante USDT y aprobar desde admin.

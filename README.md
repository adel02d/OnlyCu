# OnlyCu

OnlyCu es una **Telegram Mini App** construida para creadores que cobran directamente a sus clientes mediante QvaPay, CUP, USDT o TON. La plataforma no custodia pagos de clientes: el comprador sube una captura, el creador confirma que recibió el dinero y el sistema desbloquea el post PPV o la suscripción.

La plataforma factura al creador cada 30 días el **10% de ventas aprobadas**, consolidado en USDT con una tasa que el administrador define y congela en cada factura. Si una factura permanece impaga cinco días después de ser notificada, el creador se suspende; al aprobarse su comprobante de pago USDT, se reactiva.

## Stack Cloudflare

```text
Cloudflare Pages      → frontend Next.js exportado estáticamente
Cloudflare Workers    → API Hono, Telegram auth, pagos manuales y cron
Cloudflare D1         → datos relacionales SQLite
Cloudflare R2         → media y comprobantes privados
Telegram Bot API      → Mini App y notificaciones opcionales
```

No se usa Render, Supabase ni UptimeRobot para la operación principal. Workers no tienen el cold start por inactividad propio de un Web Service gratuito de Render.

## Reglas de producto implementadas

- Inicio de sesión simple mediante `initData` firmado de Telegram.
- Registro con aceptación de términos y autodeclaración 18+, sin KYC obligatorio.
- El contenido 18+ requiere dicha autodeclaración; no debe interpretarse como verificación legal de edad o identidad.
- Creadores configuran destinos de pago directos: QvaPay, CUP, USDT TRC-20/BEP-20 o TON.
- Datos de destino de pago se guardan cifrados y se muestran solo al comprador que inició el reclamo de pago.
- Cliente → creador: comprobante privado → aprobación manual del creador → entitlement PPV o suscripción de 30 días.
- Creador → plataforma: factura mensual del 10% en USDT → comprobante privado → aprobación manual de administrador.
- Suspensión automática por atraso de cinco días y reactivación tras aprobación.
- R2 privado; el navegador recibe un token de streaming de media de 60 segundos, no una URL pública del bucket.
- Watermark dinámico con usuario/ID Telegram en el visor React.

## Agente Jose (EnergixCu)

El Worker incluye a **Jose**, asesor de ventas de EnergixCu, conectado a:

- chat web en `/agente`
- webhook de **WhatsApp Cloud API** (`/v1/whatsapp/webhook`)
- webhook de **Facebook Messenger** (`/v1/messenger/webhook`)

Guía de secretos y alta en Meta: [docs/energix-agent.md](docs/energix-agent.md).

## Inicio local

```bash
npm ci
cp .env.example apps/worker/.dev.vars

# Sustituye los placeholders en apps/worker/.dev.vars.
npm run worker:d1:migrate:local
npm run dev
```

- Worker local: `http://localhost:8787`
- Frontend Next.js: `http://localhost:3000`

## Validación

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run worker:dry-run
```

## Despliegue Cloudflare

Sigue la guía completa en [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).

Resumen:

1. Crear D1 y R2.
2. Reemplazar placeholders en `apps/worker/wrangler.toml`.
3. Aplicar migración D1 remota.
4. Cargar secretos con `wrangler secret put`.
5. Desplegar Worker.
6. Construir/desplegar Pages con `NEXT_PUBLIC_API_ORIGIN`.
7. Configurar Main Mini App y Menu Button en `@BotFather`.

## Límites importantes

Cloudflare Free permite lanzar un MVP, pero no sustituye obligaciones operativas o legales. Antes de habilitar pagos reales, contenido adulto o vídeo a escala se requieren moderación, proceso de disputas, scanner/transcoder, backups, revisión legal y controles de edad/identidad adecuados para la jurisdicción y proveedores involucrados.

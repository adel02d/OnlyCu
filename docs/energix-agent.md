# Jose — agente EnergixCu en WhatsApp y Messenger

Jose es el asesor de ventas de EnergixCu. Atiende por **chat web**, **WhatsApp Cloud API** y **Facebook Messenger**, con el mismo motor de catálogo, toma de datos y ticket oficial.

## Endpoints

| Ruta                                  | Uso                                                          |
| ------------------------------------- | ------------------------------------------------------------ |
| `GET /v1/agent/catalog`               | Catálogo activo                                              |
| `GET /v1/agent/channels`              | Estado de conexión (sin secretos)                            |
| `POST /v1/agent/chat`                 | Chat web / simulador                                         |
| `GET /v1/agent/conversations/:id`     | Historial y tickets de una conversación                      |
| `GET /v1/agent/orders`                | Tickets de una conversación, o todos con `X-Agent-Admin-Key` |
| `POST /v1/agent/admin/daily-products` | Marca productos nuevos del día                               |
| `GET/POST /v1/whatsapp/webhook`       | Verificación y mensajes WhatsApp                             |
| `GET/POST /v1/messenger/webhook`      | Verificación y mensajes Messenger                            |

## Secretos del Worker

Nunca los subas a Git. En local van en `apps/worker/.dev.vars`. En Cloudflare:

```bash
npx wrangler secret put META_WEBHOOK_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put MESSENGER_PAGE_ACCESS_TOKEN
npx wrangler secret put MESSENGER_APP_SECRET
npx wrangler secret put AGENT_ADMIN_KEY
```

`META_GRAPH_API_VERSION` (por defecto `v21.0`) puede vivir en `wrangler.toml`.

## WhatsApp

1. [Meta for Developers](https://developers.facebook.com/) → app Business → producto **WhatsApp**.
2. Callback URL: `https://TU_DOMINIO/v1/whatsapp/webhook`
3. Verify token: el mismo valor de `META_WEBHOOK_VERIFY_TOKEN`.
4. Suscribe el campo `messages`.
5. Copia el _Phone number ID_ y un token permanente.

El Worker responde `hub.challenge` en el GET y valida `X-Hub-Signature-256` cuando existe `WHATSAPP_APP_SECRET`.

## Messenger

1. En la misma app añade **Messenger**.
2. Conecta una Página de Facebook.
3. Callback URL: `https://TU_DOMINIO/v1/messenger/webhook`
4. Mismo verify token.
5. Suscribe `messages`.
6. Usa un _Page access token_ de larga duración.

## Ticket

Cuando el cliente confirma los 5 datos (nombre, producto, cantidad, dirección, efectivo o transferencia) Jose emite:

```text
--------------------------------------------------
⚡ TICKET DE PEDIDO - ENERGIXCU ⚡
- Cliente: ...
- Producto: ...
- Cantidad: ...
- Dirección: ...
- Forma de pago: Efectivo
--------------------------------------------------
```

Pago aceptado: **efectivo** o **transferencia** (Transfermóvil / EnZona / MLC-CUP).

## UI

Abre `/agente` para probar el chat, ver tickets y copiar las URLs de webhook.

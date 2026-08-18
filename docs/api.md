# API Cloudflare Worker

Base URL:

```text
https://onlycu-api.<account>.workers.dev
```

Las rutas protegidas usan:

```http
Authorization: Bearer <JWT>
```

## Sesión y registro

| Ruta                                     | Uso                                                             |
| ---------------------------------------- | --------------------------------------------------------------- |
| `POST /v1/auth/telegram`                 | Valida `initData` raw de Telegram y devuelve JWT de 15 minutos. |
| `GET /v1/auth/me`                        | Perfil y roles de sesión.                                       |
| `POST /v1/account/complete-registration` | Requiere `{ "acceptTerms": true, "declareAdult": true }`.       |
| `POST /v1/creator/onboard`               | Crea perfil de creador sin KYC obligatorio.                     |
| `GET /v1/notifications`                  | Avisos internos.                                                |
| `POST /v1/notifications/:id/read`        | Marca aviso leído.                                              |

## Creador

| Ruta                                           | Uso                                               |
| ---------------------------------------------- | ------------------------------------------------- |
| `GET /v1/creator/dashboard`                    | Métricas, ventas aprobadas y facturas pendientes. |
| `GET/POST /v1/creator/payment-methods`         | Configura receptor QvaPay/CUP/USDT/TON cifrado.   |
| `GET/POST /v1/creator/posts`                   | Lista o crea borrador.                            |
| `POST /v1/creator/posts/:postId/media`         | Sube archivo a R2 privado, máximo 25 MB.          |
| `POST /v1/creator/posts/:postId/publish`       | Publica borrador con media.                       |
| `GET /v1/creator/payment-claims`               | Cola de capturas de clientes.                     |
| `POST /v1/creator/payment-claims/:id/approve`  | Confirma pago directo y desbloquea entitlement.   |
| `POST /v1/creator/payment-claims/:id/reject`   | Rechaza prueba.                                   |
| `GET /v1/creator/platform-invoices`            | Facturas del 10% en USDT.                         |
| `POST /v1/creator/platform-invoices/:id/proof` | Creador sube captura de pago a plataforma.        |

## Cliente

| Ruta                                          | Uso                                                           |
| --------------------------------------------- | ------------------------------------------------------------- |
| `GET /v1/posts`                               | Feed publicado disponible para sesión.                        |
| `GET /v1/creators/:creatorId/payment-methods` | Métodos activos del creador, sin revelar destino aún.         |
| `POST /v1/payment-claims`                     | Inicia pago directo y recibe instrucciones del creador.       |
| `POST /v1/payment-claims/:id/proof`           | Sube captura del pago al creador.                             |
| `GET /v1/payment-claims/:id`                  | Estado de pago.                                               |
| `GET /v1/payment-claims/:id/proof`            | Comprador, creador o admin revisa captura.                    |
| `GET /v1/media/:id/access`                    | Devuelve token de streaming de 60 segundos tras autorización. |
| `GET /v1/media/:id/stream?token=`             | Stream R2 privado.                                            |

Ejemplo de inicio de pago PPV:

```json
POST /v1/payment-claims
{
  "targetType": "POST",
  "postId": "uuid-del-post",
  "paymentMethodId": "uuid-del-metodo-del-creador"
}
```

Respuesta resumida:

```json
{
  "paymentClaim": {
    "id": "uuid",
    "amount": "2.50",
    "currency": "USDT",
    "status": "AWAITING_TRANSFER",
    "paymentMethod": {
      "type": "USDT_TRC20",
      "network": "TRON",
      "recipientDetails": "wallet-del-creador"
    }
  }
}
```

El cliente paga fuera de la plataforma, carga una imagen JPEG/PNG/WebP y el creador aprueba manualmente.

## Administración

| Ruta                                           | Uso                                                 |
| ---------------------------------------------- | --------------------------------------------------- |
| `GET /v1/admin/platform-settings`              | Comisión fija y destino USDT de plataforma.         |
| `PATCH /v1/admin/platform-settings`            | Sólo acepta 1000 bps (10%).                         |
| `PUT /v1/admin/exchange-rates/:currency`       | Fija tasa de conversión a USDT para ciclos futuros. |
| `POST /v1/admin/billing/run`                   | Ejecuta reconciliación manualmente.                 |
| `GET /v1/admin/platform-invoices`              | Facturas de creadores.                              |
| `GET /v1/admin/payment-claims`                 | Auditoría de reclamos de pago directo.              |
| `GET /v1/admin/media-access-events`            | Eventos de acceso, bloqueos y stream de media.      |
| `GET /v1/admin/platform-invoices/:id/proof`    | Captura enviada por creador.                        |
| `POST /v1/admin/platform-invoices/:id/approve` | Marca factura pagada y reactiva si no hay deuda.    |
| `POST /v1/admin/platform-invoices/:id/reject`  | Devuelve factura a estado de pago pendiente.        |
| `GET /v1/admin/audit-events`                   | Auditoría.                                          |

## Agente EnergixCu (Jose)

| Ruta                                  | Uso                                                     |
| ------------------------------------- | ------------------------------------------------------- |
| `GET /v1/agent/catalog`               | Catálogo y métodos de pago (efectivo / transferencia).  |
| `GET /v1/agent/channels`              | Estado de WhatsApp, Messenger y chat web.               |
| `POST /v1/agent/chat`                 | Turno de conversación del chat web.                     |
| `GET /v1/agent/conversations/:id`     | Historial y tickets de una conversación.                |
| `GET /v1/agent/orders`                | Tickets. Sin admin key sólo acepta `conversationId`.    |
| `POST /v1/agent/admin/daily-products` | Publica productos nuevos del día (`X-Agent-Admin-Key`). |
| `GET/POST /v1/whatsapp/webhook`       | Verificación Meta y mensajes WhatsApp.                  |
| `GET/POST /v1/messenger/webhook`      | Verificación Meta y mensajes Messenger.                 |

## Operación

| Ruta                        | Uso                                                             |
| --------------------------- | --------------------------------------------------------------- |
| `GET /healthz`              | Salud del Worker.                                               |
| `GET /readyz`               | Comprueba D1.                                                   |
| `POST /v1/telegram/webhook` | Webhook Bot API opcional, protegido por secret header Telegram. |

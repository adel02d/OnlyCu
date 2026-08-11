# OnlyCu — Plataforma de creadores en Telegram Mini App

> **Solo +18** • Pagos internacionales para Cuba vía **QvaPay** + **Cripto (USDT/TON)** + **CUP manual con comprobante**

Stack: **Next.js 14 (TMA) + Prisma + PostgreSQL + S3 presigned URLs (60s) + QvaPay + TON/USDT**

---

## ¿Por qué este diseño?

En Cuba la única forma fiable de cobrar desde el exterior es **QvaPay** y **criptomonedas**. Se integra además **transferencia CUP manual** con flujo de **aprobación humana y trazabilidad completa** (no opaco). Todo el acceso multimedia usa **URLs firmadas que expiran en 60s** y marca de agua del **estudio/creador**, no punitiva.

Incluye **Age Gate +18** obligatorio (botón "Sí, tengo 18 años" + registro en BD + `AgeVerification` con hash de IP anonimizado y Términos v1.0). Sin esto no se emite sesión útil.

### Lo que NO hace (a propósito)
- ❌ Geobloqueo para evadir jurisdicción — no incluido. Hay logs de moderación y endpoint `/api/report`.
- ❌ Anti-captura a nivel SO/navegador que impida evidenciar abusos — solo disuasión ligera (`user-select:none`, `nodownload`) y **botón Reportar siempre visible**.
- ❌ Watermark con Telegram User ID en claro como amenaza — la marca principal es `@handle` del creador; el hash del espectador es opcional, corto, anonimizado y **solo si el usuario fue informado**.

---

## Estructura

```
prisma/schema.prisma        # Users, CreatorProfile, Subscription, Post, Media, Payment, ManualProof, AgeVerification, Report
src/lib/telegram.ts         # valida initData (HMAC SHA256 con BOT_TOKEN)
src/lib/s3.ts               # getPresignedUrl 60s
src/lib/qvapay.ts           # create_invoice + webhook
src/lib/auth.ts             # JWT de sesión TMA
src/components/AgeGate.tsx  # Modal +18 con doble checkbox
src/components/WatermarkedViewer.tsx # Visor con marca de estudio + hash opcional
src/app/api/auth/telegram   # login TMA
src/app/api/auth/verify-age # confirma +18
src/app/api/media/[id]      # presigned URL si tiene suscripción/PPV
src/app/api/payments/qvapay/webhook
src/app/api/payments/manual # subir comprobante CUP
```

## Flujo

1. Usuario abre Mini App → `window.Telegram.WebApp.initData` → `POST /api/auth/telegram` → JWT.
2. Si `isAdultVerified=false` → se muestra **AgeGate** → `POST /api/auth/verify-age` → marca `User.isAdultVerified`.
3. Suscripción: `createQvaPayInvoice` o QR USDT/TON o `POST /api/payments/manual` → `ManualProof PENDING` → admin aprueba → `Payment COMPLETED` → `Subscription ACTIVE`.
4. Ver contenido: `GET /api/media/:id` verifica JWT + suscripción/PPV → devuelve **presigned URL 60s**.

## Variables de entorno

Copia `.env.example` a `.env` y completa. Mínimo para dev sin pagos reales:

```
DATABASE_URL
TELEGRAM_BOT_TOKEN
JWT_SECRET
S3_BUCKET + credenciales (o usa R2)
QVAPAY_APP_ID/SECRET (solo prod)
```

## Desarrollo

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev # http://localhost:3000
```

La TMA debe abrirse dentro de Telegram. Para dev local usa `ngrok` o el preview de Arena y configura el bot con `/setmenubutton`.

## Moderación y legal

- Todos los creadores pasan verificación +18 antes de publicar.
- Cada `Post` y `User` puede ser reportado (`Report`).
- Transferencias CUP manuales quedan con `screenshotUrl` + `reviewedBy`/`reviewedAt` — auditables.
- Términos incluyen tolerancia cero a menores y NCII.

---

Hecho con ❤️ para creadores cubanos. Si necesitas añadir TON Connect o NOWPayments para USDT, está preparado en `src/lib/qvapay.ts` como referencia.

# Deploy a producción — Render + Supabase + Telegram Bot (Unerubot/BotFather)

Esta guía te lleva de cero a `https://onlycu.onrender.com` funcionando con pagos QvaPay + Cripto + CUP por captura.

---

## 0. Requisitos

- GitHub con el repo `adel02d/OnlyCu` (rama `arena/019ff12a-onlycu`)
- Cuenta en [Supabase](https://supabase.com)
- Cuenta en [Render](https://render.com)
- Telegram + [@BotFather](https://t.me/BotFather)
- S3/R2 para media (Supabase Storage, Cloudflare R2 o AWS S3)
- Credenciales QvaPay (`APP_ID` / `APP_SECRET`)

---

## 1. Supabase — Base de datos Postgres

1. **Crea proyecto** en Supabase → elige región cercana (Miami/US-East te da mejor latencia para Cuba/Render).
2. **Database → Connection string → Session pooler** (puerto `6543`). Copia la URI:
   ```
   postgresql://postgres.PROJECTREF:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```
   > En Supabase free, usa siempre **pooler** (`6543` + `?pgbouncer=true`) para Render, no la directa 5432.

3. **Habilita `pgcrypto` si quieres** (opcional): `Database → Extensions`.

4. **Prueba localmente** (una sola vez desde tu PC):
   ```bash
   git clone https://github.com/adel02d/OnlyCu.git
   cd OnlyCu
   git checkout arena/019ff12a-onlycu
   npm install
   # pon esta DATABASE_URL en .env y luego:
   npx prisma generate
   npx prisma db push
   # o con migraciones:
   npx prisma migrate dev --name init
   ```

---

## 2. Storage S3/R2 para media + capturas CUP

Elige **una** opción (recomendado: **Cloudflare R2** gratis + S3 compatible, o **Supabase Storage**):

### Opción A — Cloudflare R2 (recomendado)
1. Cloudflare → R2 → Create bucket `onlycu-media` → Settings → expone endpoint `https://<account>.r2.cloudflarestorage.com`
2. Manage R2 API Tokens → Create Token con permiso Edit.
3. Variables que necesitarás en Render:
   ```
   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=onlycu-media
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PRESIGNED_EXPIRES=60
   ```

### Opción B — Supabase Storage (más simple)
Crea bucket `onlycu-media` en Supabase Storage y usa sus credenciales S3 (también S3-compatible).

### Opción C — AWS S3
Bucket privado `onlycu-media`, bloquea acceso público (solo presigned 60s).

---

## 3. Telegram Bot — BotFather + Mini App

En Telegram habla con **@BotFather**:

```
/newbot → OnlyCuBot → onlycu_bot
/myBots → OnlyCuBot → Bot Settings → Menu Button
  → Configure menu button → URL: https://onlycu.onrender.com
                                 Text: Abrir OnlyCu

/setdescription → Plataforma de creadores +18 — QvaPay/Cripto/CUP
/setabouttext → Solo mayores de 18. Contenido exclusivo.
```

Copia el **token** que te da (`123456:AAH...`).

> "Unerubot" — si te refieres a un host de bot, no lo necesitas: tu bot vive en Render junto a la Mini App. El token es lo único que importa.

Para dev local, puedes usar el mismo bot apuntando a tu túnel `ngrok`.

---

## 4. Render — Web Service

1. **Render → New → Web Service → Connect GitHub repo `adel02d/OnlyCu` → Branch `arena/019ff12a-onlycu`**
2. **Configuración:**
   - **Runtime:** Node 20
   - **Build Command:**
     ```bash
     npm install && npx prisma generate && npx prisma migrate deploy && npm run build
     ```
   - **Start Command:**
     ```bash
     npm start
     ```
   - **Plan:** Free (luego Starter para no dormir)

3. **Environment Variables** (pega todas — Render → Environment):

   ```ini
   # App
   NODE_ENV=production
   NEXT_PUBLIC_APP_URL=https://onlycu.onrender.com

   # Database — la del pooler de Supabase
   DATABASE_URL=postgresql://postgres.PROJECTREF:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

   # Telegram
   TELEGRAM_BOT_TOKEN=123456:AAH...
   TELEGRAM_BOT_USERNAME=onlycu_bot

   # Auth
   JWT_SECRET=genera-uno-largo-con-openssl-rand-hex-32

   # S3/R2
   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=onlycu-media
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_PRESIGNED_EXPIRES=60

   # QvaPay (producción)
   QVAPAY_APP_ID=...
   QVAPAY_APP_SECRET=...
   QVAPAY_BASE_URL=https://qvapay.com/api/v1
   CUP_CARD_NUMBER=9225 9598 XXXX XXXX
   CUP_CARD_HOLDER=TU NOMBRE
   CUP_RATE=320

   # Cripto
   CRYPTO_WEBHOOK_SECRET=otro-secreto-largo
   USDT_TRC20_ADDRESS=TX...
   TON_ADDRESS=EQ...

   # Admin
   ADMIN_TELEGRAM_IDS=tu_telegram_id,otro_id
   ```

   Genera secretos con:
   ```bash
   openssl rand -hex 32
   # o id de Telegram con @userinfobot
   ```

4. **Deploy** → Render compilará y desplegará. Revisa **Logs** hasta ver:
   ```
   ✓ Ready on http://0.0.0.0:3000
   ```

5. **Health check:** `https://onlycu.onrender.com/` debe cargar el AgeGate +18.

---

## 5. Prueba end-to-end

1. En Telegram abre tu bot → **Abrir OnlyCu** → confirma **+18**.
2. `POST /api/auth/telegram` debe devolver `token` (ver Network).
3. Crea perfil creador en `/creator` → publica un post con foto (presigned S3).
4. **Pagos:**
   - **QvaPay:** `/api/payments/qvapay/create` → te abre `pay_url` → paga → webhook `POST /api/payments/qvapay/webhook` activa suscripción.
   - **Cripto:** `POST /api/payments/crypto` → QR USDT/TON → paga → webhook confirma.
   - **CUP:** `/pagar/cup` sube captura → `/admin` → Aprobar → suscripción activa.
5. Visor: `GET /api/media/:id` devuelve presigned 60s + watermark móvil (ver `docs/DRM.md`).

---

## 6. Dominio propio (opcional)

Render → Settings → Custom Domain → añade `onlycu.com` → CNAME en Cloudflare → espera TLS.

Actualiza:
- `NEXT_PUBLIC_APP_URL`
- BotFather → Menu Button URL

---

## 7. Checklist de producción

- [ ] `DATABASE_URL` usa pooler `6543` + `pgbouncer=true`
- [ ] `npx prisma migrate deploy` corre en Build (no `db push`)
- [ ] `TELEGRAM_BOT_TOKEN` y `JWT_SECRET` rotados y sin espacios
- [ ] S3 bucket privado, CORS permite `https://onlycu.onrender.com`
- [ ] `ADMIN_TELEGRAM_IDS` con tu ID real (prueba `/admin` → debe listar capturas)
- [ ] QvaPay webhook configurado en qvapay.com apuntando a `https://onlycu.onrender.com/api/payments/qvapay/webhook`
- [ ] Supabase → Auth deshabilitado (usamos Telegram `initData` HMAC)

---

## 8. Comandos útiles

```bash
# Ver logs en Render
render logs --service onlycu

# Migración nueva
npx prisma migrate dev --name add_reports
npx prisma generate

# Reset DB (cuidado)
npx prisma migrate reset
```

---

## 9. Errores comunes

| Error | Solución |
|---|---|
| `Can't reach database` | Revisa que uses **pooler 6543** y password con `%40` si tiene `@` |
| `Invalid initData` | `TELEGRAM_BOT_TOKEN` mal copiado o `auth_date` expirado (>24h) |
| `S3 403` | `S3_ENDPOINT` sin `https://` o keys de R2 mal |
| Render duerme | Free tier duerme a los 15m — pasa a Starter o usa cron ping |
| Capturas no se ven | Verifica CORS del bucket y que `GET /api/media/proof/:id` devuelve 60s URL |

---

¿Quieres que te genere el `render.yaml` para deploy con un clic? Ya está listo abajo.

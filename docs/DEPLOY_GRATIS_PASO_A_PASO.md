# Deploy 100% GRATIS — Paso a paso detallado (Render + Supabase + R2 + Telegram)

> **Costo: $0** — Todo en tiers gratuitos. Sin tarjeta en Supabase/R2/Render (Render pide tarjeta solo para verificar, pero no cobra en free).

---

## Resumen de lo que vas a usar (todo gratis)

| Servicio | Para qué | Límite gratis |
|---|---|---|
| **Supabase Free** | Base de datos Postgres | 500MB, 2 proyectos, pooler incluido |
| **Cloudflare R2 Free** | Almacen de fotos/videos y capturas CUP | 10GB, 10M lecturas/mes |
| **Render Free** | Servidor web Next.js | 750h/mes, se duerme a los 15min sin uso |
| **Telegram BotFather** | Bot + Mini App | Ilimitado gratis |
| **QvaPay / Cripto** | Pagos | Solo comisiones por transacción |

Si prefieres no usar R2, puedes usar **Supabase Storage** (1GB gratis) — te doy ambas opciones abajo.

---

## PASO 1 — Preparar tu cuenta de GitHub (2 min)

1. Ve a `https://github.com/adel02d/OnlyCu`
2. Verifica que arriba diga `Branch: arena/019ff12a-onlycu` (si no, cámbiala)
3. Este es el código que Render va a desplegar. No toques nada más por ahora.

---

## PASO 2 — Crear base de datos GRATIS en Supabase (5 min)

### 2.1 Crear proyecto
1. Entra a `https://supabase.com` → **Start your project** → Logeate con GitHub
2. **New Project** →
   - Name: `onlycu`
   - Database Password: inventa una larga (ej: `OnlyCu2024!Segura`) → **¡CÓPIALA Y GUÁRDALA!**
   - Region: `East US (North Virginia)` — la más cercana a Cuba y a Render
   - Plan: **Free** (no pongas tarjeta)
3. Click **Create new project** → espera 2 min hasta que diga `Project is ready`

### 2.2 Copiar la DATABASE_URL (MUY IMPORTANTE)
1. En Supabase, a la izquierda → **Connect** (arriba, icono de enchufe) → **Connection string** → pestaña **Session pooler**
2. Verás algo así:
   ```
   postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```
3. Click **Copy** y reemplaza `[YOUR-PASSWORD]` por la contraseña que guardaste.
   - Si tu contraseña tiene `@` cámbialo por `%40`, si tiene `#` por `%23`.
   - Ejemplo final:
     ```
     postgresql://postgres.abcd1234:OnlyCu2024%21Segura@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
     ```
4. **GUÁRDALA en un bloc de notas** — la necesitarás en Render como `DATABASE_URL`.

> **Por qué pooler 6543 y no 5432:** Render + Supabase free se saturan si usas conexión directa. El pooler es obligatorio en free.

### 2.3 Probar que funciona (opcional, desde tu PC)
Si tienes `git` y `node` instalados:
```bash
git clone https://github.com/adel02d/OnlyCu.git
cd OnlyCu
git checkout arena/019ff12a-onlycu
npm install
# Crea un archivo .env en la carpeta OnlyCu y pega:
# DATABASE_URL=la_que_copiaste
npx prisma generate
npx prisma db push
```
Si dice `✔ Generated Prisma Client` y `✔ Database synchronized` → está bien. Si no, no pasa nada — Render lo hará por ti.

---

## PASO 3 — Crear almacenamiento GRATIS para fotos y capturas (5 min)

Elige **UNA** opción. Recomiendo **R2** (10GB gratis).

### Opción A — Cloudflare R2 (10GB gratis, recomendado)
1. Ve a `https://dash.cloudflare.com` → **Sign up** (gratis, sin tarjeta)
2. Izquierda → **R2 Object Storage** → **Create bucket**
   - Name: `onlycu-media`
   - Location: `Automatic`
   - Click **Create bucket**
3. Dentro del bucket → **Settings** → copia el **S3 API Endpoint**:
   ```
   https://<tu-id>.r2.cloudflarestorage.com
   ```
4. R2 → **Manage R2 API Tokens** → **Create API Token**
   - Token name: `onlycu`
   - Permissions: **Object Read & Write**
   - TTL: no (permanente)
   - Click **Create API Token**
   - Copia **Access Key ID** y **Secret Access Key** → guárdalos.

Tendrás:
```
S3_ENDPOINT=https://<id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=onlycu-media
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

### Opción B — Supabase Storage (1GB gratis, más simple)
1. Supabase → **Storage** → **New bucket** → Name: `onlycu-media` → **Public: OFF** (privado, solo presigned 60s)
2. **Storage → Configuration → S3 Access** (abajo) → copia endpoint y keys.
   - Si no ves, usa los mismos datos de Supabase, pero endpoint es `https://<project>.supabase.co/storage/v1/s3`

---

## PASO 4 — Crear Bot de Telegram 100% gratis (3 min)

1. Abre Telegram → busca **@BotFather** → **Start**
2. Envía:
   ```
   /newbot
   ```
   - Nombre: `OnlyCu`
   - Username: `onlycu_bot` (o `onlycu123_bot` si está tomado, debe terminar en `bot`)
3. BotFather te responde con el **TOKEN** (ej: `812345:AAHxxxxx`) → **CÓPIALO**.
4. Aún con BotFather:
   ```
   /mybots → @onlycu_bot → Bot Settings → Menu Button → Configure menu button
   ```
   - URL: `https://onlycu.onrender.com` (por ahora pon eso, luego la corriges si tu URL cambia)
   - Text: `Abrir OnlyCu`
5. Opcional:
   ```
   /setdescription → Plataforma de creadores +18 — QvaPay, Cripto y CUP
   /setabouttext → Solo para mayores de 18 años
   ```

Para saber tu **Telegram ID** (para ser admin):
- Busca **@userinfobot** → Start → te dice `Id: 12345678` → guárdalo.

---

## PASO 5 — Desplegar GRATIS en Render (7 min)

### 5.1 Conectar GitHub
1. Ve a `https://dashboard.render.com` → **Sign up** con GitHub (gratis)
2. **New + → Web Service** → **Connect GitHub** → autoriza → elige `adel02d/OnlyCu`
3. Configura:
   - **Name:** `onlycu`
   - **Branch:** `arena/019ff12a-onlycu`
   - **Region:** `Virginia (US East)` — misma que Supabase
   - **Runtime:** `Node`
   - **Build Command:** copia EXACTO:
     ```
     npm install && npx prisma generate && npx prisma migrate deploy && npm run build
     ```
   - **Start Command:**
     ```
     npm start
     ```
   - **Plan:** `Free` (0$/mes)
   - Click **Advanced** → **Add Environment Variable** → añade UNA POR UNA (ver 5.2)

### 5.2 Variables de entorno (pega estas 16, una por una)

> En Render → Environment → Add → Key / Value

```
NODE_ENV = production
NEXT_PUBLIC_APP_URL = https://onlycu.onrender.com
DATABASE_URL = postgresql://postgres.xxxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
TELEGRAM_BOT_TOKEN = 812345:AAHxxxx (el de BotFather)
TELEGRAM_BOT_USERNAME = onlycu_bot
JWT_SECRET = pega-aqui-un-generado (ejecuta en tu PC: openssl rand -hex 32)
S3_ENDPOINT = https://<id>.r2.cloudflarestorage.com
S3_REGION = auto
S3_BUCKET = onlycu-media
S3_ACCESS_KEY_ID = (de R2)
S3_SECRET_ACCESS_KEY = (de R2)
S3_PRESIGNED_EXPIRES = 60
QVAPAY_APP_ID = (si no tienes aún, pon test123)
QVAPAY_APP_SECRET = (test123)
QVAPAY_BASE_URL = https://qvapay.com/api/v1
CUP_CARD_NUMBER = 9225 9598 7XXX XXXX
CUP_CARD_HOLDER = Tu Nombre
CUP_RATE = 320
CRYPTO_WEBHOOK_SECRET = otro-openssl-rand-hex-32
USDT_TRC20_ADDRESS = TX... (o deja el de ejemplo)
TON_ADDRESS = EQ... (o deja el de ejemplo)
ADMIN_TELEGRAM_IDS = 12345678 (tu ID de @userinfobot)
```

> **Truco para generar secretos sin instalar nada:** ve a `https://generate-secret.vercel.app/32` y copia.

### 5.3 Deploy
1. Click **Create Web Service** → Render empieza a compilar (ver **Logs** en tiempo real)
2. Espera 4-6 min hasta que veas:
   ```
   ✓ Compiled successfully
   ✓ Ready on http://0.0.0.0:10000
   ```
3. Arriba verás tu URL: `https://onlycu.onrender.com` → ábrela.
   - Debe salir el **AgeGate +18** (botón "Sí, tengo 18+")
   - Si dice `Internal Server Error`, revisa Logs → 99% es `DATABASE_URL` mal copiada.

### 5.4 Corregir URL del bot (si Render te dio otra URL)
Si tu URL no es `onlycu.onrender.com` sino `onlycu-xxxx.onrender.com`:
1. Render → tu servicio → copia la URL real
2. Ve a BotFather → `/mybots → Menu Button → Configure` → pega la URL real
3. En Render → Environment → cambia `NEXT_PUBLIC_APP_URL` a la URL real → **Save** → redeploy automático.

### 5.5 Evitar que Render se duerma (gratis)
El plan free se duerme a los 15 min sin visitas. Para despertarlo gratis:
1. Ve a `https://uptimerobot.com` (gratis) → Add New Monitor
   - Type: HTTP(s)
   - URL: `https://onlycu.onrender.com/`
   - Interval: 5 min
   - Create → hará ping y lo mantendrá despierto.

---

## PASO 6 — Verificar que todo funciona (3 min)

1. En Telegram → abre **@onlycu_bot** → botón **Abrir OnlyCu**
2. Confirma **+18** (doble check) → entras al feed.
3. Ve a **Panel creador** (`/creator`) → **Activar perfil** → pon nombre y precio → **Crear**.
4. En **Nuevo post** → elige una foto → **Publicar** → debe subir a R2 y verse con watermark móvil.
5. **Probar pagos:**
   - **CUP (gratis para probar):** Ve a `/pagar/cup` → sube cualquier captura (puede ser de prueba) → ve a `/admin` (con tu cuenta admin) → **Aprobar** → la suscripción se activa.
   - **QvaPay/Cripto:** si no tienes credenciales reales, deja `test123` — el botón dará error pero el flujo está listo; cuando tengas QvaPay real, solo cambia variables en Render y redeploy.

---

## PASO 7 — Qué hacer si algo falla

| Problema | Solución |
|---|---|
| `Can't reach database` | Revisaste pooler 6543? Contraseña con `@` debe ser `%40`. Prueba reconectar en Supabase → Connect → Session pooler → Copy |
| `Invalid initData hash` | `TELEGRAM_BOT_TOKEN` mal copiado (tiene `:`). Cópialo de nuevo de BotFather |
| `S3 403 / NoSuchBucket` | Bucket no existe o `S3_ENDPOINT` sin `https://`. Crea bucket `onlycu-media` exacto |
| Página en blanco | Revisa Render → Logs → último error. 99% es variable mal escrita |
| Render dice "Deploy failed" | Revisa Build Command completo, con `&&` entre comandos |

---

## PASO 8 — Siguiente nivel (cuando crezcas, sigue gratis)

- **Dominio propio gratis:** Cloudflare → compra `onlycu.tk` gratis o usa `onlycu.pages.dev`, luego Render → Custom Domain.
- **Notificaciones:** en `ADMIN_TELEGRAM_IDS` pon varios IDs para que varios admins verifiquen CUP.
- **Backups:** Supabase → Backups diarios automáticos en free.

---

## Checklist final (marca con ✓)

- [ ] Supabase proyecto creado + DATABASE_URL pooler guardada
- [ ] R2 bucket `onlycu-media` + keys guardadas
- [ ] BotFather token + Menu Button con URL de Render
- [ ] Render Web Service en Free con 16 env vars + Build/Start correctos
- [ ] URL abre AgeGate +18
- [ ] `/creator` funciona y puedes publicar
- [ ] `/pagar/cup` + `/admin` aprueba capturas

Si completas esto, tienes **OnlyCu en producción 100% gratis** tal como pediste.

¿Quieres que te haga un video de 1 min por cada paso o que te genere el JWT_SECRET y CUP_RATE actualizados ahora?

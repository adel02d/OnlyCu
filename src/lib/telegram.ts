import crypto from "crypto";

/**
 * Valida initData de Telegram Mini App según docs:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * 
 * initData es query string como: "user=%7B...%7D&auth_date=...&hash=..."
 * hash = hex(HMAC-SHA256(data_check_string, secret_key))
 * secret_key = HMAC-SHA256(bot_token, "WebAppData")
 */
export function validateTelegramInitData(initData: string, botToken: string): { ok: boolean; data?: any; reason?: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, reason: "Falta hash" };

    params.delete("hash");
    // Ordenar alfabéticamente por key
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calculatedHash !== hash) {
      return { ok: false, reason: "Hash inválido" };
    }

    // Validar auth_date (no más de 24h)
    const authDate = parseInt(params.get("auth_date") || "0", 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { ok: false, reason: "initData expirado" };
    }

    const userRaw = params.get("user");
    const user = userRaw ? JSON.parse(userRaw) : null;

    return { ok: true, data: { user, authDate, queryId: params.get("query_id") } };
  } catch (e: any) {
    return { ok: false, reason: e.message };
  }
}

export function getTelegramUserFromInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

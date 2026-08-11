import jwt from "jsonwebtoken";
import { validateTelegramInitData } from "./telegram";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-cambiar-en-produccion";

export type SessionPayload = {
  userId: string;
  telegramId: string;
  isCreator: boolean;
  isAdultVerified: boolean;
};

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionFromHeader(req: Request): SessionPayload | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifySession(auth.slice(7));
}

// Helper para endpoint /api/auth/telegram
export function authenticateInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  const result = validateTelegramInitData(initData, botToken);
  if (!result.ok) throw new Error(result.reason);
  return result.data;
}

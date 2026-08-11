/**
 * QvaPay - Pasarela cubana para cobrar desde el exterior
 * Docs: https://qvapay.com/docs
 * Flujo: crear factura -> usuario paga -> webhook confirma
 */

const BASE = process.env.QVAPAY_BASE_URL || "https://qvapay.com/api/v1";

function authHeaders() {
  const id = process.env.QVAPAY_APP_ID!;
  const secret = process.env.QVAPAY_APP_SECRET!;
  // QvaPay usa Basic o Bearer según versión; aquí genérico
  const token = Buffer.from(`${id}:${secret}`).toString("base64");
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${token}`,
  };
}

export async function createQvaPayInvoice(params: {
  amount: number;
  description: string;
  remoteId: string; // nuestro paymentId
  transUser?: string;
}) {
  const res = await fetch(`${BASE}/create_invoice`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      app_id: process.env.QVAPAY_APP_ID,
      amount: params.amount.toFixed(2),
      description: params.description,
      remote_id: params.remoteId,
      signed: 0, // deja que QvaPay firme
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QvaPay create_invoice failed: ${res.status} ${txt}`);
  }
  return res.json(); // { trans_id, pay_url, ... }
}

export async function getQvaPayTransaction(transId: string) {
  const res = await fetch(`${BASE}/get_transaction/${transId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`QvaPay get_transaction failed`);
  return res.json();
}

// Verifica firma del webhook si QvaPay la envía (HMAC con APP_SECRET)
export function verifyQvaPayWebhook(payload: string, signature: string | null): boolean {
  if (!signature) return false;
  const crypto = require("crypto");
  const expected = crypto.createHmac("sha256", process.env.QVAPAY_APP_SECRET!).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

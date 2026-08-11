import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";
import { getCryptoPaymentInfo } from "@/lib/crypto";

const prisma = new PrismaClient();

/**
 * POST /api/payments/crypto - Inicia pago en USDT o TON
 * Body: { currency: "USDT"|"TON", amount, subscriptionId?, postId? }
 * Retorna dirección + QR
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isAdultVerified) return NextResponse.json({ error: "Verificación +18 requerida" }, { status: 403 });

  const { currency, amount, subscriptionId, postId } = await req.json();
  if (!currency || !amount) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  if (!["USDT", "TON"].includes(currency)) return NextResponse.json({ error: "Moneda no soportada" }, { status: 400 });

  const info = getCryptoPaymentInfo(currency, parseFloat(amount));

  const payment = await prisma.payment.create({
    data: {
      userId: session.userId,
      subscriptionId: subscriptionId || null,
      amount: parseFloat(amount),
      currency,
      method: currency === "USDT" ? "CRYPTO_USDT" : "CRYPTO_TON",
      provider: currency === "USDT" ? "usdt-trc20" : "ton",
      status: "PENDING",
      metadata: { postId: postId || null, address: info.address, network: info.network },
    },
  });

  return NextResponse.json({ ok: true, paymentId: payment.id, ...info });
}

// Webhook genérico para NOWPayments / TON (verificar firma con CRYPTO_WEBHOOK_SECRET)
export async function PUT(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.CRYPTO_WEBHOOK_SECRET) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

  const body = await req.json();
  // body: { paymentId, txId, status }
  const { paymentId, txId, status } = body;
  if (!paymentId) return NextResponse.json({ error: "paymentId requerido" }, { status: 400 });

  if (status === "confirmed" || status === "finished") {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "COMPLETED", providerTxId: txId, metadata: body } });
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (payment?.subscriptionId) {
      await prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
    }
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Webhook QvaPay -> confirma pago y activa suscripción/compra
 * Debe verificar firma si QvaPay la envía (ver src/lib/qvapay.ts)
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { body = {}; }

  // QvaPay envía típicamente: { app_id, trans_id, remote_id, amount, status, signature }
  const remoteId = body.remote_id || body.remoteId;
  const transId = body.trans_id || body.transId;
  const status = body.status; // "completed" | "paid" etc.

  if (!remoteId) return NextResponse.json({ error: "remote_id faltante" }, { status: 400 });

  // Buscar Payment por id (remoteId = payment.id)
  const payment = await prisma.payment.findUnique({ where: { id: remoteId } });
  if (!payment) return NextResponse.json({ error: "Payment no encontrado" }, { status: 404 });

  if (status === "completed" || status === "paid" || status === "success") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "COMPLETED", providerTxId: transId, metadata: body },
    });

    // Activar suscripción si aplica
    if (payment.subscriptionId) {
      await prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
    }
    // Si es PPV, Purchase ya se crea al iniciar, aquí se confirma
  } else if (status === "cancelled" || status === "failed") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", metadata: body } });
  }

  return NextResponse.json({ ok: true });
}

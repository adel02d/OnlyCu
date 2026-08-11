import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";
import { createQvaPayInvoice } from "@/lib/qvapay";

const prisma = new PrismaClient();

/**
 * POST /api/payments/qvapay/create - Crea factura QvaPay
 * Body: { amount, description, subscriptionId?, postId? }
 * Retorna pay_url para redirigir al usuario
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isAdultVerified) return NextResponse.json({ error: "Verificación +18 requerida" }, { status: 403 });

  const { amount, description, subscriptionId, postId } = await req.json();
  if (!amount) return NextResponse.json({ error: "Monto requerido" }, { status: 400 });

  const payment = await prisma.payment.create({
    data: {
      userId: session.userId,
      subscriptionId: subscriptionId || null,
      amount: parseFloat(amount),
      currency: "USD",
      method: "QVAPAY",
      provider: "qvapay",
      status: "PENDING",
      metadata: { postId: postId || null, description },
    },
  });

  try {
    const invoice = await createQvaPayInvoice({
      amount: parseFloat(amount),
      description: description || `OnlyCu - ${payment.id}`,
      remoteId: payment.id,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { providerTxId: invoice.trans_id, metadata: invoice } });
    return NextResponse.json({ ok: true, paymentId: payment.id, payUrl: invoice.pay_url, transId: invoice.trans_id });
  } catch (e: any) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", metadata: { error: e.message } } });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

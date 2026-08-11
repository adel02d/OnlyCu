import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";

const prisma = new PrismaClient();

/**
 * POST /api/payments/manual - Subir comprobante CUP manual
 * Body: { amount, transferRef, screenshotS3Key, subscriptionId?, postId? }
 * Requiere JWT + isAdultVerified
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isAdultVerified) return NextResponse.json({ error: "Debes verificar +18" }, { status: 403 });

  const { amount, transferRef, screenshotS3Key, subscriptionId, postId } = await req.json();
  if (!amount || !screenshotS3Key) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

  const proof = await prisma.manualProof.create({
    data: {
      userId: session.userId,
      amount: parseFloat(amount),
      currency: "CUP",
      transferRef,
      screenshotUrl: screenshotS3Key,
      status: "PENDING",
    },
  });

  const payment = await prisma.payment.create({
    data: {
      userId: session.userId,
      subscriptionId: subscriptionId || null,
      amount: parseFloat(amount),
      currency: "CUP",
      method: "MANUAL_CUP",
      provider: "manual_cup",
      status: "VERIFYING",
      manualProofId: proof.id,
      metadata: { postId: postId || null },
    },
  });

  // El admin aprueba en /admin -> POST /api/admin/manual-review
  return NextResponse.json({ ok: true, paymentId: payment.id, proofId: proof.id, message: "Comprobante recibido. Revisión en <24h. No borres la transferencia." });
}

// GET lista del usuario
export async function GET(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const payments = await prisma.payment.findMany({ where: { userId: session.userId, method: "MANUAL_CUP" }, orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json({ payments });
}

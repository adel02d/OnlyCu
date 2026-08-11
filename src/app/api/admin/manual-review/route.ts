import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";

const prisma = new PrismaClient();

function isAdmin(telegramId: string): boolean {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map(s => s.trim());
  return ids.includes(telegramId);
}

/**
 * POST /api/admin/manual-review - Aprueba/rechaza comprobante CUP
 * Body: { proofId, action: "approve"|"reject", notes? }
 * Solo ADMIN_TELEGRAM_IDS
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.telegramId)) return NextResponse.json({ error: "No autorizado (solo admin)" }, { status: 403 });

  const { proofId, action, notes } = await req.json();
  if (!proofId || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const proof = await prisma.manualProof.findUnique({ where: { id: proofId }, include: { payment: true } });
  if (!proof) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });

  const newStatus = action === "approve" ? "APPROVED" : "REJECTED";
  await prisma.manualProof.update({
    where: { id: proofId },
    data: { status: newStatus, reviewedBy: session.userId, reviewedAt: new Date(), notes },
  });

  if (proof.payment) {
    await prisma.payment.update({
      where: { id: proof.payment.id },
      data: { status: action === "approve" ? "COMPLETED" : "REJECTED", metadata: { ...(proof.payment.metadata as object || {}), adminNotes: notes } },
    });
    if (action === "approve" && proof.payment.subscriptionId) {
      await prisma.subscription.update({
        where: { id: proof.payment.subscriptionId },
        data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
    }
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

export async function GET(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session || !isAdmin(session.telegramId)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const pending = await prisma.manualProof.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50, include: { user: { select: { username: true, telegramId: true } } } });
  return NextResponse.json({ pending });
}

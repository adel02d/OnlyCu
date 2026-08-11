import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";
import { getPresignedUrl } from "@/lib/s3";

const prisma = new PrismaClient();

function isAdmin(telegramId: string): boolean {
  return (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map(s => s.trim()).includes(telegramId);
}

/**
 * GET /api/media/proof/:proofId - Devuelve presigned URL 60s de la captura
 * Solo admin o dueño del comprobante
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const proof = await prisma.manualProof.findUnique({ where: { id: params.id } });
  if (!proof) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const isOwner = proof.userId === session.userId;
  const admin = isAdmin(session.telegramId);
  if (!isOwner && !admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  if (!proof.screenshotUrl) return NextResponse.json({ error: "Sin captura" }, { status: 404 });
  const url = await getPresignedUrl(proof.screenshotUrl, 60);
  return NextResponse.json({ url, expiresIn: 60 });
}

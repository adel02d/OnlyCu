import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isAdultVerified) return NextResponse.json({ error: "Debes verificar +18 primero" }, { status: 403 });

  const { displayName, bio, subscriptionPrice } = await req.json();
  if (!displayName || !subscriptionPrice) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

  const profile = await prisma.creatorProfile.upsert({
    where: { userId: session.userId },
    update: { displayName, bio, subscriptionPrice: parseFloat(subscriptionPrice) },
    create: { userId: session.userId, displayName, bio, subscriptionPrice: parseFloat(subscriptionPrice) },
  });
  await prisma.user.update({ where: { id: session.userId }, data: { isCreator: true } });

  // Crea tier por defecto si no existe
  const existing = await prisma.subscriptionTier.findFirst({ where: { creatorId: profile.id } });
  if (!existing) {
    await prisma.subscriptionTier.create({ data: { creatorId: profile.id, name: "Suscripción mensual", price: parseFloat(subscriptionPrice), interval: "month", benefits: "Acceso a posts de suscripción" } });
  }

  return NextResponse.json({ ok: true, profile });
}

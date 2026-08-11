import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await prisma.creatorProfile.findUnique({ where: { userId: session.userId } });
  if (!profile) return NextResponse.json({ error: "No eres creador. Activa modo creador primero." }, { status: 404 });

  const [subs, posts, payments, pendingProofs] = await Promise.all([
    prisma.subscription.count({ where: { creatorId: profile.id, status: "ACTIVE" } }),
    prisma.post.count({ where: { creatorId: profile.id } }),
    prisma.payment.findMany({ where: { subscription: { creatorId: profile.id }, status: "COMPLETED" }, select: { amount: true, currency: true, createdAt: true } }),
    prisma.manualProof.count({ where: { payment: { subscription: { creatorId: profile.id } }, status: "PENDING" } as any),
  ]);

  const totalUSD = payments.filter(p => p.currency === "USD" || p.currency === "USDT" || p.currency === "TON").reduce((a, p) => a + p.amount, 0);
  const totalCUP = payments.filter(p => p.currency === "CUP").reduce((a, p) => a + p.amount, 0);

  return NextResponse.json({
    profile,
    stats: { subs, posts, totalUSD, totalCUP, pendingProofs, paymentsCount: payments.length },
  });
}

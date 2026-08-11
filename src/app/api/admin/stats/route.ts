import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";

const prisma = new PrismaClient();
function isAdmin(tg: string) { return (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map(s => s.trim()).includes(tg); }

export async function GET(req: NextRequest) {
  const s = getSessionFromHeader(req);
  if (!s) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(s.telegramId)) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const [totalUsers, totalCreators, totalPayments, recentPayments, creators, reports] = await Promise.all([
    prisma.user.count(),
    prisma.creatorProfile.count(),
    prisma.payment.count(),
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.creatorProfile.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
    prisma.report.findMany({ take: 10, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({ totalUsers, totalCreators, totalPayments, recentPayments, creators, reports });
}

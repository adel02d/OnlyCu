import { NextRequest, NextResponse } from "next/server";
import { authenticateInitData } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { initData, acceptedTermsVersion } = await req.json();
    if (!initData) return NextResponse.json({ error: "initData requerido" }, { status: 400 });

    const data = authenticateInitData(initData);
    const tgUser = data.user;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "";
    const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;

    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      update: {
        isAdultVerified: true,
        adultVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: acceptedTermsVersion || "1.0",
      },
      create: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.first_name,
        isAdultVerified: true,
        adultVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: acceptedTermsVersion || "1.0",
      },
    });

    await prisma.ageVerification.create({
      data: {
        userId: user.id,
        method: "self_declare_18",
        ipHash,
        userAgent: req.headers.get("user-agent") || undefined,
        accepted: true,
      },
    });

    return NextResponse.json({ ok: true, isAdultVerified: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

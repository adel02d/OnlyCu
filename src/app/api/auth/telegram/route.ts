import { NextRequest, NextResponse } from "next/server";
import { authenticateInitData } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { signSession } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    if (!initData) return NextResponse.json({ error: "initData requerido" }, { status: 400 });

    const data = authenticateInitData(initData);
    const tgUser = data.user;
    if (!tgUser?.id) return NextResponse.json({ error: "Usuario Telegram no válido" }, { status: 401 });

    // Upsert usuario
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      update: { username: tgUser.username, firstName: tgUser.first_name, lastName: tgUser.last_name, photoUrl: tgUser.photo_url },
      create: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
      },
    });

    // Gate +18: si no está verificado, no emitir sesión completa (frontend muestra AgeGate)
    const token = signSession({
      userId: user.id,
      telegramId: String(user.telegramId),
      isCreator: user.isCreator,
      isAdultVerified: user.isAdultVerified,
    });

    return NextResponse.json({
      ok: true,
      token,
      user: { id: user.id, telegramId: String(user.telegramId), isAdultVerified: user.isAdultVerified, isCreator: user.isCreator },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

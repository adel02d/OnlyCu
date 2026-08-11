import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const creatorId = searchParams.get("creatorId");
  const posts = await prisma.post.findMany({
    where: { creatorId: creatorId || undefined, isPublished: true },
    include: { media: { select: { id: true, mimeType: true } }, creator: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isCreator) return NextResponse.json({ error: "Solo creadores" }, { status: 403 });

  const { title, caption, isPPV, ppvPrice, s3Keys } = await req.json();
  const profile = await prisma.creatorProfile.findUnique({ where: { userId: session.userId } });
  if (!profile) return NextResponse.json({ error: "Perfil creador no encontrado" }, { status: 404 });

  const post = await prisma.post.create({
    data: {
      creatorId: profile.id,
      title,
      caption,
      isPPV: !!isPPV,
      ppvPrice: ppvPrice ? parseFloat(ppvPrice) : null,
      media: { create: (s3Keys || []).map((k: string) => ({ s3Key: k, mimeType: k.endsWith(".mp4") ? "video/mp4" : "image/jpeg" })) },
    },
    include: { media: true },
  });
  return NextResponse.json({ post });
}

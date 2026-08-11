import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSessionFromHeader } from "@/lib/auth";
import { getPresignedUrl } from "@/lib/s3";

const prisma = new PrismaClient();

/**
 * GET /api/media/:mediaId -> devuelve presigned URL 60s si el usuario tiene acceso
 * Verifica: JWT válido + isAdultVerified + suscripción activa o compra PPV
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isAdultVerified) return NextResponse.json({ error: "Verificación +18 requerida" }, { status: 403 });

  const media = await prisma.media.findUnique({ where: { id: params.id }, include: { post: true } });
  if (!media) return NextResponse.json({ error: "Media no encontrada" }, { status: 404 });

  // Verificar acceso: es el creador o tiene suscripción activa o compró PPV
  const creator = await prisma.creatorProfile.findUnique({ where: { id: media.post.creatorId } });
  const isOwner = creator?.userId === session.userId;

  let hasAccess = isOwner;
  if (!hasAccess) {
    if (!media.post.isPPV) {
      const sub = await prisma.subscription.findFirst({
        where: { subscriberId: session.userId, creatorId: media.post.creatorId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } },
      });
      hasAccess = !!sub;
    } else {
      const purchase = await prisma.purchase.findUnique({ where: { userId_postId: { userId: session.userId, postId: media.post.id } } });
      // también permitir si tiene suscripción (algunos PPV incluyen descuento, aquí simple)
      hasAccess = !!purchase;
      if (!hasAccess) {
        const sub = await prisma.subscription.findFirst({ where: { subscriberId: session.userId, creatorId: media.post.creatorId, status: "ACTIVE" } });
        hasAccess = !!sub;
      }
    }
  }

  if (!hasAccess) return NextResponse.json({ error: "Suscripción o compra requerida" }, { status: 402 });

  const url = await getPresignedUrl(media.s3Key, 60);
  return NextResponse.json({ url, expiresIn: 60, s3Key: media.s3Key });
}

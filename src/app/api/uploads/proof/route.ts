import { NextRequest, NextResponse } from "next/server";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSessionFromHeader } from "@/lib/auth";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

/**
 * POST /api/uploads/proof - Genera presigned POST para subir captura de Transfermóvil
 * Body: { filename, contentType }
 * Retorna { url, fields, s3Key } para que el frontend haga POST directo a S3/R2
 * Solo usuarios +18
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isAdultVerified) return NextResponse.json({ error: "Verificación +18 requerida" }, { status: 403 });

  const { filename, contentType } = await req.json();
  if (!filename) return NextResponse.json({ error: "filename requerido" }, { status: 400 });

  const ext = filename.split(".").pop() || "jpg";
  const key = `proofs/${session.userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  const post = await createPresignedPost(s3, {
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Conditions: [
      ["content-length-range", 1000, 8 * 1024 * 1024], // 1KB - 8MB
      ["starts-with", "$Content-Type", "image/"],
    ],
    Fields: { "Content-Type": contentType || "image/jpeg" },
    Expires: 300, // 5 min para subir
  });

  return NextResponse.json({ url: post.url, fields: post.fields, s3Key: key, expiresIn: 300 });
}

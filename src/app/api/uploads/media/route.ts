import { NextRequest, NextResponse } from "next/server";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSessionFromHeader } from "@/lib/auth";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "" },
});

// POST /api/uploads/media - presigned POST para fotos/videos del creador
export async function POST(req: NextRequest) {
  const session = getSessionFromHeader(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.isCreator) return NextResponse.json({ error: "Solo creadores" }, { status: 403 });

  const { filename, contentType } = await req.json();
  const ext = filename?.split(".").pop() || "jpg";
  const key = `media/${session.userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  const post = await createPresignedPost(s3, {
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Conditions: [["content-length-range", 1000, 500 * 1024 * 1024], ["starts-with", "$Content-Type", ""]], // hasta 500MB video
    Fields: { "Content-Type": contentType || "image/jpeg" },
    Expires: 600,
  });

  return NextResponse.json({ url: post.url, fields: post.fields, s3Key: key });
}

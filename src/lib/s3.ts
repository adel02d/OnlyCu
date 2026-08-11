import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: process.env.S3_ENDPOINT?.includes("r2.cloudflarestorage.com") ? false : true,
});

const BUCKET = process.env.S3_BUCKET!;
const EXPIRES = parseInt(process.env.S3_PRESIGNED_EXPIRES || "60", 10);

/**
 * Genera URL temporal de 60 segundos - nunca exponer s3Key directo
 * El frontend debe refrescar cada ~50s si el video sigue reproduciéndose
 */
export async function getPresignedUrl(s3Key: string, expiresIn = EXPIRES): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function getPresignedUrls(keys: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    keys.map(async (k) => [k, await getPresignedUrl(k)] as const)
  );
  return Object.fromEntries(entries);
}

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Ext = "png" | "jpg" | "webp";
const CONTENT_TYPE: Record<Ext, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

let s3Client: import("@aws-sdk/client-s3").S3Client | undefined;

/** S3-compatible upload: works with Cloudflare R2, AWS S3 and Supabase Storage (S3 endpoint). */
async function saveToS3(key: string, bytes: Uint8Array, ext: Ext): Promise<string> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  s3Client ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: need("S3_ENDPOINT"),
    forcePathStyle: true,
    credentials: { accessKeyId: need("S3_ACCESS_KEY_ID"), secretAccessKey: need("S3_SECRET_ACCESS_KEY") },
  });
  await s3Client.send(
    new PutObjectCommand({
      Bucket: need("S3_BUCKET"), Key: key, Body: bytes, ContentType: CONTENT_TYPE[ext],
      CacheControl: "public, max-age=31536000, immutable", // filenames are random, so files never change
    }),
  );
  return `${need("STORAGE_PUBLIC_URL").replace(/\/+$/, "")}/${key}`;
}

/** Returns the public URL of the stored cover. Production requires STORAGE_DRIVER=s3. */
export async function saveCover(bytes: Uint8Array, ext: Ext): Promise<string> {
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  if (process.env.STORAGE_DRIVER === "s3") return saveToS3(`covers/${name}`, bytes, ext);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Image storage is not configured: set STORAGE_DRIVER=s3 and the S3_* variables.");
  }
  const dir = path.join(process.cwd(), "public", "uploads", "covers");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/covers/${name}`;
}

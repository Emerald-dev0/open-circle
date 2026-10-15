import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { MAX_IMAGE_BYTES } from "../shared/portfolio.js";
import { safePortfolioUrl } from "../shared/portfolio-validation.js";
import { HttpError } from "./http.js";

function config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim();
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  try {
    const url = new URL(safePortfolioUrl(publicUrl));
    if (url.search || url.hash) return null;
    return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: url.href.replace(/\/$/, "") };
  } catch { return null; }
}

export function portfolioUploadsAvailable(): boolean { return config() !== null; }

export function validatePortfolioImage(bytes: Uint8Array, contentType: string): "png" | "jpg" | "webp" {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "image_size", "Choose an image smaller than 3 MB.");
  const b = Buffer.from(bytes);
  if (contentType === "image/png" && b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (contentType === "image/jpeg" && b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  if (contentType === "image/webp" && b.length >= 20 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  throw new HttpError(415, "image_type", "Choose a PNG, JPEG or WebP image. SVG files aren't supported.");
}

export async function uploadPortfolioImage(req: Request, ownerId: number): Promise<string> {
  const settings = config();
  if (!settings) throw new HttpError(503, "upload_setup", "Image uploads aren't configured yet. You can use an HTTPS image link in the meantime.");
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_IMAGE_BYTES) throw new HttpError(413, "image_size", "Choose an image smaller than 3 MB.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "image_missing", "Choose an image to upload.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new HttpError(413, "image_size", "Choose an image smaller than 3 MB."); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(parts, size);
  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const extension = validatePortfolioImage(body, contentType);
  const key = `portfolios/${ownerId}/${randomUUID()}.${extension}`;
  const client = new S3Client({ region: "auto", endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
  try {
    await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength, CacheControl: "public, max-age=31536000, immutable" }), { abortSignal: AbortSignal.timeout(20_000) });
  } catch { throw new HttpError(502, "upload_failed", "The image couldn't be uploaded. Try again."); }
  finally { client.destroy(); }
  return `${settings.publicUrl}/${key}`;
}

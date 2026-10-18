import { randomUUID } from "node:crypto";
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand, GetObjectCommand, type CompletedPart } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { EVENT_PART_BYTES, type EventUpload } from "../shared/events.js";
import { HttpError } from "./http.js";
import { validatePortfolioImage } from "./portfolio-upload.js";
import { validateUpload } from "./event-validation.js";
import { getEventStore } from "./event-store.js";
function settings() {
  const account = process.env.EVENT_R2_ACCOUNT_ID?.trim(); const bucket = process.env.EVENT_R2_BUCKET_NAME?.trim(); const accessKeyId = process.env.EVENT_R2_ACCESS_KEY_ID?.trim(); const secretAccessKey = process.env.EVENT_R2_SECRET_ACCESS_KEY?.trim(); const token = process.env.EVENT_R2_API_TOKEN?.trim();
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || bucket === process.env.R2_BUCKET_NAME?.trim() || !accessKeyId || !secretAccessKey || !token) throw new HttpError(503, "event_storage_setup", "Event uploads need a separate private R2 bucket and its server credentials. Saved events are unaffected.");
  return { account, bucket, accessKeyId, secretAccessKey, token };
}
export function eventStorageConfigured() { try { settings(); return true; } catch { return false; } }
let privacy: { key: string; until: number } | undefined;
export async function assertEventBucketPrivate() {
  const s = settings(); const key = `${s.account}:${s.bucket}:${s.token}`;
  if (privacy?.key === key && privacy.until > Date.now()) return;
  const base = `https://api.cloudflare.com/client/v4/accounts/${s.account}/r2/buckets/${s.bucket}/domains`;
  try {
    const results = await Promise.all(["managed", "custom"].map(async suffix => {
      const r = await fetch(`${base}/${suffix}`, { headers: { authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(8000), redirect: "error" });
      const body = await r.json() as { success?: boolean; result?: { enabled?: boolean; domains?: { enabled?: boolean }[] } };
      if (!r.ok || body.success !== true || !body.result) throw Error(); return body.result;
    }));
    if (results[0].enabled !== false || !Array.isArray(results[1].domains) || results[1].domains.some(d => d.enabled !== false)) throw Error();
  } catch { throw new HttpError(503, "event_bucket_private", "Private event storage could not be verified. Disable the bucket's r2.dev URL and custom domains, and check its read-only Cloudflare API token."); }
  privacy = { key, until: Date.now() + 60000 };
}
function connection() { const s = settings(); return { bucket: s.bucket, client: new S3Client({ region: "auto", endpoint: `https://${s.account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey }, maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 }, requestChecksumCalculation: "WHEN_REQUIRED" }) }; }
export async function beginEventUpload(eventId: string, adminId: number, input: Record<string, unknown>): Promise<EventUpload> {
  await assertEventBucketPrivate(); const parsed = validateUpload(input); const id = String(input.uploadId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, "upload_id", "Choose a valid upload ID.");
  const store = getEventStore(); const existing = await store.upload(id);
  if (existing) { if (existing.adminId !== adminId || existing.eventId !== eventId || existing.size !== parsed.size || existing.contentType !== parsed.contentType || existing.filename !== parsed.filename || existing.kind !== parsed.kind) throw new HttpError(409, "upload_conflict", "This upload belongs to another file or event."); return existing; }
  const { client, bucket } = connection(); const key = `events/${eventId}/${adminId}/${id}/${randomUUID()}`;
  try {
    const response = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: parsed.contentType, CacheControl: "private, no-store", Metadata: { event: eventId, admin: String(adminId), upload: id }, ContentDisposition: parsed.kind === "resource" ? "attachment" : "inline" }), { abortSignal: AbortSignal.timeout(20000) });
    if (!response.UploadId) throw Error("Storage did not create the upload.");
    const upload: EventUpload = { ...parsed, id, eventId, adminId, key, multipartId: response.UploadId, createdAt: Date.now(), state: "uploading" };
    const saved = await store.addUpload(upload);
    if (saved.multipartId !== upload.multipartId) await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: upload.multipartId }));
    return saved;
  } finally { client.destroy(); }
}
export async function eventUploadPart(upload: EventUpload, part: number) {
  await assertEventBucketPrivate();
  if (upload.state !== "uploading" || Date.now() - upload.createdAt > 86400000 || !Number.isInteger(part) || part < 1 || part > Math.ceil(upload.size / EVENT_PART_BYTES)) throw new HttpError(400, "upload_part", "This upload has expired or its part number is invalid. Cancel and choose the file again.");
  const { client, bucket } = connection();
  try { return await getSignedUrl(client, new UploadPartCommand({ Bucket: bucket, Key: upload.key, UploadId: upload.multipartId, PartNumber: part }), { expiresIn: 900 }); } finally { client.destroy(); }
}
export function validateEventSignature(bytes: Uint8Array, upload: Pick<EventUpload, "kind" | "contentType" | "size">) {
  const b = Buffer.from(bytes); let valid = false;
  if (upload.kind === "cover") { validatePortfolioImage(bytes, upload.contentType); return; }
  if (upload.contentType === "video/mp4") valid = b.length >= 12 && b.toString("ascii",4,8) === "ftyp";
  else if (upload.contentType === "video/webm") valid = b.length >= 4 && b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  else if (upload.contentType === "application/pdf") valid = b.toString("ascii",0,5) === "%PDF-";
  else if (upload.contentType.includes("zip") || upload.contentType.includes("presentationml")) valid = b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  else { try { const text = new TextDecoder("utf-8", { fatal: true }).decode(b, { stream: b.length < upload.size }); valid = !text.includes("\0"); } catch { valid = false; } }
  if (!valid) throw new HttpError(415, "event_file_type", "The uploaded file does not match its declared format. Export a supported file and try again.");
}
export async function finishEventUpload(upload: EventUpload) {
  if (upload.state === "complete") return getEventStore().finish(upload.id);
  if (upload.state !== "uploading") throw new HttpError(409, "upload_aborted", "This upload was cancelled.");
  await assertEventBucketPrivate(); const { client, bucket } = connection();
  try {
    let head;
    try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: upload.key })); } catch (e) { if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw e; }
    if (!head) {
      const parts: CompletedPart[] = []; let marker: string | undefined;
      do {
        const listed = await client.send(new ListPartsCommand({ Bucket: bucket, Key: upload.key, UploadId: upload.multipartId, PartNumberMarker: marker }));
        for (const part of listed.Parts ?? []) {
          const expected = Math.min(EVENT_PART_BYTES, upload.size - parts.length * EVENT_PART_BYTES);
          if (part.PartNumber !== parts.length + 1 || part.Size !== expected || !part.ETag) throw new HttpError(409, "upload_incomplete", "The upload is incomplete. Retry the missing part.");
          parts.push({ PartNumber: part.PartNumber, ETag: part.ETag });
        }
        marker = listed.IsTruncated ? listed.NextPartNumberMarker : undefined;
      } while (marker);
      if (parts.length !== Math.ceil(upload.size / EVENT_PART_BYTES)) throw new HttpError(409, "upload_incomplete", "The upload is incomplete. Retry the missing part.");
      await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: upload.key, UploadId: upload.multipartId, MultipartUpload: { Parts: parts } }));
      head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: upload.key }));
    }
    if (head.ContentLength !== upload.size || head.ContentType !== upload.contentType || head.Metadata?.event !== upload.eventId || head.Metadata?.admin !== String(upload.adminId) || head.Metadata?.upload !== upload.id) throw new HttpError(409, "upload_mismatch", "Storage did not confirm this event's file size, type and ownership.");
    const bytes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: upload.key, Range: `bytes=0-${Math.min(upload.size, upload.kind === "cover" ? 3 * 1024 * 1024 : 4096) - 1}` }));
    validateEventSignature(await bytes.Body!.transformToByteArray(), upload);
    return await getEventStore().finish(upload.id);
  } finally { client.destroy(); }
}
export async function abortEventUpload(upload: EventUpload) {
  if (upload.state === "complete") throw new HttpError(409, "upload_complete", "This file is already attached.");
  const result = await getEventStore().finish(upload.id, true);
  const { client, bucket } = connection();
  try { await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: upload.key, UploadId: upload.multipartId })); } catch (e) { if ((e as { name?: string }).name !== "NoSuchUpload") throw e; } finally { client.destroy(); }
  return result;
}
export async function streamEventAsset(key: string, range: string | null) {
  await assertEventBucketPrivate(); const { client, bucket } = connection();
  try { const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) })); return { object, close: () => client.destroy() }; } catch (e) { client.destroy(); throw e; }
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GitHub authorization is unavailable");
  return createHash("sha256").update(`opencircle:github-stars:v1:${secret}`).digest();
}

export function sealStarAuthorization(token: string, session: string, userId: number): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(`${session}:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openStarAuthorization(value: string | undefined, session: string, userId: number): string | null {
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${session}:${userId}`));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8") || null;
  } catch {
    return null;
  }
}

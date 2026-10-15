import { promisify } from "node:util";
import { constants, gzip } from "node:zlib";

const compress = promisify(gzip);

function acceptsGzip(header: string): boolean {
  const choices = header.toLowerCase().split(",").map((part) => {
    const [token, ...parameters] = part.trim().split(";");
    const name = token.trim();
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="))?.trim().slice(2);
    return { name, quality: quality === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality) ? Number(quality) : 0 };
  });
  const selected = choices.find((choice) => choice.name === "gzip") ?? choices.find((choice) => choice.name === "*");
  return (selected?.quality ?? 0) > 0;
}

export async function encodePublicJson(response: Response, accepted: string): Promise<Buffer> {
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.headers.get("content-type")?.startsWith("application/json") || /(?:private|no-store|no-transform)/i.test(response.headers.get("cache-control") ?? "") || response.headers.has("content-encoding")) return body;
  const vary = response.headers.get("vary")?.split(",").map((value) => value.trim()) ?? [];
  if (!vary.some((value) => ["*", "accept-encoding"].includes(value.toLowerCase()))) response.headers.set("vary", [...vary, "Accept-Encoding"].join(", "));
  if (body.length < 1024 || !acceptsGzip(accepted)) return body;
  const compressed = await compress(body, { level: constants.Z_BEST_SPEED });
  if (compressed.length >= body.length) return body;
  response.headers.set("content-encoding", "gzip");
  response.headers.set("content-length", String(compressed.length));
  const etag = response.headers.get("etag");
  if (etag && !etag.startsWith("W/")) response.headers.set("etag", `W/${etag}`);
  return compressed;
}

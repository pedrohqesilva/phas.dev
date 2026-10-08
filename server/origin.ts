// Only Cloudflare may talk to this server. The app's Railway addresses answer to anyone on the internet,
// and a request sent to them straight skips Cloudflare (its DDoS protection, its cache, and the real
// visitor address the game limits rely on). Cloudflare adds a secret header to every request it forwards
// (a Transform Rule); without ORIGIN_SECRET set (development) every request is let through.
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const ORIGIN_HEADER = "x-origin-auth";
const secret = process.env.ORIGIN_SECRET ?? "";

/** True when the request came through Cloudflare (or nothing is configured to check). */
export function fromCloudflare(req: IncomingMessage): boolean {
  if (!secret) return true;
  const got = req.headers[ORIGIN_HEADER];
  if (typeof got !== "string" || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/** The visitor's address: Cloudflare's header first, then the proxy chain, then the socket. */
export function visitorAddress(req: IncomingMessage): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  const chain = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();
  return chain || req.socket.remoteAddress || "?";
}

import crypto from "crypto";

export function hashIp(ip) {
  if (!ip || typeof ip !== "string") return null;
  const cleaned = ip.trim();
  if (!cleaned) return null;
  const secret = process.env.IP_HASH_SECRET || process.env.NEXTAUTH_SECRET || "divine-ip-salt";
  return crypto.createHmac("sha256", secret).update(cleaned).digest("hex").slice(0, 32);
}

export function extractCoarseCountry(req) {
  const headers = req?.headers || {};
  const candidates = [
    headers["x-vercel-ip-country"],
    headers["cf-ipcountry"],
    headers["x-country-code"],
    headers["cloudfront-viewer-country"],
  ];

  // Netlify passes geo JSON in x-nf-geo (base64 or JSON)
  if (!candidates.some(Boolean) && headers["x-nf-geo"]) {
    try {
      const raw = String(headers["x-nf-geo"]);
      const parsed = raw.trim().startsWith("{")
        ? JSON.parse(raw)
        : JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      if (parsed?.country?.code) candidates.push(parsed.country.code);
    } catch {}
  }

  for (const val of candidates) {
    if (typeof val !== "string") continue;
    const code = val.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1") {
      return code;
    }
  }
  return null;
}

export function sanitizeUserAgent(ua) {
  if (!ua || typeof ua !== "string") return null;
  return ua.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 220) || null;
}

export function isValidGuestId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{12,64}$/.test(id);
}

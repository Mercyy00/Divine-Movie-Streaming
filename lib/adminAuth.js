// Pure auth & origin security helpers for DIVINE (no DB/framework side effects)

export function getConfiguredAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getConfiguredAdminEmails().includes(normalized);
}

/**
 * Single-admin verified-only evaluator.
 * Grants ADMIN strictly when:
 * 1) User exists and is not banned (`!user.bannedAt`)
 * 2) Email is verified (`Boolean(user.emailVerified)`)
 * 3) Email matches `ADMIN_EMAILS` env var (normalized lowercase)
 * Never trusts stale JWT role alone; removing from ADMIN_EMAILS or banning immediately revokes.
 */
export function resolveEffectiveUserRole(user) {
  if (!user || user.bannedAt) return "USER";
  if (user.emailVerified && isConfiguredAdminEmail(user.email)) {
    return "ADMIN";
  }
  return "USER";
}

export function isSameOriginRequest(req) {
  const headers = req?.headers || {};
  const fetchSite = String(headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return { ok: false, reason: "Cross-site request blocked" };
  }

  const rawHost = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim().toLowerCase();
  if (!rawHost) {
    return { ok: true };
  }

  const origin = headers.origin;
  const referer = headers.referer;

  const checkUrlHost = (rawUrl) => {
    try {
      const u = new URL(rawUrl);
      return u.host.toLowerCase() === rawHost;
    } catch {
      return false;
    }
  };

  if (origin && origin !== "null") {
    if (!checkUrlHost(origin)) {
      return { ok: false, reason: "Origin mismatch" };
    }
  } else if (referer) {
    if (!checkUrlHost(referer)) {
      return { ok: false, reason: "Referer mismatch" };
    }
  }

  return { ok: true };
}

export function slugifyUsernameBase(input) {
  const cleaned = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (cleaned.length >= 3) return cleaned.slice(0, 15);
  if (cleaned.length > 0) return (cleaned + "_user").slice(0, 15);
  return "divine_user";
}

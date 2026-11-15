import { prisma, isPrismaUnavailableError } from "../../../lib/prisma";
import { applyApiGuard, checkRateLimit, getClientIp } from "../../../lib/api-guard";
import { isSameOriginRequest } from "../../../lib/adminAuth";
import { extractCoarseCountry, hashIp, sanitizeUserAgent } from "../../../lib/privacy";
import { guestSyncPayloadSchema, normalizeGuestHistoryRows } from "../../../lib/guestSync";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req).ok) return res.status(403).json({ error: "Invalid request origin" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 30, windowMs: 60000, prefix: "guest_sync" }))) {
    return;
  }

  const parsed = guestSyncPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
  }

  const { guestId, history } = parsed.data;
  const perGuestLimit = await checkRateLimit(`guest_sync_id:${guestId}`, { limit: 20, windowMs: 60000 });
  if (!perGuestLimit.success) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many sync updates for this guest." });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ ok: true, persisted: false });
  }

  const ipHash = hashIp(getClientIp(req));
  const country = extractCoarseCountry(req);
  const userAgent = sanitizeUserAgent(req.headers?.["user-agent"]);
  const now = new Date();

  try {
    await prisma.guest.upsert({
      where: { id: guestId },
      create: {
        id: guestId,
        firstSeenAt: now,
        lastSeenAt: now,
        country,
        userAgent,
        ipHash,
      },
      update: {
        lastSeenAt: now,
        ...(country ? { country } : {}),
        ...(userAgent ? { userAgent } : {}),
        ...(ipHash ? { ipHash } : {}),
      },
    });

    const rows = normalizeGuestHistoryRows(guestId, history);
    if (rows.length > 0) {
      await prisma.$transaction(
        rows.map((row) =>
          prisma.guestWatchHistory.upsert({
            where: {
              guestId_titleId_season_episode: {
                guestId: row.guestId,
                titleId: row.titleId,
                season: row.season,
                episode: row.episode,
              },
            },
            create: row,
            update: {
              titleData: row.titleData,
              progress: row.progress,
              timeLeft: row.timeLeft,
              watchedAt: row.watchedAt,
            },
          })
        )
      );
    }

    return res.status(200).json({ ok: true, persisted: true, synced: rows.length });
  } catch (err) {
    if (isPrismaUnavailableError(err)) {
      return res.status(200).json({ ok: true, persisted: false });
    }
    console.error("guest sync error:", err?.code || err?.message);
    return res.status(500).json({ error: "Could not sync guest history" });
  }
}

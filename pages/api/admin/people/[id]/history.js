import { prisma } from "../../../../../lib/prisma";
import { requireAdmin } from "../../../../../lib/session";
import { applyApiGuard } from "../../../../../lib/api-guard";
import {
  clampPage,
  clampPageSize,
  dateCutoffFromRange,
  estimateWatchHours,
} from "../../../../../lib/adminData";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 60, windowMs: 60000, prefix: "admin_person_history" }))) {
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const targetId = String(req.query.id || "").trim();
  const kind = req.query.kind === "guest" ? "guest" : req.query.kind === "user" ? "user" : null;
  const typeFilter = ["all", "movie", "series", "anime"].includes(req.query.type) ? req.query.type : "all";
  const dateRange = ["all", "24h", "7d", "30d"].includes(req.query.dateRange) ? req.query.dateRange : "all";
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().slice(0, 100) : "";
  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize, 25);

  if (!targetId || targetId.length > 128) {
    return res.status(400).json({ error: "Invalid person id" });
  }

  try {
    let entries = [];
    if (kind !== "guest") {
      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, guests: { select: { id: true } } },
      });
      if (user) {
        const userHist = await prisma.watchHistory.findMany({
          where: { userId: user.id },
          orderBy: { watchedAt: "desc" },
          take: 1000,
        });
        entries = userHist.map((h) => ({ ...h, source: "account" }));

        const guestIds = (user.guests || []).map((g) => g.id);
        if (guestIds.length > 0) {
          const guestHist = await prisma.guestWatchHistory.findMany({
            where: { guestId: { in: guestIds } },
            orderBy: { watchedAt: "desc" },
            take: 500,
          });
          const seen = new Set(entries.map((e) => `${e.titleId}:${e.season}:${e.episode}`));
          for (const g of guestHist) {
            const key = `${g.titleId}:${g.season}:${g.episode}`;
            if (!seen.has(key)) {
              seen.add(key);
              entries.push({ ...g, source: "guest" });
            }
          }
        }
      }
    }

    if (entries.length === 0 && kind !== "user") {
      const guest = await prisma.guest.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!guest && kind === "guest") {
        return res.status(404).json({ error: "Guest not found" });
      }
      if (guest) {
        const guestHist = await prisma.guestWatchHistory.findMany({
          where: { guestId: guest.id },
          orderBy: { watchedAt: "desc" },
          take: 1000,
        });
        entries = guestHist.map((g) => ({ ...g, source: "guest" }));
      }
    }

    entries.sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime());

    const totalTitles = new Set(entries.map((e) => e.titleId)).size;
    const totalHours = estimateWatchHours(entries);
    const cutoff = dateCutoffFromRange(dateRange);

    const filtered = entries.filter((e) => {
      const td = e.titleData && typeof e.titleData === "object" ? e.titleData : {};
      const itemType = td.type === "tv" ? "series" : td.type || "movie";
      if (typeFilter !== "all" && itemType !== typeFilter) return false;
      if (cutoff > 0 && new Date(e.watchedAt).getTime() < cutoff) return false;
      if (q) {
        const label = String(td.title || td.name || e.titleId || "").toLowerCase();
        if (!label.includes(q)) return false;
      }
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((e) => {
      const rawTd = e.titleData && typeof e.titleData === "object" ? { ...e.titleData } : {};
      delete rawTd._playback;
      return {
        id: e.id,
        titleId: e.titleId,
        title: rawTd.title || rawTd.name || e.titleId,
        poster: rawTd.poster || null,
        type: rawTd.type === "tv" ? "series" : rawTd.type || "movie",
        year: rawTd.year || null,
        progress: Number(e.progress) || 0,
        season: Number(e.season) || 0,
        episode: Number(e.episode) || 0,
        timeLeft: e.timeLeft || null,
        watchedAt: new Date(e.watchedAt).toISOString(),
        source: e.source || "account",
      };
    });

    return res.status(200).json({
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
      stats: {
        totalTitles,
        totalEntries: entries.length,
        totalHours,
      },
    });
  } catch (err) {
    console.error("Admin person history error:", err);
    return res.status(500).json({ error: "Could not load watch history" });
  }
}

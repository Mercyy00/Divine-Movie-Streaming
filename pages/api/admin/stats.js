import { prisma } from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/session";
import { applyApiGuard } from "../../../lib/api-guard";
import { computeAdminStats } from "../../../lib/adminData";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 30, windowMs: 60000, prefix: "admin_stats" }))) {
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [users, guests, userHistory, guestHistory] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          emailVerified: true,
          passwordHash: true,
          bannedAt: true,
          createdAt: true,
          updatedAt: true,
          accounts: { select: { provider: true } },
          guests: { select: { id: true, country: true, lastSeenAt: true } },
          watchHistory: { orderBy: { watchedAt: "desc" }, take: 1, select: { watchedAt: true } },
          _count: { select: { watchHistory: true, watchlist: true, customLists: true } },
        },
      }),
      prisma.guest.findMany({
        select: {
          id: true,
          firstSeenAt: true,
          lastSeenAt: true,
          createdAt: true,
          country: true,
          userId: true,
          _count: { select: { watchHistory: true } },
        },
      }),
      prisma.watchHistory.findMany({
        where: { watchedAt: { gte: cutoff30 } },
        select: { userId: true, titleId: true, titleData: true, watchedAt: true },
        take: 10000,
      }),
      prisma.guestWatchHistory.findMany({
        where: { watchedAt: { gte: cutoff30 } },
        select: { guestId: true, titleId: true, titleData: true, watchedAt: true },
        take: 10000,
      }),
    ]);

    const safeUsers = users.map((u) => ({
      ...u,
      passwordHash: Boolean(u.passwordHash),
    }));

    const stats = computeAdminStats(safeUsers, guests, userHistory, guestHistory);
    return res.status(200).json(stats);
  } catch (err) {
    console.error("Admin stats error:", err);
    return res.status(500).json({ error: "Could not compute admin stats" });
  }
}

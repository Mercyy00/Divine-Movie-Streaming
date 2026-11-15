import { prisma } from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/session";
import { applyApiGuard } from "../../../lib/api-guard";
import {
  parseAdminListQuery,
  normalizeUserPerson,
  normalizeGuestPerson,
  filterSortPaginatePeople,
  summarizePeople,
} from "../../../lib/adminData";

export async function loadUnifiedPeople() {
  const [users, guests] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        emailVerified: true,
        image: true,
        passwordHash: true,
        role: true,
        bannedAt: true,
        createdAt: true,
        updatedAt: true,
        accounts: { select: { provider: true } },
        guests: { select: { id: true, country: true, lastSeenAt: true } },
        watchHistory: {
          orderBy: { watchedAt: "desc" },
          take: 1,
          select: { watchedAt: true },
        },
        _count: {
          select: {
            watchHistory: true,
            watchlist: true,
            customLists: true,
          },
        },
      },
    }),
    prisma.guest.findMany({
      where: { userId: null },
      select: {
        id: true,
        firstSeenAt: true,
        lastSeenAt: true,
        createdAt: true,
        country: true,
        userAgent: true,
        userId: true,
        _count: {
          select: { watchHistory: true },
        },
      },
    }),
  ]);

  // Never leak passwordHash downstream; only pass boolean presence to normalizeUserPerson
  const safeUsers = users.map((u) => ({
    ...u,
    passwordHash: Boolean(u.passwordHash),
  }));

  return [
    ...safeUsers.map(normalizeUserPerson),
    ...guests.map(normalizeGuestPerson),
  ];
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 60, windowMs: 60000, prefix: "admin_people" }))) {
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const people = await loadUnifiedPeople();
    const filters = parseAdminListQuery(req.query);
    const paged = filterSortPaginatePeople(people, filters);
    const summary = summarizePeople(people);

    return res.status(200).json({
      ...paged,
      summary,
    });
  } catch (err) {
    console.error("Admin people list error:", err);
    return res.status(500).json({ error: "Could not load people" });
  }
}

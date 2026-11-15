import { prisma } from "../../../../lib/prisma";
import { requireAdmin } from "../../../../lib/session";
import { applyApiGuard } from "../../../../lib/api-guard";
import { isSameOriginRequest, resolveEffectiveUserRole } from "../../../../lib/adminAuth";
import { normalizeUserPerson, normalizeGuestPerson } from "../../../../lib/adminData";
import { logAdminAction } from "../../../../lib/adminAudit";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method === "DELETE" && !isSameOriginRequest(req).ok) {
    return res.status(403).json({ error: "Invalid request origin" });
  }
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 60, windowMs: 60000, prefix: "admin_person_detail" }))) {
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const targetId = String(req.query.id || "").trim();
  const kindHint = req.query.kind === "guest" ? "guest" : req.query.kind === "user" ? "user" : null;
  if (!targetId || targetId.length > 128) {
    return res.status(400).json({ error: "Invalid person id" });
  }

  try {
    let userRow = null;
    let guestRow = null;

    if (kindHint !== "guest") {
      userRow = await prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          emailVerified: true,
          image: true,
          bio: true,
          isPublic: true,
          passwordHash: true,
          role: true,
          bannedAt: true,
          createdAt: true,
          updatedAt: true,
          accounts: { select: { id: true, provider: true, type: true } },
          profiles: { select: { id: true, name: true, avatar: true, isKids: true, createdAt: true } },
          watchlist: {
            orderBy: { addedAt: "desc" },
            take: 100,
            select: { id: true, titleId: true, titleData: true, addedAt: true },
          },
          customLists: {
            orderBy: { updatedAt: "desc" },
            include: { _count: { select: { items: true } } },
          },
          guests: {
            select: {
              id: true,
              firstSeenAt: true,
              lastSeenAt: true,
              country: true,
              userAgent: true,
            },
          },
          watchHistory: {
            orderBy: { watchedAt: "desc" },
            take: 1,
            select: { watchedAt: true },
          },
          _count: { select: { watchHistory: true, watchlist: true, customLists: true } },
        },
      });
    }

    if (!userRow && kindHint !== "user") {
      guestRow = await prisma.guest.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          firstSeenAt: true,
          lastSeenAt: true,
          createdAt: true,
          country: true,
          userAgent: true,
          userId: true,
          _count: { select: { watchHistory: true } },
        },
      });
    }

    if (!userRow && !guestRow) {
      return res.status(404).json({ error: "Person not found" });
    }

    if (req.method === "GET") {
      if (userRow) {
        await logAdminAction(req, {
          adminId: admin.id,
          action: "VIEW_PERSON",
          targetType: "user",
          targetId: userRow.id,
        });

        const person = normalizeUserPerson({
          ...userRow,
          passwordHash: Boolean(userRow.passwordHash),
        });

        return res.status(200).json({
          person,
          details: {
            bio: userRow.bio || null,
            isPublic: userRow.isPublic,
            accounts: userRow.accounts,
            profiles: userRow.profiles,
            watchlist: userRow.watchlist,
            customLists: userRow.customLists,
            linkedGuests: userRow.guests,
          },
        });
      }

      await logAdminAction(req, {
        adminId: admin.id,
        action: "VIEW_PERSON",
        targetType: "guest",
        targetId: guestRow.id,
      });

      return res.status(200).json({
        person: normalizeGuestPerson(guestRow),
        linkedUserId: guestRow.userId || null,
        details: {
          userAgent: guestRow.userAgent || null,
          country: guestRow.country || null,
        },
      });
    }

    // DELETE
    if (userRow) {
      if (userRow.id === admin.id || resolveEffectiveUserRole(userRow) === "ADMIN") {
        return res.status(403).json({ error: "The administrator account cannot be deleted." });
      }
      await prisma.user.delete({ where: { id: userRow.id } });
      await logAdminAction(req, {
        adminId: admin.id,
        action: "DELETE_PERSON",
        targetType: "user",
        targetId: userRow.id,
      });
      return res.status(200).json({ ok: true, deletedType: "user" });
    }

    await prisma.guest.delete({ where: { id: guestRow.id } });
    await logAdminAction(req, {
      adminId: admin.id,
      action: "DELETE_PERSON",
      targetType: "guest",
      targetId: guestRow.id,
    });
    return res.status(200).json({ ok: true, deletedType: "guest" });
  } catch (err) {
    console.error("Admin person detail error:", err);
    return res.status(500).json({ error: "Database error" });
  }
}

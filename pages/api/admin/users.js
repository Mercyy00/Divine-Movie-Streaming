import { prisma } from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/session";
import { applyApiGuard } from "../../../lib/api-guard";
import { isSameOriginRequest, resolveEffectiveUserRole } from "../../../lib/adminAuth";
import { logAdminAction } from "../../../lib/adminAudit";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method === "POST" && !isSameOriginRequest(req).ok) {
    return res.status(403).json({ error: "Invalid request origin" });
  }
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, prefix: "admin_users_api" }))) return;

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          bannedAt: true,
          _count: {
            select: {
              watchHistory: true,
              watchlist: true,
              customLists: true,
            },
          },
        },
      });

      return res.status(200).json(
        users.map((u) => ({
          ...u,
          role: resolveEffectiveUserRole(u),
        }))
      );
    } catch (err) {
      console.error("Admin users list error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  }

  const { action, userId } = req.body || {};
  if (!action || !userId) {
    return res.status(400).json({ error: "Action and userId are required" });
  }

  if (action === "toggle-role") {
    return res.status(403).json({ error: "Admin promotion via UI is disabled." });
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true, bannedAt: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.id === admin.id || resolveEffectiveUserRole(targetUser) === "ADMIN") {
      return res.status(403).json({ error: "The administrator account cannot be modified or banned." });
    }

    if (action === "ban") {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          bannedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
      await logAdminAction(req, {
        adminId: admin.id,
        action: "BAN_USER",
        targetType: "user",
        targetId: userId,
      });
      return res.status(200).json({ success: true, bannedAt: updated.bannedAt });
    }

    if (action === "unban") {
      await prisma.user.update({
        where: { id: userId },
        data: { bannedAt: null },
      });
      await logAdminAction(req, {
        adminId: admin.id,
        action: "UNBAN_USER",
        targetType: "user",
        targetId: userId,
      });
      return res.status(200).json({ success: true, bannedAt: null });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("Admin user action error:", err);
    return res.status(500).json({ error: "Database error" });
  }
}

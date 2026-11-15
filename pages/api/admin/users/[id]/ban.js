import { prisma } from "../../../../../lib/prisma";
import { requireAdmin } from "../../../../../lib/session";
import { applyApiGuard } from "../../../../../lib/api-guard";
import { isSameOriginRequest, resolveEffectiveUserRole } from "../../../../../lib/adminAuth";
import { logAdminAction } from "../../../../../lib/adminAudit";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req).ok) return res.status(403).json({ error: "Invalid request origin" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 20, windowMs: 60000, prefix: "admin_ban" }))) {
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const targetId = String(req.query.id || "").trim();
  if (!targetId) return res.status(400).json({ error: "User id is required" });

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, emailVerified: true, bannedAt: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.id === admin.id || resolveEffectiveUserRole(targetUser) === "ADMIN") {
      return res.status(403).json({ error: "The administrator account cannot be banned." });
    }

    const shouldBan =
      typeof req.body?.banned === "boolean"
        ? req.body.banned
        : req.body?.action === "unban"
        ? false
        : req.body?.action === "ban"
        ? true
        : !targetUser.bannedAt;

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: shouldBan
        ? { bannedAt: new Date(), tokenVersion: { increment: 1 } }
        : { bannedAt: null },
      select: { id: true, bannedAt: true },
    });

    await logAdminAction(req, {
      adminId: admin.id,
      action: shouldBan ? "BAN_USER" : "UNBAN_USER",
      targetType: "user",
      targetId: targetUser.id,
    });

    return res.status(200).json({
      ok: true,
      bannedAt: updated.bannedAt ? updated.bannedAt.toISOString() : null,
    });
  } catch (err) {
    console.error("Admin ban error:", err);
    return res.status(500).json({ error: "Database error" });
  }
}

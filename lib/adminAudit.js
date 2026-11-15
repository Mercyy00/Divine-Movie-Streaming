import { prisma } from "./prisma";
import { getClientIp } from "./api-guard";
import { hashIp } from "./privacy";

export async function logAdminAction(req, { adminId, action, targetType, targetId }) {
  if (!process.env.DATABASE_URL || !adminId) return;
  try {
    const ipHash = hashIp(getClientIp(req));
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action: String(action).slice(0, 64),
        targetType: String(targetType).slice(0, 32),
        targetId: String(targetId).slice(0, 128),
        ip: ipHash,
      },
    });
  } catch (err) {
    console.warn("AdminAuditLog write skipped:", err?.message || "DB error");
  }
}

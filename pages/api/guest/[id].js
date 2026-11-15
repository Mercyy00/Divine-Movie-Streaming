import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { applyApiGuard } from "../../../lib/api-guard";
import { isSameOriginRequest, resolveEffectiveUserRole } from "../../../lib/adminAuth";
import { isValidGuestId } from "../../../lib/privacy";

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req).ok) return res.status(403).json({ error: "Invalid request origin" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 10, windowMs: 60000, prefix: "guest_delete" }))) {
    return;
  }

  const guestId = String(req.query.id || "").trim();
  if (!isValidGuestId(guestId)) {
    return res.status(400).json({ error: "Invalid guest identifier" });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ ok: true, persisted: false });
  }

  try {
    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      select: { id: true, userId: true },
    });

    if (!guest) {
      return res.status(200).json({ ok: true });
    }

    // If the guest record is already claimed by a signed-in account, require that owner or admin
    if (guest.userId) {
      const session = await getServerSession(req, res, authOptions);
      const isOwner = session?.user?.id === guest.userId;
      let isAdmin = false;
      if (session?.user?.id && !isOwner) {
        const dbUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { email: true, emailVerified: true, bannedAt: true },
        });
        isAdmin = resolveEffectiveUserRole(dbUser) === "ADMIN";
      }
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Cannot delete claimed guest data" });
      }
    }

    await prisma.guest.delete({ where: { id: guestId } });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("guest delete error:", err?.code || err?.message);
    return res.status(500).json({ error: "Could not delete guest data" });
  }
}

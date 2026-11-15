import crypto from "crypto";
import { prisma } from "../../../lib/prisma";
import { applyApiGuard } from "../../../lib/api-guard";
import { isSameOriginRequest } from "../../../lib/adminAuth";
import { hashResetToken } from "../../../lib/tokenHash";
import { sendVerificationEmail } from "../../../lib/email";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req).ok) return res.status(403).json({ error: "Invalid request origin" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 3, windowMs: 60000, prefix: "auth_resend_verify" }))) return;
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, bannedAt: true },
    });

    if (user && !user.emailVerified && !user.bannedAt) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(rawToken);
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.verificationToken.deleteMany({
        where: { identifier: `verify:${email}` },
      });
      await prisma.verificationToken.create({
        data: {
          identifier: `verify:${email}`,
          token: tokenHash,
          expires,
        },
      });

      const siteUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
      const verifyUrl = `${siteUrl}/auth/verify?token=${rawToken}&email=${encodeURIComponent(email)}`;
      await sendVerificationEmail({ to: email, verifyUrl });
    }

    return res.status(200).json({
      ok: true,
      message: "If an unverified account exists for that email, a fresh verification link has been sent.",
    });
  } catch (err) {
    console.error("Resend verify error:", err?.code || err?.message);
    return res.status(500).json({ error: "Could not send verification email." });
  }
}

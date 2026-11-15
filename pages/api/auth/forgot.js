import crypto from "crypto";
import { prisma } from "../../../lib/prisma";
import { applyApiGuard } from "../../../lib/api-guard";
import { hashResetToken } from "../../../lib/tokenHash";
import { sendPasswordResetEmail } from "../../../lib/email";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const guarded = await applyApiGuard(req, res, { cacheSeconds: 0, limit: 5, windowMs: 60000, prefix: "forgot_pwd" });
  if (!guarded) return;

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(200).json({ ok: true, message: "If an account with that email exists, password reset instructions have been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({
      where: { identifier: `reset:${email}` },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: `reset:${email}`,
        token: tokenHash,
        expires,
      },
    });

    const siteUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
    const resetUrl = `${siteUrl}/auth/reset?token=${token}&email=${encodeURIComponent(email)}`;
    await sendPasswordResetEmail({ to: email, resetUrl });

    return res.status(200).json({ ok: true, message: "If an account with that email exists, password reset instructions have been sent." });
  } catch (e) {
    console.error("Forgot password error:", e);
    return res.status(500).json({ error: "Could not process request." });
  }
}

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { applyApiGuard } from "../../../lib/api-guard";
import { isSameOriginRequest } from "../../../lib/adminAuth";
import { hashResetToken } from "../../../lib/tokenHash";
import { sendVerificationEmail } from "../../../lib/email";

const schema = z.object({
  username: z
    .string()
    .min(3, "Username must be 3–20 characters")
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers and _"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req).ok) return res.status(403).json({ error: "Invalid request origin" });
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 10, windowMs: 60000, prefix: "auth_register" }))) return;
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email.toLowerCase();

  try {
    const exists = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (exists) return res.status(409).json({ error: "Email or username already taken" });

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    // Security: Credentials signups ALWAYS start as USER with emailVerified: null.
    // ADMIN is never assigned on plain credentials signup without verified email.
    await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        name: parsed.data.username,
        role: "USER",
        emailVerified: null,
      },
    });

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
    const emailResult = await sendVerificationEmail({ to: email, verifyUrl });

    return res.status(201).json({
      ok: true,
      requiresVerification: true,
      emailSent: emailResult.sent,
    });
  } catch (e) {
    console.error("register error:", e.code || e.message);
    return res.status(500).json({ error: "Could not create account" });
  }
}

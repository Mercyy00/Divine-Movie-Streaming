import { prisma } from "../../../lib/prisma";
import { applyApiGuard } from "../../../lib/api-guard";
import { hashResetToken } from "../../../lib/tokenHash";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await applyApiGuard(req, res, { cacheSeconds: 0, limit: 15, windowMs: 60000, prefix: "auth_verify" }))) return;
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  const input = req.method === "GET" ? req.query : req.body || {};
  const token = String(input?.token || "").trim();
  const email = String(input?.email || "").trim().toLowerCase();

  if (!token || !email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid verification link." });
  }

  const tokenHash = hashResetToken(token);

  try {
    const record = await prisma.verificationToken.findFirst({
      where: {
        identifier: `verify:${email}`,
        token: tokenHash,
      },
    });

    if (!record || record.expires < new Date()) {
      return res.status(400).json({ error: "Verification link is invalid or has expired." });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, bannedAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Account not found." });
    }
    if (user.bannedAt) {
      return res.status(403).json({ error: "This account has been suspended." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    await prisma.verificationToken.deleteMany({
      where: { identifier: `verify:${email}` },
    });

    return res.status(200).json({ ok: true, message: "Email verified! You can now sign in." });
  } catch (err) {
    console.error("Email verify error:", err?.code || err?.message);
    return res.status(500).json({ error: "Could not verify email." });
  }
}

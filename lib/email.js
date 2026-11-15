// Server-side transactional email helper using Resend (never logs tokens or secret links)

async function dispatchEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[DIVINE Auth] RESEND_API_KEY not configured; email not dispatched.");
    }
    return { sent: false, reason: "Email provider not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "DIVINE <security@divine.su>",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: `Email HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("Failed to send email via Resend:", err?.message || "Unknown error");
    return { sent: false, reason: "Network error" };
  }
}

export async function sendVerificationEmail({ to, verifyUrl }) {
  return dispatchEmail({
    to,
    subject: "Verify your DIVINE email",
    html: `<p>Welcome to DIVINE.</p><p>Click the link below to verify your email address:</p><p><a href="${verifyUrl}">Verify email address</a></p><p>This link expires in 24 hours. If you did not create an account, you can ignore this message.</p>`,
  });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  return dispatchEmail({
    to,
    subject: "Reset your DIVINE password",
    html: `<p>Hello,</p><p>You requested a password reset for DIVINE. Click the link below to set a new password:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link will expire in 1 hour.</p>`,
  });
}

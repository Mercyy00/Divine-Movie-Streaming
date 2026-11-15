import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import styles from "../../styles/Auth.module.css";

export default function VerifyEmailPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const emailParam = typeof router.query.email === "string" ? router.query.email : "";

  const [status, setStatus] = useState("idle"); // idle | verifying | verified | error
  const [message, setMessage] = useState("");
  const [resendEmail, setResendEmail] = useState(emailParam);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (emailParam) setResendEmail(emailParam);
  }, [emailParam]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token || !emailParam) {
      setStatus("error");
      setMessage("Missing verification token or email. Request a fresh verification link below.");
      return;
    }

    let cancelled = false;
    setStatus("verifying");
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: emailParam }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setStatus("verified");
          setMessage(data.message || "Your email has been verified.");
        } else {
          setStatus("error");
          setMessage(data.error || "Verification link is invalid or expired.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not reach the verification service.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, token, emailParam]);

  async function handleResend(e) {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      const r = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      setMessage(d.message || d.error || "Check your inbox for a fresh link.");
    } catch {
      setMessage("Network error requesting verification email.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Layout title="Verify email" flush>
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <Link href="/" aria-label="DIVINE Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/divine-logo-autumn-on-dark.svg" alt="DIVINE" className={styles.logoImg} />
            </Link>
          </div>
          <h1 className={styles.title}>Email verification</h1>

          {status === "verifying" && <p className={styles.sub}>Verifying your email address…</p>}

          {status === "verified" && (
            <>
              <p className={styles.success} role="status">{message}</p>
              <Link href="/auth/signin" className={styles.btn}>
                Continue to Sign in
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <p className={styles.error} role="alert">{message}</p>
              <form onSubmit={handleResend} className={styles.stackForm}>
                <label className={styles.field}>
                  Resend verification link
                  <input
                    className={styles.input}
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                </label>
                <button className={styles.oauth} type="submit" disabled={resending}>
                  {resending ? "Sending…" : "Send new verification link"}
                </button>
              </form>
            </>
          )}

          <p className={styles.alt}>
            <Link href="/">Return Home</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

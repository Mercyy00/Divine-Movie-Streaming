import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import Layout from "../../components/Layout";
import GoogleAuthButton from "../../components/GoogleAuthButton";
import styles from "../../styles/Auth.module.css";

const ERRORS = {
  CredentialsSignin: "Invalid email or password",
  OAuthAccountNotLinked: "This email is already registered with another sign-in method",
  OAuthSignin: "Google sign-in is not configured or unavailable right now",
  OAuthCallback: "Social sign-in could not be completed. Please try again",
  EmailNotVerified: "Google could not verify your email address",
  AccountBanned: "This account has been suspended",
  Default: "Something went wrong. Please try again",
};

function safeCallback(v) {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export default function SignIn() {
  const router = useRouter();
  const callbackUrl = safeCallback(router.query.callbackUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (router.query.error) {
      const code = String(router.query.error);
      setError(ERRORS[code] || ERRORS.Default);
    }
  }, [router.query.error]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (res?.ok) {
      router.push(callbackUrl);
    } else {
      setError(ERRORS[res?.error] || res?.error || ERRORS.Default);
    }
  }

  return (
    <Layout title="Sign in" flush>
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={submit}>
          <div className={styles.logoWrap}>
            <Link href="/" aria-label="DIVINE Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/divine-logo-autumn-on-dark.svg"
                alt="DIVINE"
                className={styles.logoImg}
              />
            </Link>
          </div>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.sub}>Sync your history and lists across devices.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}

          <GoogleAuthButton callbackUrl={callbackUrl} disabled={busy} />
          {process.env.NEXT_PUBLIC_GITHUB_ENABLED === "1" && (
            <button
              type="button"
              className={styles.oauth}
              disabled={busy}
              onClick={() => signIn("github", { callbackUrl })}
            >
              Continue with GitHub
            </button>
          )}
          <div className={styles.divider} aria-hidden="true">
            <span>or</span>
          </div>

          <label className={styles.field}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldHeader}>
              <span>Password</span>
              <Link href="/auth/forgot" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className={styles.btn} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className={styles.alt}>
            New here? <Link href="/auth/signup">Create an account</Link>
          </p>
        </form>
      </div>
    </Layout>
  );
}

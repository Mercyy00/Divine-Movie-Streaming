import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import styles from "../../styles/Auth.module.css";

const ERROR_DETAILS = {
  OAuthAccountNotLinked: {
    title: "Account already exists",
    body: "An account with this email already exists using a different sign-in method. Sign in with your existing method or use a verified Google account with matching email.",
  },
  EmailNotVerified: {
    title: "Email not verified",
    body: "Google did not report a verified email for this account. Please verify your Google email address before signing in.",
  },
  AccountBanned: {
    title: "Account suspended",
    body: "This account has been suspended by an administrator and cannot sign in.",
  },
  OAuthSignin: {
    title: "Could not start Google sign-in",
    body: "Google sign-in is unavailable or not configured in this environment yet.",
  },
  OAuthCallback: {
    title: "Sign-in interrupted",
    body: "We could not complete sign-in with your provider. Please try again.",
  },
  Verification: {
    title: "Verification link expired",
    body: "Your verification link has expired or already been used. Request a new verification email to continue.",
  },
  AccessDenied: {
    title: "Access denied",
    body: "You do not have permission to complete this sign-in request.",
  },
  Default: {
    title: "Sign-in error",
    body: "Something unexpected happened while signing you in. Please try again.",
  },
};

export default function AuthErrorPage() {
  const router = useRouter();
  const code = typeof router.query.error === "string" ? router.query.error : "Default";
  const detail = ERROR_DETAILS[code] || ERROR_DETAILS.Default;

  return (
    <Layout title={detail.title} flush>
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <Link href="/" aria-label="DIVINE Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/divine-logo-autumn-on-dark.svg" alt="DIVINE" className={styles.logoImg} />
            </Link>
          </div>
          <h1 className={styles.title}>{detail.title}</h1>
          <p className={styles.error} role="alert">{detail.body}</p>
          <div className={styles.actionsRow}>
            <Link href="/auth/signin" className={`${styles.btn} ${styles.btnFlex}`}>
              Back to Sign in
            </Link>
            <Link href="/" className={`${styles.oauth} ${styles.btnFlex}`}>
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}

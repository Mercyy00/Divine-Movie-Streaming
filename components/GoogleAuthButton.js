import { signIn } from "next-auth/react";
import styles from "../styles/Auth.module.css";

export default function GoogleAuthButton({ callbackUrl = "/", label = "Continue with Google", disabled = false }) {
  if (process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "0") {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.oauth}
      disabled={disabled}
      onClick={() => signIn("google", { callbackUrl })}
      data-testid="google-auth-btn"
    >
      <span className={styles.googleBadge} aria-hidden="true">G</span>
      <span>{label}</span>
    </button>
  );
}

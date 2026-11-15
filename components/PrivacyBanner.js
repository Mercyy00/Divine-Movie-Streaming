import { useSyncExternalStore } from "react";
import Link from "next/link";
import styles from "./PrivacyBanner.module.css";

const ACK_KEY = "divine:privacy-notice-ack";
const ACK_EVENT = "divine:privacy-ack-change";

function subscribe(cb) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  window.addEventListener(ACK_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(ACK_EVENT, cb);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return true;
  }
}

export default function PrivacyBanner() {
  // Server snapshot returns true so banner never flashes during SSR hydration
  const acknowledged = useSyncExternalStore(subscribe, getSnapshot, () => true);

  if (acknowledged) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(ACK_KEY, "1");
      window.dispatchEvent(new Event(ACK_EVENT));
    } catch {}
  };

  return (
    <aside className={styles.banner} aria-label="Privacy notice">
      <p className={styles.body}>
        DIVINE stores preferences locally and syncs watch history (with hashed network metadata) to resume playback and keep the service safe. Learn more in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <div className={styles.actions}>
        <Link href="/settings" className={styles.secondaryBtn}>
          Privacy settings
        </Link>
        <button type="button" className={styles.primaryBtn} onClick={dismiss}>
          Got it
        </button>
      </div>
    </aside>
  );
}

import Link from "next/link";
import { ShieldAlert, Database, ArrowLeft } from "lucide-react";
import Layout from "./Layout";
import styles from "../styles/Admin.module.css";

export default function AdminAccessGate({
  dbConfigured = true,
  signedInEmail = null,
  currentRole = null,
  emailVerified = false,
  callbackUrl = "/admin",
}) {
  if (!dbConfigured) {
    return (
      <Layout title="Admin · Database Not Configured">
        <div className={styles.gateWrap}>
          <Database size={42} className={styles.gateIcon} />
          <h1 className={styles.gateTitle}>Database not configured</h1>
          <p className={styles.gateBody}>
            Set <code>DATABASE_URL</code> and <code>DIRECT_URL</code> in your environment and run{" "}
            <code>npm run db:push</code> to enable accounts, guest tracking, and the admin console.
          </p>
          <div className={styles.gateActions}>
            <Link href="/" className={styles.glassBtn}>
              <ArrowLeft size={15} />
              <span>Return Home</span>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Admin · Access Required">
      <div className={styles.gateWrap}>
        <ShieldAlert size={42} className={styles.gateIcon} />
        <h1 className={styles.gateTitle}>Administrator Access Required</h1>
        {signedInEmail ? (
          <p className={styles.gateBody}>
            Signed in as <strong>{signedInEmail}</strong> (Role: <code>{currentRole || "USER"}</code>
            {!emailVerified ? ", email unverified" : ""}). Only a verified account listed in{" "}
            <code>ADMIN_EMAILS</code> can access the admin console.
          </p>
        ) : (
          <p className={styles.gateBody}>
            Sign in with your verified administrator account to access people, guest history, and featured curation.
          </p>
        )}
        <div className={styles.gateActions}>
          {!signedInEmail && (
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={styles.primaryBtn}>
              Sign in
            </Link>
          )}
          <Link href="/" className={styles.glassBtn}>
            <ArrowLeft size={15} />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

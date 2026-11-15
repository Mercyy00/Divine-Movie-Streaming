import Layout from "../components/Layout";
import { BRAND } from "../lib/constants";

export default function TermsPage() {
  return (
    <Layout title="Terms of Service" description={`Terms of Service for ${BRAND.name}: platform usage rules, accounts, and data handling.`}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px var(--page-pad) 96px" }}>
        <h1 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: -0.5 }}>
          Terms of Service
        </h1>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: "0 0 36px" }}>
          Effective Date: November 2026
        </p>

        <div style={{ display: "grid", gap: 32, fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.85)" }}>
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>1. Acceptance of Terms</h2>
            <p>
              By accessing or using {BRAND.name}, you agree to these Terms of Service and our Privacy Policy, including local preference storage and guest or account watch-history synchronization.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>2. Accounts &amp; Verification</h2>
            <p>
              You may sign in with Google or register using a valid email address and password. You are responsible for maintaining the security of your credentials. Accounts used for abuse, scraping, or automated attacks may be suspended.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>3. Metadata &amp; Trademark Notice</h2>
            <p>
              This product uses the TMDB API but is not endorsed or certified by TMDB. All movie, television series, anime titles, logos, posters, and imagery displayed on {BRAND.name} belong to their respective copyright holders and studios.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>4. Deletion &amp; Termination</h2>
            <p>
              We reserve the right to suspend or remove accounts or guest sessions that violate system integrity. You may erase your guest data or permanently delete your account and associated records at any time from Settings.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}

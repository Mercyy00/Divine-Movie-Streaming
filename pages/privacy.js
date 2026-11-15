import Layout from "../components/Layout";
import { BRAND } from "../lib/constants";

export default function PrivacyPage() {
  return (
    <Layout
      title="Privacy Policy"
      description={`Privacy Policy for ${BRAND.name}: guest watch history, account sync, retention, and deletion rights.`}
    >
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px var(--page-pad) 96px" }}>
        <h1 style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 800, margin: "0 0 12px", letterSpacing: -0.5 }}>
          Privacy Policy
        </h1>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: "0 0 36px" }}>
          Effective Date: November 2026
        </p>

        <div style={{ display: "grid", gap: 32, fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.85)" }}>
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>1. Information We Collect</h2>
            <p>
              When you browse {BRAND.name} as a guest, we store your watch progress, history, and preferences locally in your browser and, unless disabled in Settings, sync a random guest identifier, your watch history, browser user-agent string, coarse country code (derived from CDN/proxy headers), and a salted one-way cryptographic hash of your IP address. We never store raw IP addresses or sell your data to third parties.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>2. Accounts &amp; Google Sign-In</h2>
            <p>
              If you create an account with email and password or sign in with Google, we store your verified email address, display name, username, profile avatar, watchlist, custom lists, and watch history so your library stays synchronized across devices. When you sign in after browsing as a guest, your guest watch history is merged into your account.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>3. Retention &amp; Administrator Access</h2>
            <p>
              Unclaimed guest records and their watch history that remain inactive for more than 90 days are automatically purged. Designated site administrators may review account and guest watch history for moderation, abuse prevention, and support; every administrative access to personal records is recorded in an audit log.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>4. Third-Party Metadata &amp; Embeds</h2>
            <p>
              Movie, series, and anime metadata, posters, and backdrops are retrieved via TMDB and AniList APIs. This product uses the TMDB API but is not endorsed or certified by TMDB. Embedded video players and trailers connect directly to their respective providers under their own privacy policies.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px" }}>5. Your Controls &amp; Right to Erasure</h2>
            <p>
              You can opt out of guest watch-history syncing at any time in Settings &gt; Content (&ldquo;Share watch history with the site&rdquo;) or enable Incognito mode. Both guests and signed-in users can export their data as JSON or permanently delete their stored browser and server records from Settings (&ldquo;Delete my data&rdquo; or &ldquo;Delete account&rdquo;).
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}

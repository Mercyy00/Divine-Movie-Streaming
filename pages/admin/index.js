import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, UserCheck, Ghost, Activity, Calendar, Sparkles } from "lucide-react";
import { getAdminPageProps } from "../../lib/session";
import Layout from "../../components/Layout";
import AdminNav from "../../components/AdminNav";
import AdminAccessGate from "../../components/AdminAccessGate";
import LoadingScreen from "../../components/LoadingScreen";
import styles from "../../styles/Admin.module.css";

export async function getServerSideProps(context) {
  const access = await getAdminPageProps(context);
  return { props: access };
}

function MiniBarChart({ items = [], valueKey, color = "#FF8A2B" }) {
  const maxVal = Math.max(1, ...items.map((d) => Number(d[valueKey]) || 0));
  const width = 420;
  const height = 140;
  const barGap = 4;
  const count = Math.max(1, items.length);
  const barW = Math.max(8, (width - barGap * (count - 1)) / count);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg} role="img" aria-label="14 day activity chart">
      {items.map((item, i) => {
        const val = Number(item[valueKey]) || 0;
        const barH = val > 0 ? Math.max(6, Math.round((val / maxVal) * (height - 28))) : 2;
        const x = i * (barW + barGap);
        const y = height - 20 - barH;
        return (
          <g key={item.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={4}
              fill={val > 0 ? color : "rgba(255,255,255,0.08)"}
            />
            {i % 3 === 0 && (
              <text x={x} y={height - 4} fill="rgba(255,240,224,0.5)" fontSize="9">
                {item.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function AdminDashboardPage({
  authorized = false,
  dbConfigured = true,
  signedInEmail = null,
  currentRole = null,
  emailVerified = false,
}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(Boolean(authorized));
  const [topWindow, setTopWindow] = useState("7d");
  const [chartMode, setChartMode] = useState("activePeople");

  useEffect(() => {
    if (!authorized) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          setStats(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  if (!authorized || currentRole !== "ADMIN") {
    return (
      <AdminAccessGate
        dbConfigured={dbConfigured}
        signedInEmail={signedInEmail}
        currentRole={currentRole}
        emailVerified={emailVerified}
        callbackUrl="/admin"
      />
    );
  }

  if (loading) {
    return (
      <Layout title="Admin · Dashboard">
        <LoadingScreen minHeight="60vh" message="Loading admin overview…" />
      </Layout>
    );
  }

  const summary = stats?.summary || {
    totalPeople: 0,
    signedInUsers: 0,
    guests: 0,
    active24h: 0,
    active7d: 0,
    newThisWeek: 0,
  };
  const daily = stats?.daily || [];
  const topList = topWindow === "30d" ? stats?.topTitles30d || [] : stats?.topTitles7d || [];
  const guestBreakdown = stats?.guestBreakdown || { newGuests7d: 0, returningGuests7d: 0 };
  const methodBreakdown = stats?.methodBreakdown || { google: 0, email: 0, guest: 0 };
  const totalMethods = Math.max(1, methodBreakdown.google + methodBreakdown.email + methodBreakdown.guest);

  return (
    <Layout title="Admin · Dashboard">
      <div className={styles.page}>
        <AdminNav activeTab="overview" />

        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.pageTitle}>Platform Overview</h2>
            <p className={styles.pageSub}>Live metrics from PostgreSQL across signed-in accounts and browser guests.</p>
          </div>
          <Link href="/admin/users" className={styles.primaryBtn}>
            <Users size={15} />
            <span>View All People</span>
          </Link>
        </div>

        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Users size={14} /> Total People</span>
            <span className={styles.kpiValue}>{summary.totalPeople}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><UserCheck size={14} /> Signed-in Users</span>
            <span className={styles.kpiValue}>{summary.signedInUsers}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Ghost size={14} /> Guests</span>
            <span className={styles.kpiValue}>{summary.guests}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Activity size={14} /> Active (24h)</span>
            <span className={styles.kpiValue}>{summary.active24h}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Activity size={14} /> Active (7d)</span>
            <span className={styles.kpiValue}>{summary.active7d}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Calendar size={14} /> New This Week</span>
            <span className={styles.kpiValue}>{summary.newThisWeek}</span>
          </div>
        </section>

        <section className={styles.dashboardGrid}>
          <div className={styles.panelPadded}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>14-Day Activity</h3>
              <div className={styles.pillSwitch}>
                {[
                  { id: "activePeople", label: "Active" },
                  { id: "signups", label: "Signups" },
                  { id: "newGuests", label: "Guests" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles.pillOption} ${chartMode === opt.id ? styles.pillOptionActive : ""}`}
                    onClick={() => setChartMode(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {daily.length === 0 ? (
              <p className={styles.emptyCell}>No activity recorded in the last 14 days.</p>
            ) : (
              <MiniBarChart
                items={daily}
                valueKey={chartMode}
                color={chartMode === "newGuests" ? "#9ec5ff" : "#FF8A2B"}
              />
            )}
          </div>

          <div className={styles.panelPadded}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Audience Breakdown</h3>
            </div>
            <div className={styles.breakdownList}>
              <div className={styles.breakdownItem}>
                <div className={styles.breakdownRow}>
                  <span>Google Accounts</span>
                  <strong>{methodBreakdown.google}</strong>
                </div>
                <progress className={styles.progressTrack} max={totalMethods} value={methodBreakdown.google} />
              </div>
              <div className={styles.breakdownItem}>
                <div className={styles.breakdownRow}>
                  <span>Email + Password</span>
                  <strong>{methodBreakdown.email}</strong>
                </div>
                <progress className={styles.progressTrack} max={totalMethods} value={methodBreakdown.email} />
              </div>
              <div className={styles.breakdownItem}>
                <div className={styles.breakdownRow}>
                  <span>Active Guests</span>
                  <strong>{methodBreakdown.guest}</strong>
                </div>
                <progress className={styles.progressTrack} max={totalMethods} value={methodBreakdown.guest} />
              </div>
              <div className={styles.breakdownRow}>
                <span>New guests (7d): <strong>{guestBreakdown.newGuests7d}</strong></span>
                <span>Returning guests (7d): <strong>{guestBreakdown.returningGuests7d}</strong></span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panelPadded}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>
              <Sparkles size={16} /> Top Watched Titles
            </h3>
            <div className={styles.pillSwitch}>
              {[
                { id: "7d", label: "Last 7 days" },
                { id: "30d", label: "Last 30 days" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${styles.pillOption} ${topWindow === opt.id ? styles.pillOptionActive : ""}`}
                  onClick={() => setTopWindow(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {topList.length === 0 ? (
            <p className={styles.emptyCell}>No watch history recorded in this window yet.</p>
          ) : (
            <div className={styles.mediaList}>
              {topList.map((item, idx) => (
                <div key={item.titleId} className={styles.mediaRow}>
                  <div className={styles.mediaLeft}>
                    <span className={styles.rankTag}>#{idx + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.poster || "/brand/divine-logo-autumn-on-dark.svg"}
                      alt=""
                      className={styles.posterThumb}
                    />
                    <div className={styles.mediaInfo}>
                      <Link href={`/title/${item.titleId}`} className={styles.mediaTitle}>
                        {item.title}
                      </Link>
                      <span className={styles.mediaMeta}>
                        {item.type} · {item.uniqueViewers} viewer{item.uniqueViewers === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeUser}`}>{item.watches} plays</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

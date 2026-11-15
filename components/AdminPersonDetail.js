import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Ban, CheckCircle2, Trash2, Search, ShieldCheck, Clock, Film } from "lucide-react";
import Layout from "./Layout";
import AdminNav from "./AdminNav";
import LoadingScreen from "./LoadingScreen";
import { useToast } from "../lib/useToast";
import styles from "../styles/Admin.module.css";

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminPersonDetail({ personId, kind }) {
  const router = useRouter();
  const [toast, showToast] = useToast(2600);
  const [personData, setPersonData] = useState(null);
  const [historyData, setHistoryData] = useState({
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    stats: { totalTitles: 0, totalEntries: 0, totalHours: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("history");

  // History filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!personId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/people/${encodeURIComponent(personId)}?kind=${kind}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not load person details");
      } else {
        setPersonData(d);
      }
    } catch {
      setError("Network error loading person");
    }
    setLoading(false);
  }, [personId, kind]);

  const loadHistory = useCallback(async () => {
    if (!personId) return;
    try {
      const params = new URLSearchParams({
        kind,
        type: typeFilter,
        dateRange,
        q: searchQ,
        page: String(page),
        pageSize: "25",
      });
      const res = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/history?${params}`);
      if (res.ok) {
        const d = await res.json();
        setHistoryData(d);
      }
    } catch {}
  }, [personId, kind, typeFilter, dateRange, searchQ, page]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleBanToggle = async () => {
    const p = personData?.person;
    if (!p || p.entityType !== "user") return;
    const isBanned = p.status === "banned";
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(p.id)}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: !isBanned }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(d.error || "Action failed");
        return;
      }
      showToast(isBanned ? "User unbanned" : "User banned");
      loadDetail();
    } catch {
      showToast("Network error");
    }
  };

  const handleDelete = async () => {
    const p = personData?.person;
    if (!p) return;
    try {
      const res = await fetch(`/api/admin/people/${encodeURIComponent(p.id)}?kind=${p.entityType}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(d.error || "Could not delete");
        setConfirmDelete(false);
        return;
      }
      router.push("/admin/users");
    } catch {
      showToast("Network error");
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Admin · Person Detail">
        <LoadingScreen minHeight="60vh" message="Loading person profile…" />
      </Layout>
    );
  }

  if (error || !personData?.person) {
    return (
      <Layout title="Admin · Person Not Found">
        <div className={styles.page}>
          <AdminNav activeTab="users" />
          <div className={styles.panelPadded}>
            <p className={styles.modalBody}>{error || "Person not found."}</p>
            <div>
              <Link href="/admin/users" className={styles.glassBtn}>
                <ArrowLeft size={14} />
                <span>Back to People</span>
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const p = personData.person;
  const details = personData.details || {};
  const isUser = p.entityType === "user";
  const isBanned = p.status === "banned";

  return (
    <Layout title={`Admin · ${p.displayName}`}>
      <div className={styles.page}>
        <AdminNav activeTab="users" />

        <div>
          <Link href="/admin/users" className={styles.smallGlassBtn}>
            <ArrowLeft size={14} />
            <span>Back to People</span>
          </Link>
        </div>

        <section className={styles.detailHeader}>
          <div className={styles.detailIdentity}>
            <div className={styles.detailAvatar}>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className={styles.avatarImg} />
              ) : (
                p.displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className={styles.actionsGroup}>
                <h2 className={styles.pageTitle}>{p.displayName}</h2>
                <span
                  className={`${styles.badge} ${
                    p.personType === "admin"
                      ? styles.badgeAdmin
                      : p.personType === "guest"
                      ? styles.badgeGuest
                      : styles.badgeUser
                  }`}
                >
                  {p.personType === "admin" && <ShieldCheck size={12} />}
                  {p.personType.toUpperCase()}
                </span>
                {isUser && (
                  <span className={`${styles.badge} ${isBanned ? styles.badgeBanned : styles.badgeActive}`}>
                    {isBanned ? "Banned" : "Active"}
                  </span>
                )}
              </div>
              <p className={styles.pageSub}>
                {p.email || "Anonymous browser guest"} {p.username ? `· @${p.username}` : ""} · ID: {p.id}
              </p>
            </div>
          </div>

          {!p.isAdmin && (
            <div className={styles.actionsGroup}>
              {isUser && (
                <button
                  type="button"
                  className={isBanned ? styles.successBtn : styles.dangerBtn}
                  onClick={handleBanToggle}
                >
                  {isBanned ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                  <span>{isBanned ? "Unban" : "Ban"}</span>
                </button>
              )}
              <button type="button" className={styles.dangerBtn} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          )}
        </section>

        <section className={styles.detailMetaGrid}>
          <div className={styles.metaBox}>
            <span className={styles.metaLabel}>Sign-in Method</span>
            <span className={styles.metaVal}>{p.signInMethod}</span>
          </div>
          <div className={styles.metaBox}>
            <span className={styles.metaLabel}>Email Verified</span>
            <span className={styles.metaVal}>{isUser ? (p.emailVerified ? "Verified" : "Unverified") : "N/A"}</span>
          </div>
          <div className={styles.metaBox}>
            <span className={styles.metaLabel}>Country</span>
            <span className={styles.metaVal}>{p.country || "Unknown"}</span>
          </div>
          <div className={styles.metaBox}>
            <span className={styles.metaLabel}>{isUser ? "Created" : "First Seen"}</span>
            <span className={styles.metaVal}>{formatDateTime(p.createdAt)}</span>
          </div>
          <div className={styles.metaBox}>
            <span className={styles.metaLabel}>Last Active</span>
            <span className={styles.metaVal}>{formatDateTime(p.lastActiveAt)}</span>
          </div>
          {personData.linkedUserId && (
            <div className={styles.metaBox}>
              <span className={styles.metaLabel}>Linked Account</span>
              <Link href={`/admin/users/${personData.linkedUserId}`} className={styles.mediaTitle}>
                View User Account
              </Link>
            </div>
          )}
          {details.userAgent && (
            <div className={styles.metaBox}>
              <span className={styles.metaLabel}>Device / User Agent</span>
              <span className={styles.metaVal}>{details.userAgent}</span>
            </div>
          )}
        </section>

        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>
              <Film size={14} /> Titles Watched
            </span>
            <span className={styles.kpiValue}>{historyData.stats?.totalTitles ?? 0}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>
              <Clock size={14} /> Estimated Hours
            </span>
            <span className={styles.kpiValue}>{historyData.stats?.totalHours ?? 0}h</span>
          </div>
          {isUser && (
            <>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Watchlist Items</span>
                <span className={styles.kpiValue}>{details.watchlist?.length ?? 0}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Custom Lists</span>
                <span className={styles.kpiValue}>{details.customLists?.length ?? 0}</span>
              </div>
            </>
          )}
        </section>

        {isUser && (
          <div className={styles.tabRow} role="tablist">
            {[
              { id: "history", label: `Watch History (${historyData.stats?.totalEntries ?? 0})` },
              { id: "watchlist", label: `Watchlist (${details.watchlist?.length ?? 0})` },
              { id: "lists", label: `Custom Lists (${details.customLists?.length ?? 0})` },
              { id: "profiles", label: `Profiles (${details.profiles?.length ?? 0})` },
              { id: "accounts", label: `Accounts (${details.accounts?.length ?? 0})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`${styles.navTab} ${activeTab === t.id ? styles.navTabActive : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === "history" && (
          <section className={styles.panelPadded}>
            <div className={styles.toolbar}>
              <div className={styles.pillSwitch}>
                {[
                  { id: "all", label: "All" },
                  { id: "movie", label: "Movies" },
                  { id: "series", label: "Series" },
                  { id: "anime", label: "Anime" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${styles.pillOption} ${typeFilter === opt.id ? styles.pillOptionActive : ""}`}
                    onClick={() => {
                      setTypeFilter(opt.id);
                      setPage(1);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <select
                aria-label="Date range filter"
                className={styles.selectInput}
                value={dateRange}
                onChange={(e) => {
                  setDateRange(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All time</option>
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>

              <div className={styles.searchWrap}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Filter watched titles…"
                  aria-label="Filter watched titles"
                  value={searchQ}
                  onChange={(e) => {
                    setSearchQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {historyData.items.length === 0 ? (
              <p className={styles.emptyCell}>No watch history entries match the current filters.</p>
            ) : (
              <div className={styles.mediaList}>
                {historyData.items.map((item) => {
                  const pct = Math.round((item.progress || 0) * 100);
                  return (
                    <div key={item.id} className={styles.mediaRow}>
                      <div className={styles.mediaLeft}>
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
                          <div className={styles.mediaMeta}>
                            <span className={`${styles.badge} ${styles.badgeUser}`}>{item.type}</span>
                            {item.season > 0 && (
                              <span>
                                S{String(item.season).padStart(2, "0")} E{String(item.episode).padStart(2, "0")}
                              </span>
                            )}
                            <span>{formatDateTime(item.watchedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.historyRight}>
                        <span className={styles.personMeta}>{pct}% watched</span>
                        <progress className={`${styles.progressTrack} ${styles.miniProgress}`} max={100} value={pct} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {historyData.totalPages > 1 && (
              <div className={styles.paginationBar}>
                <span>
                  Page {historyData.page} of {historyData.totalPages} ({historyData.total} entries)
                </span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.glassBtn}
                    disabled={historyData.page <= 1}
                    onClick={() => setPage((pNo) => Math.max(1, pNo - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={styles.glassBtn}
                    disabled={historyData.page >= historyData.totalPages}
                    onClick={() => setPage((pNo) => Math.min(historyData.totalPages, pNo + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "watchlist" && isUser && (
          <section className={styles.panelPadded}>
            {details.watchlist?.length ? (
              <div className={styles.mediaList}>
                {details.watchlist.map((w) => (
                  <div key={w.id} className={styles.mediaRow}>
                    <div className={styles.mediaLeft}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={w.titleData?.poster || "/brand/divine-logo-autumn-on-dark.svg"}
                        alt=""
                        className={styles.posterThumb}
                      />
                      <div className={styles.mediaInfo}>
                        <Link href={`/title/${w.titleId}`} className={styles.mediaTitle}>
                          {w.titleData?.title || w.titleData?.name || w.titleId}
                        </Link>
                        <span className={styles.mediaMeta}>Added {formatDateTime(w.addedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCell}>Watchlist is empty.</p>
            )}
          </section>
        )}

        {activeTab === "lists" && isUser && (
          <section className={styles.panelPadded}>
            {details.customLists?.length ? (
              <div className={styles.mediaList}>
                {details.customLists.map((l) => (
                  <div key={l.id} className={styles.mediaRow}>
                    <div className={styles.mediaInfo}>
                      <span className={styles.mediaTitle}>{l.name}</span>
                      <span className={styles.mediaMeta}>
                        {l._count?.items ?? 0} titles · {l.isPublic ? "Public" : "Private"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCell}>No custom lists created.</p>
            )}
          </section>
        )}

        {activeTab === "profiles" && isUser && (
          <section className={styles.panelPadded}>
            {details.profiles?.length ? (
              <div className={styles.mediaList}>
                {details.profiles.map((prof) => (
                  <div key={prof.id} className={styles.mediaRow}>
                    <div className={styles.mediaLeft}>
                      <div className={styles.avatarCircle}>
                        {prof.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prof.avatar} alt="" className={styles.avatarImg} />
                        ) : (
                          prof.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className={styles.mediaInfo}>
                        <span className={styles.mediaTitle}>{prof.name}</span>
                        <span className={styles.mediaMeta}>{prof.isKids ? "Kids profile" : "Standard profile"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyCell}>No additional profiles.</p>
            )}
          </section>
        )}

        {activeTab === "accounts" && isUser && (
          <section className={styles.panelPadded}>
            <div className={styles.mediaList}>
              {(details.accounts || []).map((acc) => (
                <div key={acc.id} className={styles.mediaRow}>
                  <span className={styles.mediaTitle}>{acc.provider}</span>
                  <span className={styles.badge + " " + styles.badgeUser}>{acc.type}</span>
                </div>
              ))}
              {(details.linkedGuests || []).map((g) => (
                <div key={g.id} className={styles.mediaRow}>
                  <div className={styles.mediaInfo}>
                    <span className={styles.mediaTitle}>Linked Guest #{g.id.slice(-4).toUpperCase()}</span>
                    <span className={styles.mediaMeta}>
                      {g.country || "Unknown country"} · Last seen {formatDateTime(g.lastSeenAt)}
                    </span>
                  </div>
                </div>
              ))}
              {!details.accounts?.length && !details.linkedGuests?.length && (
                <p className={styles.emptyCell}>No linked OAuth or guest sessions.</p>
              )}
            </div>
          </section>
        )}

        {confirmDelete && (
          <div className={styles.modalBackdrop} onClick={() => setConfirmDelete(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-person-title"
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 id="delete-person-title" className={styles.modalTitle}>Delete {p.displayName}?</h3>
                <button type="button" className={styles.modalClose} aria-label="Close" onClick={() => setConfirmDelete(false)}>
                  ✕
                </button>
              </div>
              <p className={styles.modalBody}>
                This permanently removes {p.displayName} and all associated watch history records from the database.
              </p>
              <div className={styles.modalActions}>
                <button type="button" className={styles.glassBtn} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button type="button" className={styles.dangerBtn} onClick={handleDelete}>
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </Layout>
  );
}

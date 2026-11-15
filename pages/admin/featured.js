import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getAdminPageProps } from "../../lib/session";
import Layout from "../../components/Layout";
import LoadingScreen from "../../components/LoadingScreen";
import AdminNav from "../../components/AdminNav";
import AdminAccessGate from "../../components/AdminAccessGate";
import { useToast } from "../../lib/useToast";
import {
  Sparkles,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
} from "lucide-react";
import styles from "../../styles/Admin.module.css";

export async function getServerSideProps(context) {
  const access = await getAdminPageProps(context);
  const role = access.currentRole;
  if (!access.authorized || role !== "ADMIN") {
    return { props: { ...access, authorized: false } };
  }
  return { props: access };
}

export default function AdminFeaturedPage({
  authorized = false,
  dbConfigured = true,
  signedInEmail = null,
  currentRole = null,
  emailVerified = false,
}) {
  const { data: session, status } = useSession();
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(Boolean(authorized));
  const [toast, showToast] = useToast(2500);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchFeatured = async () => {
    try {
      const res = await fetch("/api/admin/featured");
      if (res.ok) {
        const data = await res.json();
        setFeatured(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (authorized && status === "authenticated" && session?.user?.role === "ADMIN") {
      fetchFeatured();
    } else if (status !== "loading") {
      setLoading(false);
    }
  }, [authorized, status, session]);

  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowAddModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAddModal]);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data.slice(0, 8) : []);
        }
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddTitle = async (title) => {
    try {
      const res = await fetch("/api/admin/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          titleId: title.id,
          titleData: {
            id: title.id,
            title: title.title || title.name,
            poster: title.poster,
            backdrop: title.backdrop,
            synopsis: title.synopsis || title.overview,
            year: title.year,
            rating: title.rating,
            type: title.type || "movie",
          },
        }),
      });
      if (res.ok) {
        showToast(`Added "${title.title || title.name}" to featured`);
        setShowAddModal(false);
        setSearchQuery("");
        setSearchResults([]);
        fetchFeatured();
      } else {
        const d = await res.json();
        showToast(d.error || "Failed to add featured title");
      }
    } catch {
      showToast("Network error adding featured title");
    }
  };

  const handleToggleActive = async (item) => {
    try {
      const res = await fetch("/api/admin/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-active", id: item.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        showToast(updated.active ? "Title visible on Hero Banner" : "Title hidden from Hero Banner");
        fetchFeatured();
      }
    } catch {
      showToast("Error toggling active state");
    }
  };

  const handleDelete = async (item) => {
    try {
      const res = await fetch("/api/admin/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: item.id }),
      });
      if (res.ok) {
        showToast("Removed from featured titles");
        fetchFeatured();
      }
    } catch {
      showToast("Error deleting title");
    }
  };

  if (authorized && (status === "loading" || loading)) {
    return (
      <Layout title="Admin · Featured Titles">
        <LoadingScreen minHeight="60vh" message="Loading admin dashboard…" />
      </Layout>
    );
  }

  const isAdmin = authorized && currentRole === "ADMIN" && status === "authenticated" && session?.user?.role === "ADMIN";

  if (!isAdmin) {
    return (
      <AdminAccessGate
        dbConfigured={dbConfigured}
        signedInEmail={session?.user?.email || signedInEmail}
        currentRole={session?.user?.role || currentRole}
        emailVerified={Boolean(session?.user?.emailVerified || emailVerified)}
        callbackUrl="/admin/featured"
      />
    );
  }

  return (
    <Layout title="Admin · Featured Titles">
      <div className={styles.page}>
        <AdminNav activeTab="featured" />

        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.pageTitle}>Hero Banner Titles ({featured.length})</h2>
            <p className={styles.pageSub}>
              Customize and order the titles displayed in the homepage hero carousel
            </p>
          </div>

          <button type="button" onClick={() => setShowAddModal(true)} className={styles.primaryBtn}>
            <Plus size={16} strokeWidth={2.5} />
            <span>Add Featured Title</span>
          </button>
        </div>

        {featured.length === 0 ? (
          <div className={styles.panelPadded}>
            <div className={styles.emptyCell}>
              <Sparkles size={32} />
              <p>No custom featured titles set. Homepage displays automated trending titles.</p>
            </div>
          </div>
        ) : (
          <div className={styles.mediaList}>
            {featured.map((item, index) => {
              const data = item.titleData || {};
              const titleName = data.title || data.name || item.titleId;
              return (
                <div key={item.id} className={styles.mediaRow}>
                  <div className={styles.mediaLeft}>
                    <span className={styles.rankTag}>#{index + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.poster || data.backdrop || "/brand/divine-logo-autumn-on-dark.svg"}
                      alt=""
                      className={styles.posterThumb}
                    />
                    <div className={styles.mediaInfo}>
                      <div className={styles.actionsGroup}>
                        <span className={styles.mediaTitle}>{titleName}</span>
                        <span className={`${styles.badge} ${styles.badgeUser}`}>{data.type || "title"}</span>
                      </div>
                      <span className={styles.mediaMeta}>
                        {data.year ? `${data.year} · ` : ""}
                        {data.rating ? `★ ${data.rating} · ` : ""}
                        ID: {item.titleId}
                      </span>
                    </div>
                  </div>

                  <div className={styles.actionsGroup}>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={item.active ? styles.successBtn : styles.smallGlassBtn}
                      title={item.active ? "Currently displayed on banner" : "Hidden from banner"}
                    >
                      {item.active ? <Eye size={13} /> : <EyeOff size={13} />}
                      <span>{item.active ? "Active" : "Hidden"}</span>
                    </button>

                    <Link
                      href={`/title/${item.titleId}`}
                      target="_blank"
                      className={styles.smallGlassBtn}
                      title="View title page"
                    >
                      <ExternalLink size={14} />
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className={styles.dangerBtn}
                      title="Delete from featured"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showAddModal && (
          <div className={styles.modalBackdrop} onClick={() => setShowAddModal(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-featured-title"
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 id="add-featured-title" className={styles.modalTitle}>Add Featured Title</h3>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setShowAddModal(false)}
                  className={styles.modalClose}
                >
                  ✕
                </button>
              </div>

              <div className={styles.searchWrap}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search TMDB for a movie, series, or anime…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className={styles.searchInput}
                />
              </div>

              {searching && <p className={styles.modalBody}>Searching TMDB…</p>}

              <div className={styles.modalResults}>
                {searchResults.map((t) => (
                  <div key={t.id} className={styles.mediaRow}>
                    <div className={styles.mediaLeft}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.poster || t.backdrop || "/brand/divine-logo-autumn-on-dark.svg"}
                        alt=""
                        className={styles.posterThumb}
                      />
                      <div className={styles.mediaInfo}>
                        <span className={styles.mediaTitle}>{t.title || t.name}</span>
                        <span className={styles.mediaMeta}>
                          {t.year || t.releaseDate?.slice(0, 4)} · {t.type}
                        </span>
                      </div>
                    </div>

                    <button type="button" onClick={() => handleAddTitle(t)} className={styles.primaryBtn}>
                      Pin
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </Layout>
  );
}

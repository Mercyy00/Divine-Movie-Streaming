import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getAdminPageProps } from "../../lib/session";
import Layout from "../../components/Layout";
import LoadingScreen from "../../components/LoadingScreen";
import AdminNav from "../../components/AdminNav";
import AdminAccessGate from "../../components/AdminAccessGate";
import { useToast } from "../../lib/useToast";
import {
  Users,
  UserCheck,
  Ghost,
  Activity,
  Calendar,
  Search,
  Download,
  ShieldCheck,
  Ban,
  CheckCircle2,
  Trash2,
  Eye,
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

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminUsersPage({
  authorized = false,
  dbConfigured = true,
  signedInEmail = null,
  currentRole = null,
  emailVerified = false,
}) {
  const { data: session, status: authStatus } = useSession();
  const [data, setData] = useState({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    summary: { totalPeople: 0, signedInUsers: 0, guests: 0, active24h: 0, active7d: 0, newThisWeek: 0 },
  });
  const [loading, setLoading] = useState(Boolean(authorized));
  const [toast, showToast] = useToast(2500);

  // Filters & pagination
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [sortBy, setSortBy] = useState("lastActive");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchPeople = useCallback(async () => {
    if (!authorized) return;
    try {
      const params = new URLSearchParams({
        q: search,
        type: typeFilter,
        method: methodFilter,
        status: statusFilter,
        dateRange,
        sort: sortBy,
        order: "desc",
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/admin/people?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {}
    setLoading(false);
  }, [authorized, search, typeFilter, methodFilter, statusFilter, dateRange, sortBy, page, pageSize]);

  useEffect(() => {
    if (authorized && authStatus === "authenticated" && session?.user?.role === "ADMIN") {
      fetchPeople();
    } else if (authStatus !== "loading") {
      setLoading(false);
    }
  }, [authorized, authStatus, session, fetchPeople]);

  const handleToggleBan = async (person) => {
    const isBanned = person.status === "banned";
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(person.id)}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: !isBanned }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(isBanned ? `Unbanned ${person.displayName}` : `Banned ${person.displayName}`);
        fetchPeople();
      } else {
        showToast(d.error || "Failed to update ban status");
      }
    } catch {
      showToast("Network error");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(
        `/api/admin/people/${encodeURIComponent(deleteTarget.id)}?kind=${deleteTarget.entityType}`,
        { method: "DELETE" }
      );
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Deleted ${deleteTarget.displayName}`);
        setDeleteTarget(null);
        fetchPeople();
      } else {
        showToast(d.error || "Could not delete person");
      }
    } catch {
      showToast("Network error");
    }
  };

  const exportUrl = `/api/admin/export?${new URLSearchParams({
    q: search,
    type: typeFilter,
    method: methodFilter,
    status: statusFilter,
    dateRange,
    sort: sortBy,
    order: "desc",
  }).toString()}`;

  if (authorized && (authStatus === "loading" || loading)) {
    return (
      <Layout title="Admin · People">
        <LoadingScreen minHeight="60vh" message="Loading people directory…" />
      </Layout>
    );
  }

  const isAdmin = authorized && currentRole === "ADMIN" && authStatus === "authenticated" && session?.user?.role === "ADMIN";

  if (!isAdmin) {
    return (
      <AdminAccessGate
        dbConfigured={dbConfigured}
        signedInEmail={session?.user?.email || signedInEmail}
        currentRole={session?.user?.role || currentRole}
        emailVerified={Boolean(session?.user?.emailVerified || emailVerified)}
        callbackUrl="/admin/users"
      />
    );
  }

  const summary = data.summary || {};

  return (
    <Layout title="Admin · People">
      <div className={styles.page}>
        <AdminNav activeTab="users" />

        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.pageTitle}>People Directory</h2>
            <p className={styles.pageSub}>
              Unified list of signed-in users and browser guests. Click any person to view their watch history.
            </p>
          </div>
          <a href={exportUrl} className={styles.glassBtn}>
            <Download size={15} />
            <span>Export CSV</span>
          </a>
        </div>

        {/* Summary KPI Cards */}
        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Users size={14} /> Total People</span>
            <span className={styles.kpiValue}>{summary.totalPeople ?? 0}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><UserCheck size={14} /> Signed-in Users</span>
            <span className={styles.kpiValue}>{summary.signedInUsers ?? 0}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Ghost size={14} /> Guests</span>
            <span className={styles.kpiValue}>{summary.guests ?? 0}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Activity size={14} /> Active 24h</span>
            <span className={styles.kpiValue}>{summary.active24h ?? 0}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Activity size={14} /> Active 7d</span>
            <span className={styles.kpiValue}>{summary.active7d ?? 0}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}><Calendar size={14} /> New This Week</span>
            <span className={styles.kpiValue}>{summary.newThisWeek ?? 0}</span>
          </div>
        </section>

        {/* Filters & Search Toolbar */}
        <section className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search name, email, username, country, guest ID…"
              aria-label="Search people"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            aria-label="Filter by type"
            className={styles.selectInput}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            <option value="user">Users</option>
            <option value="guest">Guests</option>
            <option value="admin">Admin</option>
          </select>

          <select
            aria-label="Filter by sign-in method"
            className={styles.selectInput}
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All methods</option>
            <option value="google">Google</option>
            <option value="email">Email</option>
            <option value="guest">Guest</option>
          </select>

          <select
            aria-label="Filter by status"
            className={styles.selectInput}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
          </select>

          <select
            aria-label="Filter by date range"
            className={styles.selectInput}
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All time</option>
            <option value="24h">Active 24h</option>
            <option value="7d">Active 7d</option>
            <option value="30d">Active 30d</option>
          </select>

          <select
            aria-label="Sort people"
            className={styles.selectInput}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
          >
            <option value="lastActive">Sort: Last active</option>
            <option value="created">Sort: Created / First seen</option>
            <option value="titlesWatched">Sort: Titles watched</option>
          </select>
        </section>

        {/* People Table */}
        <section className={styles.panel}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th>Method</th>
                  <th>Country</th>
                  <th>First seen / Joined</th>
                  <th>Last active</th>
                  <th>Watched</th>
                  <th>Status</th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length > 0 ? (
                  data.items.map((p) => {
                    const isBanned = p.status === "banned";
                    const detailHref = p.entityType === "guest" ? `/admin/guests/${p.id}` : `/admin/users/${p.id}`;

                    return (
                      <tr
                        key={`${p.entityType}:${p.id}`}
                        className={`${styles.tableRow} ${isBanned ? styles.tableRowBanned : ""}`}
                      >
                        <td>
                          <Link href={detailHref} className={styles.personLink}>
                            <div className={styles.avatarCircle}>
                              {p.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.image} alt="" className={styles.avatarImg} />
                              ) : p.entityType === "guest" ? (
                                <Ghost size={15} />
                              ) : (
                                p.displayName.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className={styles.personName}>{p.displayName}</div>
                              <div className={styles.personMeta}>
                                {p.username ? `@${p.username}` : p.entityType === "guest" ? "Browser guest" : p.id.slice(0, 8)}
                              </div>
                            </div>
                          </Link>
                        </td>

                        <td>
                          <span
                            className={`${styles.badge} ${
                              p.personType === "admin"
                                ? styles.badgeAdmin
                                : p.personType === "guest"
                                ? styles.badgeGuest
                                : styles.badgeUser
                            }`}
                          >
                            {p.personType === "admin" && <ShieldCheck size={11} />}
                            {p.personType === "admin" ? "Admin" : p.personType === "guest" ? "Guest" : "User"}
                          </span>
                        </td>

                        <td>{p.email || "—"}</td>
                        <td>{p.signInMethod}</td>
                        <td>{p.country || "—"}</td>
                        <td>{formatDate(p.createdAt)}</td>
                        <td>{formatDate(p.lastActiveAt)}</td>
                        <td>{p.titlesWatched}</td>

                        <td>
                          <span className={`${styles.badge} ${isBanned ? styles.badgeBanned : styles.badgeActive}`}>
                            {isBanned ? "Banned" : "Active"}
                          </span>
                        </td>

                        <td className={styles.alignRight}>
                          <div className={styles.actionsGroup}>
                            <Link href={detailHref} className={styles.smallGlassBtn} title="View watch history">
                              <Eye size={13} />
                              <span>History</span>
                            </Link>

                            {!p.isAdmin && p.entityType === "user" && (
                              <button
                                type="button"
                                className={isBanned ? styles.successBtn : styles.dangerBtn}
                                onClick={() => handleToggleBan(p)}
                              >
                                {isBanned ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                                <span>{isBanned ? "Unban" : "Ban"}</span>
                              </button>
                            )}

                            {!p.isAdmin && (
                              <button
                                type="button"
                                className={styles.dangerBtn}
                                aria-label={`Delete ${p.displayName}`}
                                onClick={() => setDeleteTarget(p)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className={styles.emptyCell}>
                      No users or guests match your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.paginationBar}>
            <span>
              Showing {data.items.length} of {data.total} people (Page {data.page} of {data.totalPages})
            </span>

            <div className={styles.paginationControls}>
              <select
                aria-label="Rows per page"
                className={styles.selectInput}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>

              <button
                type="button"
                className={styles.glassBtn}
                disabled={data.page <= 1}
                onClick={() => setPage((pNo) => Math.max(1, pNo - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className={styles.glassBtn}
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((pNo) => Math.min(data.totalPages, pNo + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {deleteTarget && (
          <div className={styles.modalBackdrop} onClick={() => setDeleteTarget(null)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-delete-person"
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 id="confirm-delete-person" className={styles.modalTitle}>
                  Delete {deleteTarget.displayName}?
                </h3>
                <button type="button" className={styles.modalClose} aria-label="Close" onClick={() => setDeleteTarget(null)}>
                  ✕
                </button>
              </div>
              <p className={styles.modalBody}>
                This permanently deletes this {deleteTarget.entityType} and all associated watch history. This cannot be undone.
              </p>
              <div className={styles.modalActions}>
                <button type="button" className={styles.glassBtn} onClick={() => setDeleteTarget(null)}>
                  Cancel
                </button>
                <button type="button" className={styles.dangerBtn} onClick={handleConfirmDelete}>
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

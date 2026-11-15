import { useSession } from "next-auth/react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { useState, useEffect } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import LoadingScreen from "../../components/LoadingScreen";
import AdminNav from "../../components/AdminNav";
import { useToast } from "../../lib/useToast";
import { Shield, ShieldAlert, UserX, UserCheck, ShieldCheck, ArrowLeft, Search } from "lucide-react";

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session || session.user?.role !== "ADMIN") {
    context.res.statusCode = 403;
    return {
      props: {
        authorized: false,
        signedInEmail: session?.user?.email || null,
        currentRole: session?.user?.role || null,
      },
    };
  }
  return { props: { authorized: true } };
}

export default function AdminUsersPage({ authorized = false, signedInEmail = null, currentRole = null }) {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(Boolean(authorized));
  const [search, setSearch] = useState("");
  const [toast, showToast] = useToast(2500);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (authorized && status === "authenticated" && session?.user?.role === "ADMIN") {
      fetchUsers();
    } else if (status !== "loading") {
      setLoading(false);
    }
  }, [authorized, status, session]);

  const handleToggleRole = async (user) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-role", userId: user.id }),
      });
      const d = await res.json();
      if (res.ok) {
        showToast(`Role updated to ${d.role}`);
        fetchUsers();
      } else {
        showToast(d.error || "Failed to update role");
      }
    } catch {
      showToast("Network error updating role");
    }
  };

  const handleToggleBan = async (user) => {
    const isBanned = Boolean(user.bannedAt);
    const action = isBanned ? "unban" : "ban";
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: user.id }),
      });
      const d = await res.json();
      if (res.ok) {
        showToast(isBanned ? `Unbanned @${user.username || user.name}` : `Banned @${user.username || user.name}`);
        fetchUsers();
      } else {
        showToast(d.error || "Failed to update ban status");
      }
    } catch {
      showToast("Network error");
    }
  };

  if (authorized && (status === "loading" || loading)) {
    return (
      <Layout title="Admin · Users">
        <LoadingScreen minHeight="60vh" message="Loading administration dashboard…" />
      </Layout>
    );
  }

  const isAdmin = authorized && status === "authenticated" && session?.user?.role === "ADMIN";
  const activeEmail = session?.user?.email || signedInEmail;
  const activeRole = session?.user?.role || currentRole;

  if (!isAdmin) {
    return (
      <Layout title="Admin · Access Required">
        <div
          style={{
            maxWidth: 500,
            margin: "96px auto",
            textAlign: "center",
            padding: "32px 28px",
            borderRadius: 20,
            background: "var(--g-fill, rgba(255,255,255,0.06))",
            border: "1px solid var(--g-edge, rgba(255,255,255,0.14))",
            backdropFilter: "var(--g-blur, blur(24px))",
          }}
        >
          <ShieldAlert size={44} color="var(--amber, #FFC84A)" style={{ margin: "0 auto 14px" }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>Administrator Access Required</h1>
          {activeEmail ? (
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.55, margin: "0 0 22px" }}>
              Signed in as <strong>{activeEmail}</strong> (Role: <code>{activeRole || "USER"}</code>).
              {" "}To grant administrator access, add this email to <code>ADMIN_EMAILS</code> in your environment or ask an existing admin to promote your account.
            </p>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.55, margin: "0 0 22px" }}>
              Sign in with an administrator account to manage users and roles. Set <code>ADMIN_EMAILS</code> in your server environment to designate admin accounts.
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
            {!activeEmail && (
              <Link
                href="/auth/signin?callbackUrl=/admin/users"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 38,
                  padding: "0 20px",
                  borderRadius: 999,
                  background: "#ffffff",
                  color: "var(--on-accent, #0A0807)",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                Sign in
              </Link>
            )}
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 38,
                padding: "0 18px",
                borderRadius: 999,
                background: "var(--g-fill, rgba(255,255,255,0.08))",
                border: "1px solid var(--g-edge, rgba(255,255,255,0.16))",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={15} />
              <span>Return Home</span>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  return (
    <Layout title="Admin · User Management">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px var(--page-pad) 80px" }}>
        <AdminNav activeTab="users" />

        {/* Top Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={24} color="var(--accent, #FF8A2B)" />
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>User Administration</h1>
            </div>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: "6px 0 0" }}>
              Manage accounts, roles, and access controls across the platform.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)" }} />
              <input
                type="text"
                placeholder="Search user, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: "var(--surface-2, #17110E)",
                  border: "1px solid var(--hairline, rgba(255, 214, 170, 0.12))",
                  borderRadius: 8,
                  padding: "8px 14px 8px 34px",
                  fontSize: 13,
                  color: "#fff",
                  outline: "none",
                  width: 220,
                }}
              />
            </div>
          </div>
        </div>

        {/* User Table */}
        <div
          style={{
            background: "var(--surface-1, #100C0A)",
            border: "1px solid var(--hairline, rgba(255, 214, 170, 0.10))",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.6)" }}>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>User</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Email</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Role</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Joined</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const isBanned = Boolean(u.bannedAt);
                    const isAdmin = u.role === "ADMIN";
                    const isSelf = u.id === session.user.id;
                    const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

                    return (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          opacity: isBanned ? 0.6 : 1,
                        }}
                      >
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: "var(--surface-3, #1F1712)",
                                overflow: "hidden",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {u.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                (u.name || u.username || "U").charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: "#fff" }}>{u.name || "Unnamed"}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>@{u.username || "user"}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "14px 18px", color: "rgba(255,255,255,0.7)" }}>
                          {u.email || "—"}
                        </td>

                        <td style={{ padding: "14px 18px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isAdmin ? "var(--accent-soft, rgba(255, 138, 43, 0.16))" : "rgba(255, 235, 210, 0.06)",
                              color: isAdmin ? "var(--accent, #FF8A2B)" : "var(--text-dim, rgba(255, 240, 224, 0.8))",
                            }}
                          >
                            {isAdmin && <ShieldCheck size={12} />}
                            {u.role}
                          </span>
                        </td>

                        <td style={{ padding: "14px 18px", color: "rgba(255,255,255,0.5)" }}>
                          {dateStr}
                        </td>

                        <td style={{ padding: "14px 18px" }}>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isBanned ? "var(--danger-soft, rgba(255, 90, 77, 0.14))" : "var(--success-soft, rgba(91, 185, 140, 0.14))",
                              color: isBanned ? "var(--danger-lift, #FF7B70)" : "var(--success, #5BB98C)",
                            }}
                          >
                            {isBanned ? "Banned" : "Active"}
                          </span>
                        </td>

                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleToggleRole(u)}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  background: "var(--surface-2, #17110E)",
                                  border: "1px solid var(--hairline, rgba(255, 214, 170, 0.10))",
                                  color: "#fff",
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                {isAdmin ? "Demote" : "Make Admin"}
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleToggleBan(u)}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                  background: isBanned ? "var(--success-soft, rgba(91, 185, 140, 0.14))" : "var(--danger-soft, rgba(255, 90, 77, 0.14))",
                                  border: "1px solid " + (isBanned ? "rgba(91, 185, 140, 0.3)" : "rgba(255, 90, 77, 0.3)"),
                                  color: isBanned ? "var(--success, #5BB98C)" : "var(--danger-lift, #FF7B70)",
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                {isBanned ? "Unban" : "Ban"}
                              </button>
                            )}

                            {isSelf && (
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
                                (Your account)
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
                      No users match your search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--surface-3, #1F1712)", color: "var(--text, #FFF6EC)", padding: "10px 18px", borderRadius: 8, border: "1px solid var(--hairline-strong, rgba(255, 214, 170, 0.18))", fontSize: 13, zIndex: 9999 }}>{toast}</div>}
    </Layout>
  );
}

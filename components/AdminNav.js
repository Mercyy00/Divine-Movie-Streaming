import Link from "next/link";
import { useRouter } from "next/router";
import { Users, Sparkles, ArrowLeft, Shield } from "lucide-react";

export default function AdminNav({ activeTab = "users" }) {
  const router = useRouter();

  const tabs = [
    { id: "users", label: "Users & Roles", href: "/admin/users", Icon: Users },
    { id: "featured", label: "Featured Titles", href: "/admin/featured", Icon: Sparkles },
  ];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        paddingBottom: 20,
        marginBottom: 24,
        borderBottom: "1px solid var(--hairline, rgba(255, 214, 170, 0.10))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "var(--accent-soft, rgba(255, 138, 43, 0.16))",
            border: "1px solid rgba(var(--accent-rgb, 255, 138, 43), 0.32)",
            display: "grid",
            placeItems: "center",
            color: "var(--role-admin, #FFC84A)",
          }}
        >
          <Shield size={20} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.01em", color: "var(--text, #FFF6EC)" }}>
            Admin Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint, rgba(255, 240, 224, 0.50))" }}>
            Control user permissions, moderation, and homepage featured titles
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {tabs.map((tab) => {
          const isActive = router.pathname === tab.href || activeTab === tab.id;
          const { Icon, label, href } = tab;
          return (
            <Link
              key={tab.id}
              href={href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                transition: "all 0.15s ease",
                background: isActive ? "rgba(255, 235, 210, 0.12)" : "rgba(255, 235, 210, 0.04)",
                color: isActive ? "var(--text, #FFF6EC)" : "var(--text-dim, rgba(255, 240, 224, 0.65))",
                border: isActive
                  ? "1px solid var(--hairline-strong, rgba(255, 214, 170, 0.25))"
                  : "1px solid var(--hairline, rgba(255, 214, 170, 0.10))",
              }}
            >
              <Icon size={15} style={{ color: isActive ? "var(--accent, #FF8A2B)" : "inherit" }} />
              <span>{label}</span>
            </Link>
          );
        })}

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--text-faint, rgba(255, 240, 224, 0.50))",
            textDecoration: "none",
            marginLeft: 6,
          }}
          title="Return to site"
        >
          <ArrowLeft size={14} />
          <span>Site</span>
        </Link>
      </div>
    </div>
  );
}

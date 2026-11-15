import Link from "next/link";
import { useRouter } from "next/router";
import { BarChart3, Users, Sparkles, ArrowLeft, Shield, Lock } from "lucide-react";
import styles from "../styles/Admin.module.css";

export default function AdminNav({ activeTab = "overview" }) {
  const router = useRouter();

  const tabs = [
    { id: "overview", label: "Dashboard", href: "/admin", Icon: BarChart3 },
    { id: "users", label: "People", href: "/admin/users", Icon: Users },
    { id: "featured", label: "Featured Titles", href: "/admin/featured", Icon: Sparkles },
  ];

  return (
    <header className={styles.navBar}>
      <div className={styles.brandCluster}>
        <div className={styles.shieldBadge} aria-hidden="true">
          <Shield size={20} />
        </div>
        <div>
          <h1 className={styles.navTitle}>Admin Console</h1>
          <div className={styles.navSubRow}>
            <p className={styles.navSub}>Users, guests, watch history &amp; curation</p>
            <span className={styles.auditNotice}>
              <Lock size={12} />
              <span>Personal data. Access is logged.</span>
            </span>
          </div>
        </div>
      </div>

      <nav className={styles.navTabs} aria-label="Admin sections">
        {tabs.map((tab) => {
          const isActive = router.pathname === tab.href || activeTab === tab.id;
          const { Icon, label, href } = tab;
          return (
            <Link
              key={tab.id}
              href={href}
              className={`${styles.navTab} ${isActive ? styles.navTabActive : ""}`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </Link>
          );
        })}

        <Link href="/" className={styles.siteLink} title="Return to site">
          <ArrowLeft size={14} />
          <span>Site</span>
        </Link>
      </nav>
    </header>
  );
}

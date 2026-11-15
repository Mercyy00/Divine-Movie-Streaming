import { certVar } from "../lib/constants";
import styles from "./Meta.module.css";

export function RatingRing({ value, size = 38 }) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const strokeWidth = size > 45 ? 3 : 2.5;
  const r = size / 2 - strokeWidth;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, num / 10);
  const color = num >= 7 ? "var(--ok)" : num >= 5 ? "var(--warn)" : "var(--danger)";
  return (
    <span className={styles.ring} style={{ width: size, height: size }} aria-label={`Rating ${num.toFixed(1)} out of 10`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b style={{ fontSize: size <= 42 ? 13 : size * 0.27 }}>{num.toFixed(1)}</b>
    </span>
  );
}

export function CertBadge({ cert, small }) {
  const clean = cert != null ? String(cert).trim() : "";
  if (!clean) return null;
  const dark = clean.toUpperCase() === "PG";
  return (
    <span
      className={`${styles.cert} ${small ? styles.certSmall : ""}`}
      style={{ background: certVar(clean), color: dark ? "var(--cert-ink-dark)" : "var(--cert-ink)" }}
    >
      {clean}
    </span>
  );
}

export function Dot() {
  return <span className={styles.dot} aria-hidden="true" />;
}

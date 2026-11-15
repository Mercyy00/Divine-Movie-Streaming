import { certVar } from "../lib/constants";
import styles from "./Meta.module.css";

export function RatingRing({ value, size = 38 }) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const strokeWidth = size > 45 ? 3 : 2.5;
  const r = size / 2 - strokeWidth;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, num / 10);
  const color = "rgba(255, 255, 255, 0.9)";
  return (
    <span className={styles.ring} style={{ width: size, height: size }} aria-label={`Rating ${num.toFixed(1)} out of 10`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.16)" strokeWidth={strokeWidth} />
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
      <b style={{ fontSize: size <= 42 ? 12 : Math.round(size * 0.27) }}>{num.toFixed(1)}</b>
    </span>
  );
}

export function CertBadge({ cert, small }) {
  const clean = cert != null ? String(cert).trim() : "";
  if (!clean) return null;
  return (
    <span
      className={`${styles.cert} ${small ? styles.certSmall : ""}`}
      data-cert-tone={certVar(clean)}
    >
      {clean}
    </span>
  );
}

export function Dot() {
  return <span className={styles.dot} aria-hidden="true" />;
}

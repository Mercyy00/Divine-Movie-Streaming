import styles from "./LoadingScreen.module.css";

export default function LoadingScreen({
  message = "",
  fullScreen = false,
  minHeight = "60vh",
  size = "md",
  className = "",
}) {
  return (
    <div
      className={`${styles.container} ${fullScreen ? styles.fullScreen : ""} ${className}`}
      style={!fullScreen ? { minHeight } : undefined}
      role="status"
      aria-live="polite"
    >
      <div className={`${styles.loaderCard} ${styles[size] || styles.md}`}>
        <div className={styles.glowAura} aria-hidden="true" />
        <div className={styles.flowerSpinner} aria-hidden="true">
          <div className={styles.dotsContainer}>
            <div className={styles.biggerDot}>
              <div className={styles.smallerDot} />
            </div>
          </div>
        </div>
        <span className={styles.srOnly}>{message || "Loading"}</span>
      </div>
    </div>
  );
}

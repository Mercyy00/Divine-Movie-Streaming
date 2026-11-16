import { useEffect, useState, useRef, useId } from "react";
import styles from "./ToTop.module.css";

/**
 * Scroll-Progress "Rocket Launch" Back-to-Top Button
 *
 * Floating circular glass button with an SVG progress track that fills based on
 * scroll depth. When clicked, plays the rocket launch animation with an exhaust flame
 * while smoothly returning the viewport to the top.
 */
export default function ToTop() {
  const clipId = useId();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [launching, setLaunching] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const winHeight = window.innerHeight;
        const maxScroll = docHeight - winHeight;

        const currentProg = maxScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll)) : 0;
        setProgress(currentProg);
        setVisible(scrollY > 280);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleClick = (e) => {
    e.preventDefault();
    if (launching) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReducedMotion) {
      setLaunching(true);
    }

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    if (!prefersReducedMotion) {
      setTimeout(() => {
        setLaunching(false);
      }, 700);
    }
  };

  const clipY = 24 - 24 * progress;
  const clipHeight = 24 * progress;

  return (
    <button
      type="button"
      className={`${styles.btn} ${visible ? styles.on : ""} ${launching ? styles.launch : ""}`}
      onClick={handleClick}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      title="Back to top"
    >
      <svg className={styles.arrow} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y={clipY} width="24" height={clipHeight} />
          </clipPath>
        </defs>
        <path className={styles.track} d="M12 20V5M12 5l-7 7M12 5l7 7" />
        <path
          className={styles.fill}
          d="M12 20V5M12 5l-7 7M12 5l7 7"
          clipPath={`url(#${clipId})`}
        />
      </svg>
    </button>
  );
}

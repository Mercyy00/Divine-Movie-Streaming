import { useEffect, useState, useRef, useId } from "react";
import styles from "./ToTop.module.css";

/**
 * Scroll-Progress "Rocket Launch" Back-to-Top Button (High Performance)
 *
 * Direct DOM ref updates for SVG fill clipPath without triggering continuous
 * React component re-renders during active scrolling.
 */
export default function ToTop() {
  const clipId = useId();
  const [visible, setVisible] = useState(false);
  const [launching, setLaunching] = useState(false);
  const rectRef = useRef(null);
  const visibleRef = useRef(false);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let docHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    let winHeight = window.innerHeight;

    const onResize = () => {
      docHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
      winHeight = window.innerHeight;
    };
    window.addEventListener("resize", onResize, { passive: true });

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const maxScroll = docHeight - winHeight;
        const prog = maxScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll)) : 0;

        if (rectRef.current) {
          rectRef.current.setAttribute("y", String(24 - 24 * prog));
          rectRef.current.setAttribute("height", String(24 * prog));
        }

        const isVis = scrollY > 280;
        if (visibleRef.current !== isVis) {
          visibleRef.current = isVis;
          setVisible(isVis);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
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
            <rect ref={rectRef} x="0" y="24" width="24" height="0" />
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

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronRight, Volume2 } from "lucide-react";
import styles from "./IntroSplash.module.css";

const SEEN_KEY = "divine:intro-seen";
const ENABLED_KEY = "divine:intro-enabled";
const EXCLUDED_RE = /^\/(watch|auth|admin|api)(\/|$)/;
const BOT_RE = /bot|crawler|spider|crawling|headless|lighthouse/i;

const readStorage = (store, key) => {
  try { return store.getItem(key); } catch { return null; }
};
const writeStorage = (store, key, val) => {
  try { store.setItem(key, val); } catch {}
};
const clearPending = () => {
  if (typeof document !== "undefined") document.documentElement.classList.remove("divine-intro-pending");
};

export default function IntroSplash({ onStateChange }) {
  const [phase, setPhase] = useState("idle"); // "idle" | "playing" | "exiting" | "done"
  const [showSkip, setShowSkip] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const unmuteRef = useRef(null);
  const prevFocusRef = useRef(null);
  const finishedRef = useRef(false);
  const checkedRef = useRef(false);

  const finishIntro = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearPending();
    try { videoRef.current?.pause(); } catch {}
    setPhase("exiting");
    onStateChange?.("exiting");
  }, [onStateChange]);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    const params = new URLSearchParams(window.location.search || "");
    const path = window.location.pathname || "/";
    if (EXCLUDED_RE.test(path) || params.has("room")) {
      writeStorage(window.sessionStorage, SEEN_KEY, "1");
      clearPending();
      setPhase("done");
      onStateChange?.("done");
      return;
    }
    const skip =
      Boolean(readStorage(window.sessionStorage, SEEN_KEY)) ||
      readStorage(window.localStorage, ENABLED_KEY) === "false" ||
      params.get("nointro") === "1" ||
      Boolean(navigator.webdriver) ||
      BOT_RE.test(navigator.userAgent || "") ||
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) ||
      Boolean(navigator.connection?.saveData);

    if (skip) {
      clearPending();
      setPhase("done");
      onStateChange?.("done");
      return;
    }
    writeStorage(window.sessionStorage, SEEN_KEY, "1");
    prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPhase("playing");
    onStateChange?.("playing");
  }, [onStateChange]);

  useEffect(() => {
    if (phase !== "playing") return;
    let cancelled = false;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.__lenis?.stop?.();
    clearPending();
    overlayRef.current?.focus({ preventScroll: true });

    const skipTimer = setTimeout(() => setShowSkip(true), 800);
    const safetyTimer = setTimeout(() => finishIntro(), 10000);
    const onKeyDown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finishIntro(); }
      else if ((e.key === "Enter" || e.key === " ") && document.activeElement !== unmuteRef.current) {
        e.preventDefault();
        finishIntro();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const video = videoRef.current;
    if (video) {
      video.muted = false;
      const attempt = video.play();
      attempt?.then?.(() => { if (!cancelled) setNeedsUnmute(false); })
        .catch?.(() => {
          if (cancelled) return;
          video.muted = true;
          setNeedsUnmute(true);
          video.play()?.catch?.(() => finishIntro());
        });
    }
    return () => {
      cancelled = true;
      clearTimeout(skipTimer);
      clearTimeout(safetyTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      window.__lenis?.start?.();
    };
  }, [phase, finishIntro]);

  useEffect(() => {
    if (phase !== "exiting") return;
    const t = setTimeout(() => {
      setPhase("done");
      onStateChange?.("done");
      if (prevFocusRef.current?.isConnected) prevFocusRef.current.focus({ preventScroll: true });
    }, 600);
    return () => clearTimeout(t);
  }, [phase, onStateChange]);

  if (phase !== "playing" && phase !== "exiting") return null;

  const handleUnmute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.play()?.catch?.(() => {});
    setNeedsUnmute(false);
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="DIVINE intro"
      tabIndex={-1}
      className={`${styles.overlay} ${phase === "exiting" ? styles.exiting : ""}`}
    >
      <video
        ref={videoRef}
        className={styles.video}
        poster="/brands/divine-intro-poster.jpg"
        playsInline
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload"
        aria-hidden="true"
        onEnded={finishIntro}
        onError={finishIntro}
      >
        <source src="/brands/divine-intro.webm" type="video/webm" />
        <source src="/brands/divine-intro.mp4" type="video/mp4" onError={finishIntro} />
      </video>

      {needsUnmute && phase === "playing" && (
        <button
          ref={unmuteRef}
          type="button"
          className={`${styles.glassPill} ${styles.soundPill}`}
          onClick={handleUnmute}
          aria-label="Tap for sound"
        >
          <Volume2 size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>Tap for sound</span>
        </button>
      )}

      <button
        type="button"
        className={`${styles.glassPill} ${styles.skipPill} ${showSkip ? styles.skipVisible : ""}`}
        onClick={finishIntro}
        aria-label="Skip intro"
      >
        <span>Skip</span>
        <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

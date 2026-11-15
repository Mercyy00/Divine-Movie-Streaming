import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import Art from "./Art";
import { RatingRing, CertBadge, Dot } from "./Meta";
import { runtimeLabel } from "../lib/constants";
import { useSettings } from "../lib/store";
import styles from "./HeroBanner.module.css";

const copyVariants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const childVariants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const backdropVariants = {
  initial: {
    opacity: 0,
    scale: 1.02,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

function Wordmark({ title, disableMotion }) {
  const [failedLogoSrc, setFailedLogoSrc] = useState(null);
  const titleStr =
    typeof title?.title === "string"
      ? title.title
      : typeof title?.name === "string"
      ? title.name
      : String(title?.title || title || "");

  const words = titleStr ? titleStr.toUpperCase().split(" ") : [];
  const stack = words.length <= 3 && title?.type === "movie";
  const showLogo = Boolean(title?.logo && failedLogoSrc !== title.logo);

  if (disableMotion) {
    if (showLogo) {
      return (
        <h1 className={styles.logoWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={title.logo}
            alt={titleStr}
            className={styles.logoImg}
            referrerPolicy="no-referrer"
            onError={() => setFailedLogoSrc(title.logo)}
          />
          <span className="srOnly">{titleStr}</span>
        </h1>
      );
    }
    return (
      <h1 className={`${styles.mark} ${stack ? styles.markStack : styles.markWide}`} aria-label={titleStr}>
        {stack ? words.map((w, idx) => <span key={idx}>{w}</span>) : (titleStr ? titleStr.toUpperCase() : "")}
      </h1>
    );
  }

  if (showLogo) {
    return (
      <motion.h1 variants={childVariants} className={styles.logoWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={title.logo}
          alt={titleStr}
          className={styles.logoImg}
          referrerPolicy="no-referrer"
          onError={() => setFailedLogoSrc(title.logo)}
        />
        <span className="srOnly">{titleStr}</span>
      </motion.h1>
    );
  }

  return (
    <motion.h1 variants={childVariants} className={`${styles.mark} ${stack ? styles.markStack : styles.markWide}`} aria-label={titleStr}>
      {stack ? words.map((w, idx) => <span key={idx}>{w}</span>) : (titleStr ? titleStr.toUpperCase() : "")}
    </motion.h1>
  );
}

export default function HeroBanner({ items = [], interval = 8000 }) {
  const validItems = items.filter(Boolean);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [settings] = useSettings();
  const prefersReducedMotion = useReducedMotion();
  const isPerformance =
    settings?.themeMode === "performance" || settings?.theme === "performance";
  const disableMotion = isPerformance || Boolean(prefersReducedMotion);
  const paused = hover || isFocused || settings.autoplay === false || settings.autoplayPreviews === false;
  const n = validItems.length;
  const activeIdx = n > 0 ? ((i % n) + n) % n : 0;
  const go = useCallback((next) => {
    if (n <= 0) return;
    setI(((next % n) + n) % n);
  }, [n]);

  useEffect(() => {
    if (paused || n < 2) return;
    const id = setTimeout(() => setI((x) => (x + 1) % n), interval);
    return () => clearTimeout(id);
  }, [activeIdx, paused, n, interval]);

  if (n === 0) return null;

  const t = validItems[activeIdx];
  const runtime = runtimeLabel(t);
  const certClean = t?.cert ? String(t.cert).trim() : "";
  const hasRating = typeof t?.rating === "number" ? t.rating > 0 : Number(t?.rating) > 0;
  const qualityLabel = t?.quality && String(t.quality).trim() ? String(t.quality).trim() : "";

  const metaItems = [
    hasRating ? { key: "rating", node: <RatingRing value={t.rating} size={36} /> } : null,
    t?.year ? { key: "year", node: <span>{t.year}</span> } : null,
    runtime ? { key: "runtime", node: <span>{runtime}</span> } : null,
    certClean ? { key: "cert", node: <CertBadge cert={certClean} /> } : null,
    qualityLabel ? { key: "quality", node: <span>{qualityLabel}</span> } : null,
  ].filter(Boolean);

  const overviewText =
    t?.overview && t.overview !== "No synopsis available." ? t.overview : "";

  const renderMetaRow = () => {
    if (metaItems.length === 0) return null;
    return metaItems.map((entry, idx) => (
      <Fragment key={entry.key}>
        {idx > 0 && <Dot />}
        {entry.node}
      </Fragment>
    ));
  };

  const handleHeroKeyDown = (e) => {
    if (n < 2) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(activeIdx - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(activeIdx + 1);
    }
  };

  return (
    <section
      className={styles.hero}
      aria-roledescription="carousel"
      aria-label="Featured titles"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
      onKeyDown={handleHeroKeyDown}
    >
      <div className={styles.stage}>
        {disableMotion ? (
          <div key={t.id ?? activeIdx} className={styles.backdrop}>
            <Art title={t} variant="backdrop" className={styles.art} priority />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={t.id ?? activeIdx}
              className={styles.backdrop}
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Art title={t} variant="backdrop" className={styles.art} priority />
            </motion.div>
          </AnimatePresence>
        )}
        <div className={styles.fadeLeft} />
        <div className={styles.fadeBottom} />
      </div>

      <div className={styles.content}>
        {disableMotion ? (
          <div key={t.id ?? activeIdx} className={styles.copy}>
            <Wordmark title={t} disableMotion={true} />
            {metaItems.length > 0 && <div className={styles.meta}>{renderMetaRow()}</div>}
            {overviewText && <p className={styles.overview}>{overviewText}</p>}
            <div className={styles.actions}>
              <Link
                href={t.type === "movie" ? `/watch/${t.id}` : `/watch/${t.id}?season=1&episode=1`}
                className={styles.playBtn}
              >
                <Play size={16} fill="currentColor" stroke="none" />
                <span>Play</span>
              </Link>
              <Link href={`/title/${t.id}`} className={styles.detailsBtn}>
                <span>Details</span>
              </Link>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={t.id ?? activeIdx}
              className={styles.copy}
              variants={copyVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Wordmark title={t} disableMotion={false} />
              {metaItems.length > 0 && (
                <motion.div variants={childVariants} className={styles.meta}>
                  {renderMetaRow()}
                </motion.div>
              )}
              {overviewText && (
                <motion.p variants={childVariants} className={styles.overview}>
                  {overviewText}
                </motion.p>
              )}
              <motion.div variants={childVariants} className={styles.actions}>
                <Link
                  href={t.type === "movie" ? `/watch/${t.id}` : `/watch/${t.id}?season=1&episode=1`}
                  className={styles.playBtn}
                >
                  <Play size={16} fill="currentColor" stroke="none" />
                  <span>Play</span>
                </Link>
                <Link href={`/title/${t.id}`} className={styles.detailsBtn}>
                  <span>Details</span>
                </Link>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {n > 1 && (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => go(activeIdx - 1)}
            aria-label="Previous title"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <div className={styles.dots} role="tablist" aria-label="Choose featured title">
            {validItems.map((it, idx) => (
              <button
                key={it.id ?? idx}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                aria-label={it.title || `Slide ${idx + 1}`}
                className={`${styles.dot} ${idx === activeIdx ? styles.dotOn : ""}`}
                onClick={() => go(idx)}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => go(activeIdx + 1)}
            aria-label="Next title"
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </section>
  );
}

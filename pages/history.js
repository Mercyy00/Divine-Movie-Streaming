import { useState, useMemo } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { Empty } from "../components/Page";
import Art from "../components/Art";
import { getCardMap } from "../lib/data.server";
import { useHistory, removeFromHistory, entryCard } from "../lib/store";
import { groupHistoryEntries, filterHistoryEntries } from "../lib/accountHelpers";
import { Play, X, Trash2, Film, Tv, Drama, Clock } from "lucide-react";
import styles from "../styles/History.module.css";

export async function getStaticProps() {
  const data = getCardMap();
  return {
    props: {
      ...data,
    },
    revalidate: 1800,
  };
}

export default function History({ cardMap = {} }) {
  const [history, setHistory] = useHistory();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Map history records to titles
  const allEntries = useMemo(() => {
    return (history || [])
      .map((h) => {
        const rawCard =
          entryCard(h) ||
          (h && h.id && cardMap[String(h.id).toLowerCase()]) ||
          null;
        if (!rawCard) return null;
        const titleStr =
          typeof rawCard.title === "string"
            ? rawCard.title
            : typeof rawCard.name === "string"
            ? rawCard.name
            : typeof h?.title === "string"
            ? h.title
            : String(h?.id || "");
        return {
          ...h,
          ...rawCard,
          title: {
            ...rawCard,
            title: titleStr,
          },
        };
      })
      .filter(Boolean);
  }, [history, cardMap]);

  // Counts for filter pills
  const counts = useMemo(() => {
    const movies = allEntries.filter((e) => e.title.type === "movie").length;
    const series = allEntries.filter((e) => e.title.type === "series" || e.title.type === "tv").length;
    const anime = allEntries.filter((e) => e.title.type === "anime").length;
    const inProgress = allEntries.filter((e) => (e.progress || 0) < 0.95).length;
    const completed = allEntries.filter((e) => (e.progress || 0) >= 0.95).length;
    return {
      all: allEntries.length,
      movies,
      series,
      anime,
      inProgress,
      completed,
    };
  }, [allEntries]);

  // Filtered & searched entries
  const displayedEntries = useMemo(
    () => filterHistoryEntries(allEntries, activeFilter, searchQuery),
    [allEntries, activeFilter, searchQuery]
  );

  // Group entries by Today / Yesterday / This week / Earlier
  const groupedSections = useMemo(
    () => groupHistoryEntries(displayedEntries),
    [displayedEntries]
  );

  const handleRemoveItem = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    // SyncManager observes viv:history updates and persists to DB when signed in.
    removeFromHistory(setHistory, id);
  };

  const handleClearAll = () => {
    if (confirmClear) {
      setHistory([]);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  };

  return (
    <Layout
      title="Watch History · DIVINE"
      description="Pick up where you left off across all your movies, series, and anime."
    >
      <div className={`pageInner ${styles.pageWrap}`}>
        {/* Top Header Row */}
        <div className={styles.topRow}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>History</h1>
            <p className={styles.pageSub}>
              {allEntries.length > 0
                ? `${allEntries.length} ${
                    allEntries.length === 1 ? "title" : "titles"
                  } in your watch history`
                : "Pick up where you left off."}
            </p>
          </div>

          {allEntries.length > 0 && (
            <div className={styles.topActions}>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleClearAll}
                title="Clear all watch history"
              >
                <Trash2 size={15} />
                <span>{confirmClear ? "Confirm clear?" : "Clear history"}</span>
              </button>
              {confirmClear && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setConfirmClear(false)}
                  style={{ opacity: 0.8 }}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Controls Bar: Filter Pills + Search */}
        {allEntries.length > 0 && (
          <div className={styles.controlsBar}>
            <div className={styles.filterPills}>
              <button
                type="button"
                className={`${styles.pill} ${activeFilter === "all" ? styles.pillActive : ""}`}
                onClick={() => setActiveFilter("all")}
              >
                All ({counts.all})
              </button>
              <button
                type="button"
                className={`${styles.pill} ${activeFilter === "movies" ? styles.pillActive : ""}`}
                onClick={() => setActiveFilter("movies")}
              >
                <Film size={13} />
                Movies ({counts.movies})
              </button>
              <button
                type="button"
                className={`${styles.pill} ${activeFilter === "series" ? styles.pillActive : ""}`}
                onClick={() => setActiveFilter("series")}
              >
                <Tv size={13} />
                Series ({counts.series})
              </button>
              {counts.anime > 0 && (
                <button
                  type="button"
                  className={`${styles.pill} ${activeFilter === "anime" ? styles.pillActive : ""}`}
                  onClick={() => setActiveFilter("anime")}
                >
                  <Drama size={13} />
                  Anime ({counts.anime})
                </button>
              )}
              <button
                type="button"
                className={`${styles.pill} ${activeFilter === "in_progress" ? styles.pillActive : ""}`}
                onClick={() => setActiveFilter("in_progress")}
              >
                In progress ({counts.inProgress})
              </button>
              <button
                type="button"
                className={`${styles.pill} ${activeFilter === "completed" ? styles.pillActive : ""}`}
                onClick={() => setActiveFilter("completed")}
              >
                Completed ({counts.completed})
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search history..."
                aria-label="Search watch history"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        )}

        {/* Grouped History Items */}
        {groupedSections.length > 0 ? (
          <div>
            {groupedSections.map((group) => (
              <div key={group.title} style={{ marginBottom: 40 }}>
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#fff",
                    margin: "0 0 16px",
                  }}
                >
                  {group.title}
                </h2>
                <div className={styles.historyGrid}>
                  {group.items.map((item) => {
                    const progressVal = Number.isFinite(item.progress) ? item.progress : 0;
                    const isCompleted = progressVal >= 0.95;
                    const progressPct = Math.min(100, Math.round(progressVal * 100));

                    const isSeries = item.title.type === "series" || item.title.type === "anime";
                    const seriesLabel = isSeries
                      ? item.episodeTitle
                        ? `S${item.season || 1} · E${item.episode || 1} — “${item.episodeTitle}”`
                        : `S${item.season || 1} · E${item.episode || 1}`
                      : null;

                    // Compute remaining time
                    const remMinutes = item.title.runtime
                      ? Math.max(1, Math.round(item.title.runtime * (1 - progressVal)))
                      : null;
                    const remHours = remMinutes === null ? null : Math.floor(remMinutes / 60);
                    const remMins = remMinutes === null ? null : remMinutes % 60;
                    const timeRemaining = isCompleted
                      ? "Completed"
                      : item.timeLeft || (remMinutes !== null
                        ? remHours > 0
                          ? `${remHours}h ${remMins}m left`
                          : `${remMins}m left`
                        : null);

                    const watchHref = isSeries
                      ? `/watch/${item.id}?season=${item.season || 1}&episode=${item.episode || 1}`
                      : `/watch/${item.id}`;

                    return (
                      <Link
                        key={`${item.id}:${item.season || 0}:${item.episode || 0}`}
                        href={watchHref}
                        className={styles.historyCard}
                      >
                        <div className={styles.artWrap}>
                          <Art
                            title={item.title}
                            variant="backdrop"
                            showTitle={false}
                            className={styles.cardImg}
                          />

                          {/* Hover Play Button */}
                          <div className={styles.playOverlay}>
                            <div className={styles.playIconCircle}>
                              <Play size={18} fill="currentColor" />
                            </div>
                          </div>

                          {/* Individual Remove (X) Button */}
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={(e) => handleRemoveItem(e, item.id)}
                            title={`Remove ${item.title.title} from history`}
                            aria-label={`Remove ${item.title.title} from history`}
                          >
                            <X size={15} />
                          </button>

                          {/* Progress Bar */}
                          <div className={styles.progressBar}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        <div className={styles.meta}>
                          <h3 className={styles.cardTitle}>
                            {typeof item.title?.title === "string"
                              ? item.title.title
                              : typeof item.title?.name === "string"
                              ? item.title.name
                              : String(item.title || item.id || "")}
                          </h3>
                          <p className={styles.cardSub}>
                            {seriesLabel ? (
                              <span style={{ color: "rgba(255, 255, 255, 0.9)", fontWeight: 600 }}>
                                {seriesLabel}
                              </span>
                            ) : item.title.year ? (
                              <span>{item.title.year}</span>
                            ) : null}
                            {(seriesLabel || item.title.year) && timeRemaining && (
                              <span className={styles.dot}>•</span>
                            )}
                            {timeRemaining && (
                              <span className={styles.timeLeft}>
                                <Clock size={11} style={{ display: "inline", marginRight: 4 }} />
                                {timeRemaining}
                              </span>
                            )}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={
              allEntries.length === 0
                ? "Nothing watched yet"
                : "No matching titles found"
            }
            text={
              allEntries.length === 0
                ? "Press play on any movie or series and your progress will be saved here automatically."
                : "Try selecting another filter or clearing your search term."
            }
            href="/"
            cta="Explore movies & series"
          />
        )}
      </div>
    </Layout>
  );
}

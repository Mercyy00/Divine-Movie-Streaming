import { useRouter } from "next/router";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Search as SearchIcon, X, User } from "lucide-react";
import Layout from "../components/Layout";
import Art from "../components/Art";
import { Empty } from "../components/Page";
import { SkeletonGrid } from "../components/Skeleton";
import styles from "../styles/Search.module.css";

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 1800,
  };
}

const TABS = [
  { id: "all", label: "All" },
  { id: "movies", label: "Movies" },
  { id: "series", label: "Series" },
  { id: "anime", label: "Anime" },
  { id: "people", label: "People" },
];

export default function SearchPage() {
  const router = useRouter();
  const qParam = typeof router.query.q === "string" ? router.query.q : "";
  const tabParam = typeof router.query.tab === "string" ? router.query.tab : "all";

  const [inputVal, setInputVal] = useState(qParam);
  const [activeTab, setActiveTab] = useState(tabParam);
  const [results, setResults] = useState([]);
  const [peopleResults, setPeopleResults] = useState([]);
  const [didYouMean, setDidYouMean] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState(() => new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncNetwork = () => setIsOffline(!window.navigator.onLine);
    syncNetwork();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    return () => {
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
    };
  }, []);

  // Sync state if URL query changes
  useEffect(() => {
    if (!router.isReady) return;
    setInputVal((prev) => (prev === qParam ? prev : qParam));
    setActiveTab((prev) => (prev === tabParam ? prev : tabParam));
  }, [qParam, tabParam, router.isReady]);

  // Execute search after router isReady (TMDB for movies/series/people, AniList for anime)
  useEffect(() => {
    if (!router.isReady) return;

    if (!qParam.trim()) {
      setResults([]);
      setPeopleResults([]);
      setDidYouMean(null);
      setSearchError(false);
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setSearchError(false);

    const isPeople = activeTab === "people";
    const isAnime = activeTab === "anime";

    if (isPeople) {
      fetch(`/api/tmdb/search?q=${encodeURIComponent(qParam)}&type=person`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!active) return;
          setPeopleResults(Array.isArray(data) ? data : []);
          setDidYouMean(null);
          setLoading(false);
        })
        .catch((err) => {
          if (!active || err?.name === "AbortError") return;
          setPeopleResults([]);
          setSearchError(true);
          setLoading(false);
        });
    } else if (isAnime) {
      fetch(`/api/anilist/search?q=${encodeURIComponent(qParam)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!active) return;
          setResults(Array.isArray(data) ? data : []);
          setDidYouMean(null);
          setLoading(false);
        })
        .catch((err) => {
          if (!active || err?.name === "AbortError") return;
          setResults([]);
          setSearchError(true);
          setLoading(false);
        });
    } else {
      // Tab is "all", "movies", or "series"
      let currentSuggestion = null;
      const tmdbPromise = fetch(`/api/tmdb/search?q=${encodeURIComponent(qParam)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          currentSuggestion = res.headers.get("X-Did-You-Mean");
          const data = await res.json();
          return Array.isArray(data) ? data : data?.results || [];
        });

      const animePromise =
        activeTab === "all"
          ? fetch(`/api/anilist/search?q=${encodeURIComponent(qParam)}&limit=10`, { signal: controller.signal })
              .then((res) => (res.ok ? res.json() : []))
              .catch(() => [])
          : Promise.resolve([]);

      Promise.all([tmdbPromise, animePromise])
        .then(([tmdbItems, animeItems]) => {
          if (!active) return;
          const cleanTmdb = (Array.isArray(tmdbItems) ? tmdbItems : []).filter((item) => item.type !== "anime");
          const cleanAnime = Array.isArray(animeItems) ? animeItems : [];
          setResults([...cleanTmdb, ...cleanAnime]);
          setDidYouMean(currentSuggestion || null);
          setLoading(false);
        })
        .catch((err) => {
          if (!active || err?.name === "AbortError") return;
          setResults([]);
          setSearchError(true);
          setLoading(false);
        });
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [router.isReady, qParam, activeTab, retryCount]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const clean = inputVal.trim();
    if (!clean) return;
    router.replace(
      { pathname: "/search", query: { q: clean, tab: activeTab } },
      undefined,
      { shallow: true }
    );
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (qParam) {
      router.replace(
        { pathname: "/search", query: { q: qParam, tab: tabId } },
        undefined,
        { shallow: true }
      );
    }
  };

  const clearInput = () => {
    setInputVal("");
    router.replace({ pathname: "/search" }, undefined, { shallow: true });
  };

  // Filter items by active tab
  const displayedTitles = useMemo(() => {
    if (activeTab === "movies") {
      return results.filter((r) => r.type === "movie");
    }
    if (activeTab === "series") {
      return results.filter((r) => r.type === "series");
    }
    if (activeTab === "anime") {
      return results.filter((r) => r.type === "anime");
    }
    return results;
  }, [results, activeTab]);

  return (
    <Layout
      title={qParam ? `${qParam} · Search` : "Search"}
      description="Search movies, TV series, anime and people directly from TMDB."
    >
      <div className={styles.container}>
        <form className={styles.searchBarWrap} onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search movies, series, anime, people…"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            aria-label="Search DIVINE"
          />
          {inputVal && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={clearInput}
              aria-label="Clear search"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
          <SearchIcon size={20} strokeWidth={1.75} className={styles.searchIcon} />
        </form>

        {/* Filter Tabs: All | Movies | Series | Anime | People */}
        <div className={styles.tabsRow} role="tablist" aria-label="Search categories">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ""}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Calm frosted glass Did you mean notice */}
        {didYouMean && !loading && !searchError && (
          <div className={styles.didYouMeanBanner}>
            <span>Showing results for</span>
            <button
              type="button"
              className={styles.didYouMeanBtn}
              onClick={() => {
                setInputVal(didYouMean);
                router.replace(
                  { pathname: "/search", query: { q: didYouMean, tab: activeTab } },
                  undefined,
                  { shallow: true }
                );
              }}
            >
              {didYouMean}
            </button>
          </div>
        )}

        {/* Content State */}
        <div aria-live="polite">
          {loading ? (
            <SkeletonGrid count={6} wide={true} />
          ) : searchError ? (
            <Empty
              title={isOffline ? "You appear to be offline" : "Search failed"}
              text={
                isOffline
                  ? "Reconnect to the internet to search movies, series, anime and people."
                  : `We couldn't complete your search for “${qParam}”. Try again.`
              }
              actionLabel="Try again"
              onAction={() => setRetryCount((c) => c + 1)}
            />
          ) : activeTab === "people" ? (
            peopleResults.length > 0 ? (
              <div className={styles.peopleGrid}>
                {peopleResults.map((person) => {
                  const showAvatar = Boolean(person.profile) && !failedAvatars.has(person.id);
                  return (
                    <div key={person.id} className={styles.personCard}>
                      <div className={styles.personAvatarWrap}>
                        {showAvatar ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={person.profile}
                            alt={person.name}
                            className={styles.personAvatarImg}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedAvatars((prev) => {
                                const next = new Set(prev);
                                next.add(person.id);
                                return next;
                              })
                            }
                          />
                        ) : (
                          <div
                            className={styles.personFallbackAvatar}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "100%",
                              height: "100%",
                            }}
                          >
                            <User size={44} strokeWidth={1.75} color="rgba(255, 255, 255, 0.4)" />
                          </div>
                        )}
                      </div>
                      <h3 className={styles.personName}>{person.name}</h3>
                      {person.department && (
                        <span className={styles.personDept}>{person.department}</span>
                      )}
                      {person.knownFor && (
                        <p className={styles.personKnownFor}>Known for: {person.knownFor}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : qParam ? (
              <Empty
                title="No people found"
                text={`No actors, directors or creators match “${qParam}”.`}
              />
            ) : (
              <Empty
                title="Search people"
                text="Search for actors, directors and creators to explore their work."
              />
            )
          ) : displayedTitles.length > 0 ? (
            <div className={styles.resultsList}>
              {displayedTitles.map((item) => {
                const metaParts = [
                  item.year || null,
                  item.type === "movie" ? "Movie" : item.type === "anime" ? "Anime" : "Series",
                ].filter(Boolean);
                return (
                  <Link
                    key={item.id}
                    href={`/title/${item.id}`}
                    className={styles.resultCard}
                  >
                    <div className={styles.thumbWrap}>
                      <Art
                        title={item}
                        variant="backdrop"
                        showTitle={false}
                        className={styles.thumbImg}
                      />
                    </div>
                    <div className={styles.infoCol}>
                      <h2 className={styles.cardTitle}>{item.title}</h2>
                      <div className={styles.cardMeta}>
                        {metaParts.map((part, idx) => (
                          <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {idx > 0 && <span aria-hidden="true">·</span>}
                            <span>{part}</span>
                          </span>
                        ))}
                      </div>
                      {Number(item.rating) > 0 && (
                        <div className={styles.ratingRow}>
                          <span className={styles.rating}>★ {Number(item.rating).toFixed(1)}</span>
                        </div>
                      )}
                      {item.overview && <p className={styles.overview}>{item.overview}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : qParam ? (
            <Empty
              title="No titles found"
              text={`No results matched “${qParam}”. Try checking spelling or switching categories.`}
              actionLabel={activeTab !== "all" ? "Show all categories" : undefined}
              onAction={activeTab !== "all" ? () => handleTabChange("all") : undefined}
            />
          ) : (
            <Empty
              title="Search DIVINE"
              text="Type any movie, TV series, anime, or person above to explore titles."
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import HeroBanner from "../components/HeroBanner";
import MediaRow from "../components/MediaRow";
import MediaCard from "../components/MediaCard";
import TileRow from "../components/TileRow";
import { CatalogFilterBar, TitleGrid, Empty } from "../components/Page";
import { SkeletonHero, SkeletonGrid, SkeletonRow } from "../components/Skeleton";
import { STUDIOS, SERVICES, LANGUAGES, BRAND } from "../lib/constants";
import {
  seededShuffle,
  mergeUniqueMediaPage,
  parseBrowseQuery,
  buildBrowseQuery,
  countActiveFilters,
} from "../lib/catalogHelpers";

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 1800,
  };
}

const CATEGORIES = [
  { value: "trending", label: "Trending" },
  { value: "popular", label: "Popular" },
  { value: "top", label: "Top Rated" },
  { value: "now_playing", label: "Now Playing" },
  { value: "upcoming", label: "Upcoming" },
];

const VALID_CATEGORIES = CATEGORIES.map((c) => c.value);
const FILTER_KEYS = ["genre", "country", "year", "service", "language", "rating"];

const DEFAULT_FILTERS = {
  genre: "all",
  country: "all",
  year: "all",
  service: "all",
  language: "all",
  rating: "all",
};

const STANDARD_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "War",
  "Western",
];

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "IN", label: "India" },
  { value: "AU", label: "Australia" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
];

const YEARS = ["2026", "2025", "2024", "2023", "2022", "2020s", "2010s", "Earlier"];

export default function Movies() {
  const router = useRouter();
  const gridRef = useRef(null);
  const infiniteTriggerRef = useRef(null);
  const itemsRef = useRef([]);
  const loadingMoreRef = useRef(false);
  const pageAbortRef = useRef(null);

  const [category, setCategory] = useState("trending");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  // Pagination & Infinite Scroll states
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Dynamic state loaded from TMDB API
  const [heroItems, setHeroItems] = useState([]);
  const [heroLoading, setHeroLoading] = useState(true);

  const [moviesList, setMoviesList] = useState([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [moviesError, setMoviesError] = useState(false);

  const [topMovies, setTopMovies] = useState([]);
  const [topLoading, setTopLoading] = useState(true);

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

  // Sync state from URL query on initial load and back/forward navigation
  useEffect(() => {
    if (!router.isReady) return;
    const parsed = parseBrowseQuery(router.query, {
      defaultCategory: "trending",
      validCategories: VALID_CATEGORIES,
      filterKeys: FILTER_KEYS,
    });
    setCategory((prev) => (prev === parsed.category ? prev : parsed.category));
    setFilters((prev) => {
      const same = FILTER_KEYS.every((k) => prev[k] === parsed.filters[k]);
      return same ? prev : parsed.filters;
    });
  }, [router.isReady, router.query]);

  // 1. Fetch featured hero banner movies from TMDB API (trending movies)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/tmdb/discover?category=trending&type=movie", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          setHeroItems(data.slice(0, 5));
        }
        setHeroLoading(false);
      })
      .catch(() => {
        if (active) setHeroLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryCount]);

  // 2. Fetch Top 10 Rated movies from TMDB API
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/tmdb/discover?category=top&type=movie", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          setTopMovies(data.slice(0, 10));
        }
        setTopLoading(false);
      })
      .catch(() => {
        if (active) setTopLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryCount]);

  // 3. Fetch catalog movies (Page 1) after router isReady whenever category or filters change
  useEffect(() => {
    if (!router.isReady) return;

    let active = true;
    const controller = new AbortController();
    pageAbortRef.current?.abort();
    pageAbortRef.current = null;
    loadingMoreRef.current = false;

    setMoviesLoading(true);
    setMoviesError(false);
    setLoadingMore(false);
    setPage(1);
    setHasMore(true);

    const params = new URLSearchParams({
      type: "movie",
      category,
      genre: filters.genre,
      country: filters.country,
      year: filters.year,
      service: filters.service,
      language: filters.language,
      rating: filters.rating,
      page: "1",
    });

    fetch(`/api/tmdb/discover?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        const newItems = Array.isArray(data) ? data : [];
        itemsRef.current = newItems;
        setMoviesList(newItems);
        setMoviesLoading(false);
        setMoviesError(false);
        if (newItems.length < 10) {
          setHasMore(false);
        }
      })
      .catch((err) => {
        if (!active || err?.name === "AbortError") return;
        itemsRef.current = [];
        setMoviesList([]);
        setMoviesLoading(false);
        setMoviesError(true);
        setHasMore(false);
      });

    return () => {
      active = false;
      controller.abort();
      pageAbortRef.current?.abort();
    };
  }, [router.isReady, category, filters, retryCount]);

  // 4. Load next page for infinite scroll
  const loadMore = useCallback(() => {
    if (moviesLoading || loadingMoreRef.current || !hasMore || page >= 500) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;

    const controller = new AbortController();
    pageAbortRef.current?.abort();
    pageAbortRef.current = controller;

    const params = new URLSearchParams({
      type: "movie",
      category,
      genre: filters.genre,
      country: filters.country,
      year: filters.year,
      service: filters.service,
      language: filters.language,
      rating: filters.rating,
      page: String(nextPage),
    });

    fetch(`/api/tmdb/discover?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const newItems = Array.isArray(data) ? data : [];
        if (newItems.length === 0) {
          setHasMore(false);
          loadingMoreRef.current = false;
          setLoadingMore(false);
          return;
        }

        const { items: merged, addedCount } = mergeUniqueMediaPage(itemsRef.current, newItems);
        itemsRef.current = merged;
        setMoviesList(merged);
        setPage(nextPage);

        if (nextPage >= 500 || newItems.length < 10 || addedCount === 0) {
          setHasMore(false);
        }
        loadingMoreRef.current = false;
        setLoadingMore(false);
      })
      .catch((err) => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
        if (err?.name !== "AbortError") {
          setHasMore(false);
        }
      });
  }, [moviesLoading, hasMore, page, category, filters]);

  // 5. Infinite scroll observer
  useEffect(() => {
    if (!hasMore || moviesLoading || loadingMore) return;
    const trigger = infiniteTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "250px" }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, moviesLoading, loadingMore, loadMore]);

  const filterOptions = useMemo(() => {
    return {
      genre: STANDARD_GENRES.map((g) => ({ value: g, label: g })),
      country: COUNTRIES,
      year: YEARS.map((y) => ({ value: y, label: y })),
      service: SERVICES.map((s) => ({ value: s.id, label: s.name })),
      language: LANGUAGES,
      rating: [
        { value: "8", label: "★ 8.0+" },
        { value: "7", label: "★ 7.0+" },
        { value: "6", label: "★ 6.0+" },
      ],
    };
  }, []);

  const scrollToGrid = () => {
    if (gridRef.current && typeof window !== "undefined") {
      const top = gridRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const updateUrl = (newCat, newFilters) => {
    const next = buildBrowseQuery(
      { category: newCat, filters: newFilters },
      { defaultCategory: "trending" }
    );
    router.replace({ pathname: "/movies", query: next }, undefined, { shallow: true });
    scrollToGrid();
  };

  const handleCategoryChange = (val) => {
    setShuffleSeed(0);
    setCategory(val);
    updateUrl(val, filters);
  };

  const handleFilterChange = (key, val) => {
    setShuffleSeed(0);
    const nextFilters = { ...filters, [key]: val };
    setFilters(nextFilters);
    updateUrl(category, nextFilters);
  };

  const handleResetFilters = () => {
    setShuffleSeed(0);
    setCategory("trending");
    setFilters(DEFAULT_FILTERS);
    updateUrl("trending", DEFAULT_FILTERS);
  };

  const handleShuffle = () => {
    setShuffleSeed((s) => s + 1);
  };

  const activeFilterCount = useMemo(
    () => countActiveFilters({ category, filters }, { defaultCategory: "trending" }),
    [category, filters]
  );

  const displayedMovies = useMemo(() => {
    if (!moviesList || moviesList.length === 0) return [];
    return shuffleSeed > 0 ? seededShuffle(moviesList, shuffleSeed) : moviesList;
  }, [moviesList, shuffleSeed]);

  return (
    <Layout
      flush
      title="Movies"
      description={`Movies on ${BRAND.name}: stream top rated, new releases and trending blockbusters directly from TMDB.`}
    >
      {heroLoading ? (
        <SkeletonHero />
      ) : heroItems.length > 0 ? (
        <HeroBanner items={heroItems} />
      ) : null}

      <section
        ref={gridRef}
        style={{
          padding: "36px var(--page-pad) 64px",
          maxWidth: "var(--page-max)",
          margin: "0 auto",
        }}
      >
        <CatalogFilterBar
          title="Movies"
          category={category}
          onCategoryChange={handleCategoryChange}
          categories={CATEGORIES}
          filters={filters}
          onFilterChange={handleFilterChange}
          filterOptions={filterOptions}
          onShuffle={handleShuffle}
          activeFilterCount={activeFilterCount}
          onReset={handleResetFilters}
        />

        {moviesLoading ? (
          <SkeletonGrid count={15} wide={true} />
        ) : moviesError ? (
          <Empty
            title={isOffline ? "You appear to be offline" : "Couldn't load movies"}
            text={
              isOffline
                ? "Reconnect to the internet to browse the movie catalog."
                : "There was a problem loading titles from TMDB. Please try again."
            }
            actionLabel="Try again"
            onAction={() => setRetryCount((c) => c + 1)}
          />
        ) : displayedMovies.length > 0 ? (
          <>
            <TitleGrid items={displayedMovies} wide={true} />

            {/* Infinite Scroll Trigger & Indicator */}
            {hasMore && (
              <div
                ref={infiniteTriggerRef}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "36px 0 16px",
                  minHeight: "60px",
                }}
              >
                {loadingMore && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "rgba(255, 255, 255, 0.65)",
                      fontSize: "14px",
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        border: "2px solid rgba(255, 255, 255, 0.2)",
                        borderTopColor: "#ffffff",
                        borderRadius: "50%",
                        animation: "vSpin 0.8s linear infinite",
                        display: "inline-block",
                      }}
                    />
                    <span>Loading more movies...</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <Empty
            title="No movies found"
            text="No movies match your selected filters. Try widening your genre, year or rating."
            actionLabel={activeFilterCount > 0 ? "Reset filters" : undefined}
            onAction={activeFilterCount > 0 ? handleResetFilters : undefined}
          />
        )}
      </section>

      {topLoading ? (
        <SkeletonRow title="Top 10 Movies" count={6} wide={true} />
      ) : topMovies.length > 0 ? (
        <MediaRow title="Top 10 Movies">
          {topMovies.map((t, i) => (
            <MediaCard key={t.id || t.tmdbId} title={t} rank={i + 1} />
          ))}
        </MediaRow>
      ) : null}

      <TileRow title="Browse by studio" items={STUDIOS} param="studio" />
    </Layout>
  );
}

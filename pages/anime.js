import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import HeroBanner from "../components/HeroBanner";
import MediaRow from "../components/MediaRow";
import MediaCard from "../components/MediaCard";
import { CatalogFilterBar, TitleGrid, Empty, Chips } from "../components/Page";
import { SkeletonHero, SkeletonGrid, SkeletonRow } from "../components/Skeleton";
import { BRAND } from "../lib/constants";
import { fetchAniListDiscover } from "../lib/anilist";
import {
  seededShuffle,
  mergeUniqueMediaPage,
  parseBrowseQuery,
  buildBrowseQuery,
  countActiveFilters,
} from "../lib/catalogHelpers";

export async function getStaticProps() {
  try {
    const [heroData, topData] = await Promise.all([
      fetchAniListDiscover({ category: "trending", perPage: 10 }),
      fetchAniListDiscover({ category: "top", perPage: 10 }),
    ]);
    return {
      props: {
        initialHero: heroData ? heroData.slice(0, 5) : [],
        initialTrending: heroData ? heroData.slice(0, 10) : [],
        initialTop: topData || [],
      },
      revalidate: 1800,
    };
  } catch {
    return {
      props: {},
      revalidate: 60,
    };
  }
}

const CATEGORIES = [
  { value: "trending", label: "Trending" },
  { value: "popular", label: "Popular" },
  { value: "top", label: "Top Rated" },
  { value: "simulcasts", label: "Simulcasts" },
];

const VALID_CATEGORIES = CATEGORIES.map((c) => c.value);
const FILTER_KEYS = ["genre", "year", "rating"];

const DEFAULT_FILTERS = {
  genre: "all",
  year: "all",
  rating: "all",
};

const EXTRA_DEFAULTS = {
  studio: "all",
  subgenre: "all",
};

const EXTRA_ALIASES = {
  subgenre: ["keywords"],
};

const ANIME_STUDIOS = [
  { value: "all", label: "All Studios" },
  { value: "MAPPA", label: "MAPPA" },
  { value: "ufotable", label: "Ufotable" },
  { value: "Wit Studio", label: "Wit Studio" },
  { value: "A-1 Pictures", label: "A-1 Pictures" },
  { value: "Sunrise", label: "Sunrise" },
  { value: "Kyoto Animation", label: "Kyoto Animation" },
  { value: "Bones", label: "Bones" },
  { value: "Madhouse", label: "Madhouse" },
  { value: "CloverWorks", label: "CloverWorks" },
];

const ANIME_SUBGENRES = [
  { value: "all", label: "All Sub-genres" },
  { value: "Isekai", label: "Isekai" },
  { value: "Mecha", label: "Mecha" },
  { value: "Shounen", label: "Shounen" },
  { value: "Slice of Life", label: "Slice of Life" },
  { value: "Psychological", label: "Psychological" },
  { value: "Cyberpunk", label: "Cyberpunk" },
];

const STANDARD_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Supernatural",
  "Sports",
];

const YEARS = ["2026", "2025", "2024", "2023", "2022", "2010s", "Earlier"];

export default function Anime({ initialHero = [], initialTrending = [], initialTop = [] }) {
  const router = useRouter();
  const gridRef = useRef(null);
  const infiniteTriggerRef = useRef(null);
  const itemsRef = useRef([]);
  const loadingMoreRef = useRef(false);
  const pageAbortRef = useRef(null);

  const [category, setCategory] = useState("trending");
  const [studio, setStudio] = useState("all");
  const [subgenre, setSubgenre] = useState("all");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  // Pagination & Infinite Scroll
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Dynamic AniList state
  const [heroItems, setHeroItems] = useState(initialHero);
  const [heroLoading, setHeroLoading] = useState(initialHero.length === 0);

  const [topItems, setTopItems] = useState(initialTop);
  const [topLoading, setTopLoading] = useState(initialTop.length === 0);

  const [trendingItems, setTrendingItems] = useState(initialTrending);
  const [trendingLoading, setTrendingLoading] = useState(initialTrending.length === 0);

  const [animeList, setAnimeList] = useState([]);
  const [animeLoading, setAnimeLoading] = useState(true);
  const [animeError, setAnimeError] = useState(false);

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

  // Sync state from URL query on initial load or back/forward navigation
  useEffect(() => {
    if (!router.isReady) return;
    const parsed = parseBrowseQuery(router.query, {
      defaultCategory: "trending",
      validCategories: VALID_CATEGORIES,
      filterKeys: FILTER_KEYS,
      extraDefaults: EXTRA_DEFAULTS,
      extraAliases: EXTRA_ALIASES,
    });
    setCategory((prev) => (prev === parsed.category ? prev : parsed.category));
    setStudio((prev) => (prev === parsed.extra.studio ? prev : parsed.extra.studio));
    setSubgenre((prev) => (prev === parsed.extra.subgenre ? prev : parsed.extra.subgenre));
    setFilters((prev) => {
      const same = FILTER_KEYS.every((k) => prev[k] === parsed.filters[k]);
      return same ? prev : parsed.filters;
    });
  }, [router.isReady, router.query]);

  // 1. Fetch featured hero banner anime & trending from AniList API
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/anilist/discover?category=trending&perPage=10", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          setHeroItems(data.slice(0, 5));
          setTrendingItems(data.slice(0, 10));
        }
        setHeroLoading(false);
        setTrendingLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setHeroLoading(false);
        setTrendingLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryCount]);

  // 2. Fetch Top rated anime from AniList API
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/anilist/discover?category=top&perPage=10", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          setTopItems(data.slice(0, 10));
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

  // 3. Fetch catalog anime (Page 1) after router isReady
  useEffect(() => {
    if (!router.isReady) return;

    let active = true;
    const controller = new AbortController();
    pageAbortRef.current?.abort();
    pageAbortRef.current = null;
    loadingMoreRef.current = false;

    setAnimeLoading(true);
    setAnimeError(false);
    setLoadingMore(false);
    setPage(1);
    setHasMore(true);

    const params = new URLSearchParams({
      category,
      genre: filters.genre,
      year: filters.year,
      rating: filters.rating,
      page: "1",
      perPage: "24",
    });
    if (studio && studio !== "all") params.set("studio", studio);
    if (subgenre && subgenre !== "all") params.set("subgenre", subgenre);

    fetch(`/api/anilist/discover?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        const arr = Array.isArray(data) ? data : [];
        itemsRef.current = arr;
        setAnimeList(arr);
        setAnimeLoading(false);
        setAnimeError(false);
        if (arr.length < 18) {
          setHasMore(false);
        }
      })
      .catch((err) => {
        if (!active || err?.name === "AbortError") return;
        itemsRef.current = [];
        setAnimeList([]);
        setAnimeLoading(false);
        setAnimeError(true);
        setHasMore(false);
      });

    return () => {
      active = false;
      controller.abort();
      pageAbortRef.current?.abort();
    };
  }, [router.isReady, category, studio, subgenre, filters, retryCount]);

  // 4. Load next page for infinite scroll
  const loadMore = useCallback(() => {
    if (animeLoading || loadingMoreRef.current || !hasMore || page >= 50) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;

    const controller = new AbortController();
    pageAbortRef.current?.abort();
    pageAbortRef.current = controller;

    const params = new URLSearchParams({
      category,
      genre: filters.genre,
      year: filters.year,
      rating: filters.rating,
      page: String(nextPage),
      perPage: "24",
    });
    if (studio && studio !== "all") params.set("studio", studio);
    if (subgenre && subgenre !== "all") params.set("subgenre", subgenre);

    fetch(`/api/anilist/discover?${params.toString()}`, { signal: controller.signal })
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
        setAnimeList(merged);
        setPage(nextPage);

        if (nextPage >= 50 || newItems.length < 18 || addedCount === 0) {
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
  }, [animeLoading, hasMore, page, category, studio, subgenre, filters]);

  // 5. Infinite scroll observer
  useEffect(() => {
    if (!hasMore || animeLoading || loadingMore) return;
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
  }, [hasMore, animeLoading, loadingMore, loadMore]);

  const filterOptions = useMemo(() => {
    return {
      genre: STANDARD_GENRES.map((g) => ({ value: g, label: g })),
      year: YEARS.map((y) => ({ value: y, label: y })),
      rating: [
        { value: "8", label: "★ 8.0+" },
        { value: "7", label: "★ 7.0+" },
      ],
    };
  }, []);

  const scrollToGrid = () => {
    if (gridRef.current && typeof window !== "undefined") {
      const top = gridRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const updateUrl = (newCat, newStudio, newSubgenre, newFilters) => {
    const next = buildBrowseQuery(
      {
        category: newCat,
        filters: newFilters,
        extra: { studio: newStudio, subgenre: newSubgenre },
      },
      { defaultCategory: "trending", extraDefaults: EXTRA_DEFAULTS }
    );
    router.replace({ pathname: "/anime", query: next }, undefined, { shallow: true });
    scrollToGrid();
  };

  const handleCategoryChange = (val) => {
    setShuffleSeed(0);
    setCategory(val);
    updateUrl(val, studio, subgenre, filters);
  };

  const handleStudioChange = (val) => {
    setShuffleSeed(0);
    setStudio(val);
    updateUrl(category, val, subgenre, filters);
  };

  const handleSubgenreChange = (val) => {
    setShuffleSeed(0);
    setSubgenre(val);
    updateUrl(category, studio, val, filters);
  };

  const handleFilterChange = (key, val) => {
    setShuffleSeed(0);
    const nextFilters = { ...filters, [key]: val };
    setFilters(nextFilters);
    updateUrl(category, studio, subgenre, nextFilters);
  };

  const handleResetFilters = () => {
    setShuffleSeed(0);
    setCategory("trending");
    setStudio("all");
    setSubgenre("all");
    setFilters(DEFAULT_FILTERS);
    updateUrl("trending", "all", "all", DEFAULT_FILTERS);
  };

  const handleShuffle = () => {
    setShuffleSeed((s) => s + 1);
  };

  const activeFilterCount = useMemo(
    () =>
      countActiveFilters(
        { category, filters, extra: { studio, subgenre } },
        { defaultCategory: "trending", extraDefaults: EXTRA_DEFAULTS }
      ),
    [category, filters, studio, subgenre]
  );

  const displayedAnime = useMemo(() => {
    if (!animeList || animeList.length === 0) return [];
    return shuffleSeed > 0 ? seededShuffle(animeList, shuffleSeed) : animeList;
  }, [animeList, shuffleSeed]);

  return (
    <Layout
      flush
      title="Anime"
      description={`Anime on ${BRAND.name}: simulcasts, top rated shonen, seinen and fantasy streaming directly from AniList.`}
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
          title="All Anime"
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

        <div style={{ display: "grid", gap: 12, marginTop: 16, marginBottom: 24 }}>
          <Chips
            label="Studio"
            options={ANIME_STUDIOS}
            value={studio}
            onChange={handleStudioChange}
          />
          <Chips
            label="Sub-genre"
            options={ANIME_SUBGENRES}
            value={subgenre}
            onChange={handleSubgenreChange}
          />
        </div>

        {animeLoading ? (
          <SkeletonGrid count={12} wide={true} />
        ) : animeError ? (
          <Empty
            title={isOffline ? "You appear to be offline" : "Couldn't load anime"}
            text={
              isOffline
                ? "Reconnect to the internet to browse anime from AniList."
                : "There was a problem loading anime from AniList. Please try again."
            }
            actionLabel="Try again"
            onAction={() => setRetryCount((c) => c + 1)}
          />
        ) : displayedAnime.length > 0 ? (
          <>
            <TitleGrid items={displayedAnime} wide={true} />

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
                    <span>Loading more anime...</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <Empty
            title="No anime found"
            text="No anime match your selected filters. Try resetting studio, sub-genre or year."
            actionLabel={activeFilterCount > 0 ? "Reset filters" : undefined}
            onAction={activeFilterCount > 0 ? handleResetFilters : undefined}
          />
        )}
      </section>

      {topLoading ? (
        <SkeletonRow title="Top 10 Anime" count={6} wide={true} />
      ) : topItems.length > 0 ? (
        <MediaRow title="Top 10 Anime">
          {topItems.map((t, i) => (
            <MediaCard
              key={t.id || t.anilistId}
              title={t}
              rank={i + 1}
              badge={t.badge || (Number(t.rating) > 0 ? `★ ${t.rating}` : undefined)}
            />
          ))}
        </MediaRow>
      ) : null}

      {trendingLoading ? (
        <SkeletonRow title="Trending now" count={6} wide={true} />
      ) : trendingItems.length > 0 ? (
        <MediaRow title="Trending now">
          {trendingItems.map((t) => (
            <MediaCard
              key={t.id || t.anilistId}
              title={t}
              badge={t.badge || "Trending"}
            />
          ))}
        </MediaRow>
      ) : null}
    </Layout>
  );
}

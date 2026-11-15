import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import Layout from "../components/Layout";
import { PageHead, Chips, TitleGrid, Empty, FilterDropdown } from "../components/Page";
import pageStyles from "../components/Page.module.css";
import { SkeletonGrid } from "../components/Skeleton";
import TileRow from "../components/TileRow";
import { SERVICES, STUDIOS, getService, getStudio } from "../lib/constants";
import { mergeUniqueMediaPage } from "../lib/catalogHelpers";

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 1800,
  };
}

const TYPES = [
  { value: "all", label: "Everything" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
  { value: "anime", label: "Anime" },
];

const SORTS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "primary_release_date.desc", label: "Release Date" },
  { value: "title.asc", label: "Title (A-Z)" },
];

export default function Discover() {
  const router = useRouter();
  const { query, replace, isReady } = router;
  const type = typeof query.type === "string" ? query.type : "all";
  const service = typeof query.service === "string" ? query.service : "all";
  const studio = typeof query.studio === "string" ? query.studio : "all";
  const sortBy = typeof query.sort_by === "string" ? query.sort_by : "popularity.desc";
  const [sortOpen, setSortOpen] = useState(false);

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  const sentinelRef = useRef(null);
  const itemsRef = useRef([]);
  const loadingMoreRef = useRef(false);
  const pageAbortRef = useRef(null);

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

  // Fetch initial page 1 after router isReady on filter/sort change
  useEffect(() => {
    if (!isReady) return;

    let active = true;
    const controller = new AbortController();
    pageAbortRef.current?.abort();
    pageAbortRef.current = null;
    loadingMoreRef.current = false;

    setLoading(true);
    setError(false);
    setLoadingMore(false);
    setPage(1);
    setHasMore(true);

    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (service !== "all") params.set("service", service);
    if (studio !== "all") params.set("studio", studio);
    if (sortBy) params.set("sort_by", sortBy);
    params.set("page", "1");

    const endpoint =
      type === "anime"
        ? `/api/anilist/discover?${params.toString()}`
        : `/api/tmdb/discover?${params.toString()}`;

    fetch(endpoint, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        const arr = Array.isArray(data) ? data : [];
        itemsRef.current = arr;
        setItems(arr);
        setLoading(false);
        setError(false);
        if (arr.length === 0 || arr.length < 18) setHasMore(false);
      })
      .catch((err) => {
        if (!active || err?.name === "AbortError") return;
        itemsRef.current = [];
        setItems([]);
        setLoading(false);
        setError(true);
        setHasMore(false);
      });

    return () => {
      active = false;
      controller.abort();
      pageAbortRef.current?.abort();
    };
  }, [isReady, type, service, studio, sortBy, retryCount]);

  // Load next page function
  const loadNextPage = useCallback(() => {
    const maxPage = type === "anime" ? 50 : 500;
    if (loading || loadingMoreRef.current || !hasMore || page >= maxPage) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;

    const controller = new AbortController();
    pageAbortRef.current?.abort();
    pageAbortRef.current = controller;

    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (service !== "all") params.set("service", service);
    if (studio !== "all") params.set("studio", studio);
    if (sortBy) params.set("sort_by", sortBy);
    params.set("page", String(nextPage));

    const endpoint =
      type === "anime"
        ? `/api/anilist/discover?${params.toString()}`
        : `/api/tmdb/discover?${params.toString()}`;

    fetch(endpoint, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        if (arr.length === 0) {
          setHasMore(false);
          loadingMoreRef.current = false;
          setLoadingMore(false);
          return;
        }

        const { items: merged, addedCount } = mergeUniqueMediaPage(itemsRef.current, arr);
        itemsRef.current = merged;
        setItems(merged);
        setPage(nextPage);

        if (nextPage >= maxPage || arr.length < 18 || addedCount === 0) {
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
  }, [loading, hasMore, page, type, service, studio, sortBy]);

  // Infinite scroll intersection observer
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: "450px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadNextPage]);

  const setParam = (key, value) => {
    const next = { ...query };
    if (!value || value === "all" || (key === "sort_by" && value === "popularity.desc")) {
      delete next[key];
    } else {
      next[key] = value;
    }
    replace({ pathname: "/discover", query: next }, undefined, { shallow: true });
  };

  const hasActiveFilters =
    type !== "all" ||
    service !== "all" ||
    studio !== "all" ||
    sortBy !== "popularity.desc";

  const handleResetAll = () => {
    setSortOpen(false);
    replace({ pathname: "/discover" }, undefined, { shallow: true });
  };

  const crumbs = [
    service !== "all" && getService(service)?.name,
    studio !== "all" && getStudio(studio)?.name,
  ].filter(Boolean);

  return (
    <Layout title="Discover" description="Browse the catalogue by format, service and studio dynamically via TMDB.">
      <div className="pageInner" style={{ paddingBottom: 96 }}>
        <PageHead
          title="Discover"
          sub={crumbs.length ? crumbs.join(" · ") : "Filter the whole catalogue by format, service and studio directly from TMDB."}
        />

        {/* Visual studio logo row when all studios selected */}
        {studio === "all" && (
          <div style={{ marginBottom: 28 }}>
            <TileRow title="Browse by studio" items={STUDIOS} param="studio" />
          </div>
        )}

        {/* Filter Chips & Sort Controls */}
        <div style={{ display: "grid", gap: 14, marginBottom: 24 }}>
          <Chips label="Format" options={TYPES} value={type} onChange={(v) => setParam("type", v)} />
          <Chips
            label="Service"
            options={[{ value: "all", label: "All services" }, ...SERVICES.map((s) => ({ value: s.id, label: s.name }))]}
            value={service}
            onChange={(v) => setParam("service", v)}
          />
          <Chips
            label="Studio"
            options={[{ value: "all", label: "All studios" }, ...STUDIOS.map((s) => ({ value: s.id, label: s.name }))]}
            value={studio}
            onChange={(v) => setParam("studio", v)}
          />
        </div>

        {/* Sort & Count Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 24,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>
            {items.length > 0 ? `${items.length} titles loaded` : ""}
          </span>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <FilterDropdown
              filterKey="Sort"
              options={SORTS}
              value={sortBy}
              allowAllOption={false}
              onChange={(_, val) => setParam("sort_by", val)}
              isOpen={sortOpen}
              onToggle={() => setSortOpen(!sortOpen)}
              onClose={() => setSortOpen(false)}
            />

            {hasActiveFilters && (
              <button
                type="button"
                className={pageStyles.resetBtn}
                onClick={handleResetAll}
                aria-label="Reset all discover filters"
              >
                <RotateCcw size={14} strokeWidth={1.75} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <SkeletonGrid count={12} wide={false} />
        ) : error ? (
          <Empty
            title={isOffline ? "You appear to be offline" : "Couldn't load discover catalog"}
            text={
              isOffline
                ? "Reconnect to the internet to explore titles."
                : "There was a problem loading titles. Please try again."
            }
            actionLabel="Try again"
            onAction={() => setRetryCount((c) => c + 1)}
          />
        ) : items.length > 0 ? (
          <>
            <TitleGrid items={items} />

            {/* Scroll Sentinel for infinite loading */}
            {hasMore && (
              <div ref={sentinelRef} style={{ height: 40, margin: "24px 0" }}>
                {loadingMore && <SkeletonGrid count={6} wide={false} />}
              </div>
            )}
          </>
        ) : (
          <Empty
            title="No matches"
            text="That combination has no titles. Clear a filter to widen the search."
            actionLabel={hasActiveFilters ? "Reset filters" : undefined}
            onAction={hasActiveFilters ? handleResetAll : undefined}
          />
        )}
      </div>
    </Layout>
  );
}

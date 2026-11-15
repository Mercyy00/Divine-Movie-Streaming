import { useRouter } from "next/router";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import { TitleGrid, Empty } from "../../components/Page";
import { SkeletonGrid } from "../../components/Skeleton";
import { getCardMap } from "../../lib/data.server";
import { useCustomLists, entryCard, entryId } from "../../lib/store";
import { formatRelativeUpdated } from "../../lib/accountHelpers";
import { useToast } from "../../lib/useToast";
import { ChevronLeft, Share2, User, Globe, Lock } from "lucide-react";
import styles from "../../styles/Lists.module.css";

export async function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}

export async function getStaticProps() {
  const data = getCardMap();
  return {
    props: {
      ...data,
    },
    revalidate: 1800,
  };
}

export default function CustomListPage({ cardMap = {} }) {
  const router = useRouter();
  const { id } = router.query;
  const [customLists] = useCustomLists();
  const [listData, setListData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvedRemoteCards, setResolvedRemoteCards] = useState({});
  const fetchingIdsRef = useRef(new Set());
  const [toast, showToast] = useToast(2500);

  useEffect(() => {
    if (!router.isReady || !id) return;

    let active = true;
    setLoading(true);

    const resolveLocal = () => {
      const local = (customLists || []).find((l) => l.id === id);
      if (!local) return null;
      return {
        id: local.id,
        name: local.name,
        description: local.description || "",
        isPublic: local.isPublic !== false,
        updatedAt: local.updatedAt || local.createdAt || null,
        items: (local.items || []).map((it) => (typeof it === "object" ? it : { id: it })),
        user: { name: "You" },
      };
    };

    const local = resolveLocal();
    if (local) {
      setListData(local);
      setLoading(false);
      return;
    }

    // 1. Try to fetch shared/server list from API
    fetch(`/api/user/list?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        setListData(data || null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setListData(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router.isReady, id, customLists]);

  useEffect(() => {
    const items = listData?.items || [];
    if (!items.length) return;
    const missing = [];
    for (const entry of items) {
      const direct = entryCard(entry);
      if (direct && (direct.title || direct.poster || direct.backdrop)) continue;
      const tid = entryId(entry);
      if (!tid) continue;
      const key = String(tid).toLowerCase();
      if (cardMap[key] || resolvedRemoteCards[key] || fetchingIdsRef.current.has(key)) continue;
      fetchingIdsRef.current.add(key);
      missing.push({
        id: String(tid),
        key,
        type: typeof entry === "object" ? entry?.type : null,
      });
    }
    if (!missing.length) return;
    let cancelled = false;
    missing.slice(0, 16).forEach(async ({ id: tid, key, type }) => {
      try {
        let fetched = null;
        if (tid.startsWith("al-")) {
          const alRes = await fetch(`/api/anilist/details?id=${encodeURIComponent(tid.slice(3))}`);
          if (alRes.ok) fetched = await alRes.json();
        } else {
          const hint = type === "series" || type === "tv" ? "&type=tv" : type === "movie" ? "&type=movie" : "";
          const tmdbRes = await fetch(`/api/tmdb/details?id=${encodeURIComponent(tid)}${hint}`);
          if (tmdbRes.ok) fetched = await tmdbRes.json();
        }
        if (!cancelled && fetched && (fetched.title || fetched.name || fetched.poster)) {
          setResolvedRemoteCards((prev) => ({
            ...prev,
            [key]: { ...fetched, id: fetched.id || tid },
          }));
        }
      } catch {}
    });
    return () => {
      cancelled = true;
    };
  }, [listData?.items, cardMap, resolvedRemoteCards]);

  const resolvedItems = useMemo(() => {
    return (listData?.items || [])
      .map((entry) => {
        const direct = entryCard(entry);
        if (direct && (direct.title || direct.poster || direct.backdrop)) return direct;
        const tid = entryId(entry);
        if (!tid) return null;
        const key = String(tid).toLowerCase();
        return (
          cardMap[key] ||
          resolvedRemoteCards[key] || {
            id: String(tid),
            title: `Title #${tid}`,
            type: typeof entry === "object" && entry?.type ? entry.type : "movie",
            poster: "",
            backdrop: "",
          }
        );
      })
      .filter(Boolean);
  }, [listData?.items, cardMap, resolvedRemoteCards]);

  const updatedLabel = formatRelativeUpdated(listData?.updatedAt);

  const handleShare = () => {
    if (typeof window !== "undefined" && navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast("List link copied to clipboard");
    }
  };

  return (
    <Layout
      title={listData ? listData.name : "Custom List"}
      description={listData?.description || "Curated list on DIVINE."}
    >
      <div className="pageInner" style={{ padding: "40px var(--page-pad) 80px", maxWidth: "var(--page-max)", margin: "0 auto" }}>
        {/* Back navigation */}
        <Link
          href="/lists"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "rgba(255,255,255,0.7)",
            fontSize: 14,
            marginBottom: 24,
            textDecoration: "none",
          }}
        >
          <ChevronLeft size={16} />
          <span>All lists</span>
        </Link>

        {loading ? (
          <SkeletonGrid count={8} wide={true} />
        ) : listData ? (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: 16,
                marginBottom: 32,
                paddingBottom: 20,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div>
                <h1 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
                  {listData.name}
                </h1>
                {listData.description && (
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, margin: "8px 0 0", maxWidth: 600 }}>
                    {listData.description}
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12, color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <User size={14} />
                    <span>Created by {listData.user?.name || "Community member"}</span>
                  </span>
                  <span>·</span>
                  <span>{resolvedItems.length} {resolvedItems.length === 1 ? "title" : "titles"}</span>
                  {updatedLabel && (
                    <>
                      <span>·</span>
                      <span>{updatedLabel}</span>
                    </>
                  )}
                  <span>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {listData.isPublic === false ? <Lock size={12} /> : <Globe size={12} />}
                    <span>{listData.isPublic === false ? "Private" : "Public"}</span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleShare}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "var(--g-fill, rgba(255,255,255,0.1))",
                  border: "1px solid var(--g-edge, rgba(255,255,255,0.16))",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Share2 size={15} />
                <span>Share list</span>
              </button>
            </div>

            {resolvedItems.length > 0 ? (
              <TitleGrid items={resolvedItems} wide={true} />
            ) : (
              <Empty
                title="This list is empty"
                text="The creator hasn't added any titles to this list yet."
                href="/discover"
                cta="Discover titles"
              />
            )}
          </div>
        ) : (
          <Empty
            title="List not found"
            text="The requested list could not be found or is private."
            href="/lists"
            cta="Back to My list"
          />
        )}
      </div>

      {toast && <div className={styles.cardToast}>{toast}</div>}
    </Layout>
  );
}

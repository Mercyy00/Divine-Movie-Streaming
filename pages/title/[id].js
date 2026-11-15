import { useState, useRef, useMemo, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Play,
  Film,
  Plus,
  Check,
  MoreHorizontal,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  ThumbsDown,
  ThumbsUp,
  Heart,
  Clapperboard,
  Bell,
  List,
  Search,
  ArrowUpDown,
  Share2,
} from "lucide-react";
import Layout from "../../components/Layout";
import LoadingScreen from "../../components/LoadingScreen";
import { Empty } from "../../components/Page";
import {
  getService,
  getStudio,
  runtimeLabel,
  formatDate,
} from "../../lib/constants";
import { getAllCardTitles, getTitle } from "../../lib/data.server";
import { fetchLiveTitle } from "../../lib/tmdb";
import { fetchAniListDetails, extractAniListId } from "../../lib/anilist";
import { resolveMediaIdentifiers } from "../../lib/servers";
import { buildTitleMetaParts, getSeasonEpisodeCount } from "../../lib/watchHelpers";
import { useToast } from "../../lib/useToast";
import {
  useList,
  useHistory,
  useCustomLists,
  useReactions,
  useSchedule,
  toggleScheduleItem,
  toggleCustomListItem,
  createCustomList,
  useWatchedEpisodes,
  toggleWatchedEpisode,
  useUserRatings,
  setUserRating,
  inList,
  toggleListEntry,
  useSettings,
} from "../../lib/store";
import styles from "../../styles/Title.module.css";

function formatEpDate(airDate) {
  if (!airDate) return "";
  if (/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/.test(airDate)) return airDate;
  const d = new Date(airDate);
  if (isNaN(d.getTime())) return airDate;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getStaticPaths() {
  return {
    paths: getAllCardTitles().map((t) => ({ params: { id: t.id } })),
    fallback: "blocking",
  };
}

export async function getStaticProps({ params }) {
  const { id } = params;
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_.-]{1,200}$/.test(id)) {
    return { notFound: true };
  }

  let t = getTitle(id);

  const anilistId = extractAniListId(id);
  const isAniListExplicit =
    Boolean(anilistId) ||
    id.startsWith("anilist-") ||
    id.startsWith("anime-");

  const isAnime = isAniListExplicit || t?.type === "anime";
  const isSeries = t ? (t.type === "series" || t.type === "anime") : (id.startsWith("tv-") || id.startsWith("series-") || isAnime);

  // Check if seasons are dummy/incomplete (missing seasons, placeholder names without posters/airDates)
  const hasIncompleteSeasons =
    isSeries &&
    (!t?.seasonsList ||
      t.seasonsList.length <= 1 ||
      t.seasonsList.some(
        (s) =>
          s.seasonNumber > 1 &&
          (!s.poster || s.poster === t?.poster || s.name === `Season ${s.seasonNumber}`)
      ));

  if (isAniListExplicit) {
    if (!t || !t.cast || !t.episodes || t.episodes.length === 0 || hasIncompleteSeasons) {
      try {
        const liveAnime = await fetchAniListDetails(id);
        if (liveAnime) {
          const preservedTmdbId = t?.tmdbId || liveAnime?.tmdbId || null;
          const maxSeasons = Math.max(
            typeof t?.seasons === "number" ? t.seasons : 0,
            typeof t?.numberOfSeasons === "number" ? t.numberOfSeasons : 0,
            typeof liveAnime?.seasons === "number" ? liveAnime.seasons : 0,
            typeof liveAnime?.numberOfSeasons === "number" ? liveAnime.numberOfSeasons : 0,
            Array.isArray(t?.seasonsList) ? t.seasonsList.length : 0,
            Array.isArray(liveAnime?.seasonsList) ? liveAnime.seasonsList.length : 0,
            1
          );

          t = {
            ...(t || {}),
            ...liveAnime,
            tmdbId: preservedTmdbId,
            seasons: maxSeasons,
            numberOfSeasons: maxSeasons,
            seasonsList:
              liveAnime.seasonsList && liveAnime.seasonsList.length >= (t?.seasonsList?.length || 0)
                ? liveAnime.seasonsList
                : t?.seasonsList || null,
          };
        }
      } catch (e) {
        console.error("AniList live fetch error in getStaticProps:", e.message || e);
      }
    }
  } else {
    if (!t || !t.cast || !t.videos || hasIncompleteSeasons || !t.watchProviders) {
      let type = isSeries ? "tv" : "movie";
      let tmdbId = id;
      if (id.startsWith("movie-")) {
        type = "movie";
        tmdbId = id.replace("movie-", "");
      } else if (id.startsWith("tv-") || id.startsWith("series-")) {
        type = "tv";
        tmdbId = id.replace(/^(tv|series)-/, "");
      } else if (t?.tmdbId) {
        type = isSeries ? "tv" : "movie";
        tmdbId = t.tmdbId;
      }

      try {
        const live = await fetchLiveTitle(type || "any", tmdbId);
        if (live) {
          t = {
            ...(t || {}),
            ...live,
            tmdbId: live.tmdbId || t?.tmdbId || null,
            seasons: live.seasons || t?.seasons || 1,
            numberOfSeasons: live.numberOfSeasons || t?.numberOfSeasons || 1,
            seasonsList: live.seasonsList || t?.seasonsList || null,
            watchProviders: live.watchProviders || t?.watchProviders || null,
            director: live.director || t?.director || null,
            directors: live.directors || t?.directors || null,
          };
        } else if (!t) {
          const fallbackType = type === "movie" ? "tv" : "movie";
          const altLive = await fetchLiveTitle(fallbackType, tmdbId);
          if (altLive) t = altLive;
        }
      } catch (e) {
        console.error("Live fetch error in getStaticProps:", e.message || e);
      }
    }
  }

  if (!t) {
    return { notFound: true };
  }

  if (!t.recommendations || t.recommendations.length === 0) {
    const all = getAllCardTitles();
    t = {
      ...t,
      recommendations: all
        .filter((x) => x.id !== t.id && x.type === t.type && x.status !== "upcoming")
        .map((x) => ({
          item: x,
          score: (x.genres || []).filter((g) => (t.genres || []).includes(g)).length,
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || (b.item.rating || 0) - (a.item.rating || 0))
        .map((entry) => entry.item)
        .slice(0, 12),
    };
  }

  return {
    props: {
      initialTitle: t,
      id,
    },
    revalidate: 1800,
  };
}

export default function TitlePage(props) {
  return <TitlePageForRoute key={props.id} {...props} />;
}

function TitlePageForRoute({ initialTitle, id }) {
  const router = useRouter();
  const [liveTitle, setLiveTitle] = useState(initialTitle);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    if ((!liveTitle || !liveTitle.watchProviders) && id) {
      fetchedRef.current = true;
      const isAnime = /^\d+$/.test(id) || id.startsWith("anilist-") || id.startsWith("anime-");
      const url = isAnime
        ? `/api/anilist/details?id=${encodeURIComponent(id)}`
        : `/api/tmdb/details?id=${encodeURIComponent(id)}`;

      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && data.title) {
            setLiveTitle((prev) => ({ ...(prev || {}), ...data }));
          } else if (!liveTitle) {
            setError(true);
          }
        })
        .catch(() => {
          if (!liveTitle) setError(true);
        });
    }
  }, [id, liveTitle]);

  const t = liveTitle || initialTitle;

  if (router.isFallback || (!t && !error)) {
    return (
      <Layout flush title="Loading Title · DIVINE">
        <LoadingScreen minHeight="85vh" message="Loading title details…" />
      </Layout>
    );
  }

  if (!t) {
    return (
      <Layout title="Title Not Found · DIVINE">
        <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <h2>Title not found</h2>
          <p style={{ color: "var(--text-dim)" }}>We could not find this title in the TMDB catalogue.</p>
          <Link href="/discover" style={{ padding: "10px 20px", borderRadius: "999px", background: "#fff", color: "#000", fontWeight: 600 }}>
            Browse Catalogue
          </Link>
        </div>
      </Layout>
    );
  }

  return <TitleContent t={t} id={id} />;
}

function TitleContent({ t, id }) {
  const router = useRouter();
  const [list, setList] = useList();
  const [, setHistory] = useHistory();
  const [customLists, setCustomLists] = useCustomLists();
  const [reactions, setReactions] = useReactions();
  const [watchedEpisodes, setWatchedEpisodes] = useWatchedEpisodes();
  const [userRatings, setUserRatings] = useUserRatings();
  const [schedule, setSchedule] = useSchedule();
  const [settings] = useSettings();
  const [revealedSpoilers, setRevealedSpoilers] = useState({});

  const hasEpisodes = Boolean(
    (t?.episodes && t.episodes.length > 0) || t?.type === "series" || t?.type === "anime"
  );
  const isSeries = t?.type === "series" || t?.type === "tv" || t?.type === "anime";

  const [activeTab, setActiveTab] = useState(hasEpisodes ? "episodes" : "related");
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonEpisodesMap, setSeasonEpisodesMap] = useState({});
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [epSearch, setEpSearch] = useState("");
  const [epSort, setEpSort] = useState("oldest"); // "oldest" | "newest"
  const [selectedEp, setSelectedEp] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null); // YouTube key
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [hoverListBtn, setHoverListBtn] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [newListName, setNewListName] = useState("");
  const [toast, showToast] = useToast(2500);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showSeasonModal, setShowSeasonModal] = useState(false);

  const relatedScrollRef = useRef(null);
  const moreLikeScrollRef = useRef(null);
  const moreMenuRef = useRef(null);
  const listMenuRef = useRef(null);
  const modalCloseRef = useRef(null);
  const lastFocusedRef = useRef(null);

  const seasonPickerRef = useRef(null);
  const seasonCardsRowRef = useRef(null);

  const seasonOptions = useMemo(() => {
    if (!t) return [];
    const totalSeasons = Math.max(
      typeof t.seasons === "number" ? t.seasons : 0,
      typeof t.numberOfSeasons === "number" ? t.numberOfSeasons : 0,
      Array.isArray(t.seasonsList) ? t.seasonsList.length : 0,
      1
    );

    const existingList = Array.isArray(t.seasonsList) ? t.seasonsList : [];
    const listMap = new Map();
    existingList.forEach((s, idx) => {
      const sNum = s.seasonNumber || idx + 1;
      const loadedEps = seasonEpisodesMap[sNum];
      const count =
        loadedEps && loadedEps.length > 0
          ? loadedEps.length
          : s.episodeCount || (Array.isArray(s.episodes) ? s.episodes.length : 0);

      listMap.set(sNum, {
        seasonNumber: sNum,
        name: s.name || `Season ${sNum}`,
        episodeCount: count,
        year: s.year || (s.airDate ? s.airDate.slice(0, 4) : t.year) || null,
        poster: s.poster || t.poster,
      });
    });

    const options = [];
    for (let i = 1; i <= totalSeasons; i++) {
      if (listMap.has(i)) {
        options.push(listMap.get(i));
      } else {
        const loadedEps = seasonEpisodesMap[i];
        options.push({
          seasonNumber: i,
          name: t.status === "upcoming" && totalSeasons === 1 ? "Miniseries" : `Season ${i}`,
          episodeCount: loadedEps && loadedEps.length > 0 ? loadedEps.length : 0,
          year: t.year || null,
          poster: t.poster,
        });
      }
    }
    return options;
  }, [t, seasonEpisodesMap]);

  const currentSeasonObj = useMemo(() => {
    return (
      seasonOptions.find((s) => s.seasonNumber === selectedSeason) ||
      seasonOptions[0] || {
        seasonNumber: selectedSeason,
        name: `Season ${selectedSeason}`,
        episodeCount: 0,
        year: t?.year,
        poster: t?.poster,
      }
    );
  }, [seasonOptions, selectedSeason, t?.year, t?.poster]);

  const activeSeasonIndex = useMemo(() => {
    const idx = seasonOptions.findIndex((s) => s.seasonNumber === selectedSeason);
    return idx >= 0 ? idx : 0;
  }, [seasonOptions, selectedSeason]);

  const navigateSeason = (dir) => {
    const newIndex = activeSeasonIndex + dir;
    if (newIndex >= 0 && newIndex < seasonOptions.length) {
      setSelectedSeason(seasonOptions[newIndex].seasonNumber);
    }
  };

  // Close season modal popover on outside click, or keyboard controls
  useEffect(() => {
    if (!showSeasonModal) return;
    const handleDown = (e) => {
      if (seasonPickerRef.current && !seasonPickerRef.current.contains(e.target)) {
        setShowSeasonModal(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        setShowSeasonModal(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIdx = activeSeasonIndex - 1;
        if (prevIdx >= 0 && seasonOptions[prevIdx]) {
          setSelectedSeason(seasonOptions[prevIdx].seasonNumber);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIdx = activeSeasonIndex + 1;
        if (nextIdx < seasonOptions.length && seasonOptions[nextIdx]) {
          setSelectedSeason(seasonOptions[nextIdx].seasonNumber);
        }
      }
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [showSeasonModal, activeSeasonIndex, seasonOptions]);

  // Dynamically load episodes when season changes
  useEffect(() => {
    if (!t || (t.type !== "series" && t.type !== "anime")) return;
    if (selectedSeason === 1 && t.episodes && t.episodes.length > 0) return;
    if (seasonEpisodesMap[selectedSeason]) return;

    const { numericTmdbId } = resolveMediaIdentifiers({
      id: t.id,
      tmdbId: t.tmdbId,
      anilistId: t.anilistId,
      type: t.type,
    });
    if (!numericTmdbId) return;

    let active = true;
    setLoadingSeason(true);
    fetch(`/api/tmdb/season?tvId=${numericTmdbId}&season=${selectedSeason}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.episodes) return;
        setSeasonEpisodesMap((prev) => ({
          ...prev,
          [selectedSeason]: data.episodes,
        }));
        setLoadingSeason(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Season fetch error:", err);
        setLoadingSeason(false);
      });

    return () => {
      active = false;
    };
  }, [t, selectedSeason, seasonEpisodesMap]);

  const watchedList =
    (t?.id && watchedEpisodes?.[t.id]) !== undefined
      ? watchedEpisodes[t.id]
      : [];

  const isEpWatched = (seasonNum, epNum) => {
    const num = Number(epNum);
    const key = `s${seasonNum}_e${num}`;
    return (watchedList || []).some((item) => {
      const s = String(item);
      if (seasonNum === 1 && (Number(item) === num || s === String(num) || s === key)) return true;
      return s === key || (seasonOptions.length === 1 && (Number(item) === num || s === String(num)));
    });
  };

  const allEpisodes = useMemo(() => {
    if (!t) return [];
    if (seasonEpisodesMap[selectedSeason] && seasonEpisodesMap[selectedSeason].length > 0) {
      return seasonEpisodesMap[selectedSeason];
    }
    if (selectedSeason === 1) {
      if (t.episodes && t.episodes.length > 0) return t.episodes;
      if (t.seasons?.[0]?.episodes) return t.seasons[0].episodes;
    }
    const targetSeasonObj = seasonOptions.find((s) => s.seasonNumber === selectedSeason);
    const count = getSeasonEpisodeCount(t, selectedSeason);
    if (!count) return [];
    const fallbackEps = [];
    for (let i = 1; i <= count; i++) {
      fallbackEps.push({
        episodeNumber: i,
        title: `Episode ${i}`,
        overview: `${targetSeasonObj?.name || `Season ${selectedSeason}`}, Episode ${i}`,
        still: targetSeasonObj?.poster || t.backdrop || t.poster,
        runtime: t.runtime || null,
      });
    }
    return fallbackEps;
  }, [t, selectedSeason, seasonEpisodesMap, seasonOptions]);

  const displayedEpisodes = useMemo(() => {
    let list = [...allEpisodes];
    if (epSearch.trim()) {
      const q = epSearch.trim().toLowerCase();
      list = list.filter(
        (ep) =>
          (ep.title && ep.title.toLowerCase().includes(q)) ||
          String(ep.episodeNumber ?? ep.episode_number ?? "").includes(q) ||
          (ep.overview && ep.overview.toLowerCase().includes(q))
      );
    }

    const getEpNum = (ep) => {
      if (typeof ep?.episodeNumber === "number" && !isNaN(ep.episodeNumber)) return ep.episodeNumber;
      if (typeof ep?.episode_number === "number" && !isNaN(ep.episode_number)) return ep.episode_number;
      if (ep?.episodeNumber) {
        const n = parseInt(String(ep.episodeNumber).replace(/\D+/g, ""), 10);
        if (!isNaN(n)) return n;
      }
      if (ep?.episode_number) {
        const n = parseInt(String(ep.episode_number).replace(/\D+/g, ""), 10);
        if (!isNaN(n)) return n;
      }
      if (ep?.title) {
        const m = String(ep.title).match(/Episode\s*(\d+)/i) || String(ep.title).match(/^(\d+)/);
        if (m && m[1]) return parseInt(m[1], 10);
      }
      return 0;
    };

    // Always sort numerically by episode number:
    // "oldest": Episode 1 is 1st (1, 2, 3... N)
    // "newest": That season's last episode is 1st (N, N-1, ... 2, 1)
    list.sort((a, b) => {
      const aNum = getEpNum(a);
      const bNum = getEpNum(b);
      return epSort === "newest" ? bNum - aNum : aNum - bNum;
    });

    return list;
  }, [allEpisodes, epSearch, epSort]);

  const watchedCount = allEpisodes.filter((ep) =>
    isEpWatched(selectedSeason, ep.episodeNumber)
  ).length;

  const [history] = useHistory();
  const historyEntry = useMemo(() => {
    if (!t?.id || !history) return null;
    const normalizeId = (id) => String(id || "").toLowerCase().replace(/^(movie|series|tv|anime)-/, "");
    const ids = new Set([t.id, normalizeId(t.id), t.tmdbId && String(t.tmdbId)].filter(Boolean).map(String));
    return (history || []).find((entry) => {
      const card = entry?.title && typeof entry.title === "object" ? entry.title : null;
      return [entry?.id, card?.id, card?.tmdbId]
        .filter(Boolean)
        .some((id) => ids.has(String(id)) || ids.has(normalizeId(id)));
    });
  }, [t?.id, t?.tmdbId, history]);

  const resumeInfo = useMemo(() => {
    if (!historyEntry || !historyEntry.progress || historyEntry.progress <= 0 || historyEntry.progress >= 1) {
      return null;
    }
    const prog = historyEntry.progress;
    const isSeries = t?.type === "series" || t?.type === "tv" || t?.type === "anime";
    const sNum = historyEntry.season || selectedSeason || 1;
    const epNum = historyEntry.episode || 1;
    const remMins = t?.runtime ? Math.max(1, Math.round(t.runtime * (1 - prog))) : null;
    const remStr = remMins
      ? remMins >= 60
        ? `${Math.floor(remMins / 60)}h ${remMins % 60}m left`
        : `${remMins} min left`
      : null;

    return {
      progress: prog,
      season: sNum,
      episode: epNum,
      label: "Resume",
      continueText: isSeries
        ? `Continue S${sNum} E${epNum}${remStr ? ` ${remStr}` : ""}`
        : `Continue watching${remStr ? ` ${remStr}` : ""}`,
      remainingLabel: remStr,
      watchUrl: isSeries ? `/watch/${t.id}?season=${sNum}&episode=${epNum}` : `/watch/${t.id}`,
    };
  }, [historyEntry, t, selectedSeason]);

  const getSeasonWatchedCount = (seasonNumber) => {
    const loadedEps = seasonEpisodesMap[seasonNumber];
    const eps =
      loadedEps && loadedEps.length > 0
        ? loadedEps
        : seasonNumber === 1 && t?.episodes && t.episodes.length > 0
        ? t.episodes
        : [];
    if (eps.length > 0) {
      return eps.filter((ep) => isEpWatched(seasonNumber, ep.episodeNumber)).length;
    }
    return (watchedList || []).filter((item) => {
      const s = String(item);
      if (seasonNumber === 1 && !s.includes("_")) return true;
      return s.startsWith(`s${seasonNumber}_`);
    }).length;
  };

  const getEpProgress = (seasonNum, epNum) => {
    if (!history || !Array.isArray(history)) return null;
    const normalizeId = (id) => String(id || "").toLowerCase().replace(/^(movie|series|tv|anime)-/, "");
    const ids = new Set([t?.id, normalizeId(t?.id), t?.tmdbId && String(t?.tmdbId)].filter(Boolean).map(String));
    const entry = history.find((h) => {
      const card = h?.title && typeof h.title === "object" ? h.title : null;
      const matchId = [h?.id, card?.id, card?.tmdbId].filter(Boolean).some((id) => ids.has(String(id)) || ids.has(normalizeId(id)));
      if (!matchId) return false;
      const s = Number(h.season || 1);
      const e = Number(h.episode || 1);
      return s === Number(seasonNum) && e === Number(epNum);
    });
    if (entry && typeof entry.progress === "number" && entry.progress > 0 && entry.progress < 0.98) {
      return entry.progress;
    }
    return null;
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
      if (listMenuRef.current && !listMenuRef.current.contains(event.target)) {
        setShowListMenu(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setShowMoreMenu(false);
        setShowListMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!activeVideo) return;
    const timer = requestAnimationFrame(() => modalCloseRef.current?.focus());
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setActiveVideo(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(timer);
      window.removeEventListener("keydown", handleKey);
      lastFocusedRef.current?.focus?.();
    };
  }, [activeVideo]);

  const openTrailer = (videoKey) => {
    if (!videoKey) return;
    if (typeof document !== "undefined") {
      lastFocusedRef.current = document.activeElement;
    }
    setActiveVideo(videoKey);
  };

  const saved = inList(list, t?.id);
  const service = getService(t?.service);
  const studio = getStudio(t?.studio);
  const reaction = t?.id ? reactions?.[t.id] : null;
  const userRating = t?.id ? userRatings?.[t.id] : null;
  const isScheduled = useMemo(
    () => (schedule || []).some((item) => (typeof item === "object" ? item.id : item) === t?.id),
    [schedule, t?.id]
  );

  const heroEp = resumeInfo?.episode || selectedEp || 1;
  const heroSeason = resumeInfo?.season || selectedSeason || 1;
  const isHeroWatched = isSeries
    ? isEpWatched(heroSeason, heroEp)
    : (watchedList || []).some((item) => String(item) === "movie" || String(item) === "watched");

  const handleToggleHeroWatched = () => {
    if (!t?.id) return;
    if (isSeries) {
      const epKey = heroSeason > 1 ? `s${heroSeason}_e${heroEp}` : heroEp;
      const altKey = heroSeason === 1 ? `s1_e${heroEp}` : null;
      toggleWatchedEpisode(setWatchedEpisodes, t.id, epKey, altKey);
      showToast(
        isHeroWatched
          ? `Unmarked S${heroSeason} E${heroEp}`
          : `Marked S${heroSeason} E${heroEp} watched`
      );
    } else {
      toggleWatchedEpisode(setWatchedEpisodes, t.id, "movie", "watched");
      showToast(isHeroWatched ? "Removed from watched" : "Marked as watched");
    }
  };

  const handleShareTitle = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator?.share) {
      try {
        await navigator.share({ title: t.title, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    if (navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard");
        return;
      } catch {}
    }
    showToast("Copy link from address bar");
  };

  const metaParts = useMemo(() => buildTitleMetaParts(t, runtimeLabel(t)), [t]);

  const handleSetUserRating = (star) => {
    setUserRating(setUserRatings, t.id, star);
    showToast(star ? `Rated ${star}/10` : "Rating removed");
  };

  const comingLabel = useMemo(() => {
    if (!t) return null;
    if (t.nextEpisodeToAir?.airDate) {
      const sNum = t.nextEpisodeToAir.seasonNumber || 1;
      const eNum = t.nextEpisodeToAir.episodeNumber || 1;
      return `New episode ${formatEpDate(t.nextEpisodeToAir.airDate)} S${sNum}E${eNum}`;
    }
    if (t.upcomingPill) return t.upcomingPill;
    if (t.releaseDate && (t.status === "upcoming" || new Date(t.releaseDate) > new Date())) {
      return `${t.title} · coming ${formatDate(t.releaseDate)}`;
    }
    return null;
  }, [t]);

  const toggleReaction = (type) => {
    setReactions((prev) => ({
      ...(prev || {}),
      [t.id]: prev?.[t.id] === type ? null : type,
    }));
    setShowMoreMenu(false);
    const label =
      type === "dislike"
        ? "Marked as Not for me"
        : type === "like"
        ? reaction === "like"
          ? "Removed Like"
          : "Marked as I like this"
        : reaction === "love"
        ? "Removed from favorites"
        : "Added to favorites";
    showToast(label);
  };

  const handleNotifyMe = () => {
    if (!t?.id) return;
    toggleScheduleItem(setSchedule, t.id, {
      id: t.id,
      title: t.title,
      type: t.type,
      poster: t.poster || null,
      backdrop: t.backdrop || null,
      year: t.year || null,
      releaseDate: t.releaseDate || null,
      nextEpisodeToAir: t.nextEpisodeToAir || null,
    });
    setShowMoreMenu(false);
    showToast(isScheduled ? "Reminder removed" : "Reminder set for upcoming releases");
  };

  const handleScrollToEpisodes = () => {
    setShowMoreMenu(false);
    setActiveTab("episodes");
    setTimeout(() => {
      const el = document.getElementById("episodes-section") || document.querySelector(`.${styles.tabsBar}`);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleMoreLikeThis = () => {
    setShowMoreMenu(false);
    setActiveTab("related");
    setTimeout(() => {
      const el = document.getElementById("more-like-this");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleCreateList = (e) => {
    if (e) e.preventDefault();
    const trimmed = (newListName || "").trim();
    if (!trimmed) return;
    createCustomList(setCustomLists, trimmed, t);
    setNewListName("");
    showToast(`Added to "${trimmed}"`);
  };

  const scrollRelated = (direction) => {
    if (relatedScrollRef.current) {
      const offset = direction === "left" ? -400 : 400;
      relatedScrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  const scrollMoreLikeThis = (direction) => {
    if (moreLikeScrollRef.current) {
      const offset = direction === "left" ? -450 : 450;
      moreLikeScrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  // Actual similar movies/series: first priority TMDB recommendations
  const similar = useMemo(() => {
    return t?.recommendations || [];
  }, [t]);


  const overviewText = t.overview || "No overview available.";
  const showMoreToggle = overviewText.length > 170;
  const displayedOverview =
    !expanded && showMoreToggle
      ? overviewText.slice(0, 170) + "..."
      : overviewText;

  const schemaData = {
    "@context": "https://schema.org",
    "@type": t.type === "movie" ? "Movie" : "TVSeries",
    name: t.title,
    description: overviewText,
    image: t.poster || t.backdrop || "",
    datePublished: t.releaseDate || (t.year ? `${t.year}-01-01` : undefined),
    ...(t.director
      ? {
          director: {
            "@type": "Person",
            name: t.director,
          },
        }
      : {}),
    ...(t.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: t.rating,
            bestRating: 10,
            worstRating: 1,
            ...(t.ratingCount > 0 ? { ratingCount: t.ratingCount } : {}),
          },
        }
      : {}),
  };

  return (
    <Layout
      title={t.title}
      description={overviewText}
      image={t.poster || t.backdrop}
      type={t.type === "movie" ? "video.movie" : "video.tv_show"}
      flush
    >
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />
      </Head>
      {/* Hero Stage */}
      <section className={styles.hero}>
        {/* Isolated background layer with clipping */}
        <div className={styles.bgWrap}>
          {t.backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.backdrop}
              alt=""
              aria-hidden="true"
              decoding="async"
              loading="eager"
              referrerPolicy="no-referrer"
              className={styles.bg}
            />
          )}
          <div className={styles.fadeSide} />
          <div className={styles.fadeBottom} />
        </div>

        {/* Main Hero Card & Info */}
        <div className={styles.inner}>
          {/* Poster Card */}
          <div className={styles.posterWrap}>
            {t.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.poster}
                alt={t.title}
                decoding="async"
                loading="eager"
                referrerPolicy="no-referrer"
                className={styles.posterImg}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "var(--surface-3)" }} />
            )}
          </div>

          {/* Right Details */}
          <div className={styles.info}>
            {/* Logo or Wordmark Title */}
            <div className={styles.logoArea}>
              {t.logo && !logoFailed ? (
                <h1 className={styles.logoWrap} style={{ margin: 0, padding: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.logo}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className={styles.logoImg}
                    onError={() => setLogoFailed(true)}
                  />
                  <span className="visually-hidden">{t.title}</span>
                </h1>
              ) : (
                <h1 className={styles.titleText}>{t.title}</h1>
              )}
            </div>

            {/* Meta Row (Rating ring/pill, Year, Runtime, Cert, Quality when real) */}
            {metaParts.length > 0 && (
              <div className={styles.metaRow}>
                {metaParts.map((part, idx) => (
                  <span key={part.key} className={styles.metaPart}>
                    {idx > 0 && <span className={styles.dot} />}
                    {part.kind === "rating" && (
                      <span
                        className={styles.ratingPill}
                        title={`Rating: ${part.value.toFixed(1)}/10`}
                      >
                        {part.value.toFixed(1)}
                      </span>
                    )}
                    {part.kind === "text" && <span>{part.value}</span>}
                    {part.kind === "cert" && (
                      <span className={styles.certBadge}>
                        {part.value}
                      </span>
                    )}
                    {part.kind === "quality" && (
                      <span className={styles.qualityBadge}>{part.value}</span>
                    )}
                    {part.kind === "anilist" && (
                      <span className={styles.certBadge}>{part.value}</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Overview / Synopsis with "more" button */}
            <p className={styles.overviewBox}>
              {displayedOverview}
              {showMoreToggle && (
                <button
                  type="button"
                  className={styles.moreBtn}
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? "less" : "more"}
                </button>
              )}
            </p>

            {/* Upcoming Release Date Pill Banner matching user screenshot */}
            {comingLabel && (
              <div className={styles.comingBannerRow}>
                <span className={styles.releasePillBanner}>
                  <Calendar size={15} strokeWidth={1.75} />
                  <span>{comingLabel}</span>
                </span>
              </div>
            )}

            {resumeInfo && (
              <div className={styles.resumeInfo}>
                <div className={styles.resumeTrack} aria-label={`${Math.round(resumeInfo.progress * 100)}% watched`}>
                  <span style={{ width: `${Math.round(resumeInfo.progress * 100)}%` }} />
                </div>
                <span>{resumeInfo.continueText}</span>
              </div>
            )}

            {/* Genre / Tag Pills matching reference screenshot */}
            {t.genres && t.genres.length > 0 && (
              <div className={styles.pillsRow}>
                {t.genres.slice(0, 3).map((g) => (
                  <span key={g} className={styles.genrePill}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Action Buttons Row */}
            <div className={styles.actionsRow}>
              {/* Play or Resume Button */}
              {resumeInfo ? (
                <Link
                  href={resumeInfo.watchUrl}
                  className={styles.playBtn}
                  style={{ position: "relative", overflow: "hidden" }}
                >
                  <Play size={18} strokeWidth={1.75} fill="currentColor" />
                  <span>{resumeInfo.label}</span>
                </Link>
              ) : (
                <Link
                  href={isSeries ? `/watch/${t.id}?season=${selectedSeason || 1}&episode=${selectedEp || 1}` : `/watch/${t.id}`}
                  className={styles.playBtn}
                >
                  <Play size={18} strokeWidth={1.75} fill="currentColor" />
                  Play
                </Link>
              )}

              {/* Trailer Button */}
              {t.trailerKey && (
                <button
                  type="button"
                  className={styles.glassBtn}
                  onClick={() => openTrailer(t.trailerKey)}
                >
                  <Film size={18} strokeWidth={1.75} />
                  Trailer
                </button>
              )}

              {/* Watchlist / Save Button */}
              <button
                type="button"
                className={`${styles.glassBtn} ${saved ? styles.glassBtnActive : ""}`}
                aria-pressed={saved}
                onClick={() => {
                  toggleListEntry(setList, t.id, t);
                  showToast(saved ? "Removed from watchlist" : "Saved to watchlist");
                }}
              >
                {saved ? <Check size={18} strokeWidth={1.75} /> : <Plus size={18} strokeWidth={1.75} />}
                <span>{saved ? "Saved" : "Watchlist"}</span>
              </button>

              {/* Like Button */}
              <button
                type="button"
                className={`${styles.iconBtn} ${reaction === "like" ? styles.iconBtnActive : ""}`}
                onClick={() => toggleReaction("like")}
                aria-pressed={reaction === "like"}
                aria-label={reaction === "like" ? "Remove like" : "Like this title"}
                title={reaction === "like" ? "Liked" : "Like"}
              >
                <ThumbsUp size={18} strokeWidth={1.75} />
              </button>

              {/* Mark Watched Button */}
              <button
                type="button"
                className={`${styles.iconBtn} ${isHeroWatched ? styles.iconBtnActive : ""}`}
                onClick={handleToggleHeroWatched}
                aria-pressed={isHeroWatched}
                aria-label={isHeroWatched ? "Mark as unwatched" : "Mark as watched"}
                title={isHeroWatched ? "Watched" : "Mark as watched"}
              >
                <Check size={18} strokeWidth={1.75} />
              </button>

              {/* Share Button */}
              <button
                type="button"
                className={styles.iconBtn}
                onClick={handleShareTitle}
                aria-label="Share title"
                title="Share"
              >
                <Share2 size={18} strokeWidth={1.75} />
              </button>

              {/* Add to list Button & Dropdown */}
              <div
                className={styles.btnWrap}
                ref={listMenuRef}
                onMouseEnter={() => setHoverListBtn(true)}
                onMouseLeave={() => setHoverListBtn(false)}
              >
                <button
                  type="button"
                  className={`${styles.iconBtn} ${showListMenu ? styles.iconBtnActive : ""}`}
                  onClick={() => {
                    setShowListMenu((l) => !l);
                    setShowMoreMenu(false);
                  }}
                  aria-label="Add to list"
                  aria-haspopup="dialog"
                  aria-expanded={showListMenu}
                >
                  <ListPlus size={18} strokeWidth={1.75} />
                </button>

                {hoverListBtn && !showListMenu && (
                  <div className={styles.tooltipPill}>Add to list</div>
                )}

                {showListMenu && (
                  <div className={styles.listDropdown} role="dialog" aria-label="Add to custom list">
                    <h3 className={styles.listTitle}>Add to list</h3>
                    {customLists && customLists.length > 0 ? (
                      <div className={styles.listsContainer}>
                        {customLists.map((list) => {
                          const isSavedInList = inList(list.items, t.id);
                          return (
                            <button
                              key={list.id}
                              type="button"
                              className={`${styles.listItem} ${isSavedInList ? styles.listItemActive : ""}`}
                              onClick={() => {
                                toggleCustomListItem(setCustomLists, list.id, t.id, t);
                                showToast(
                                  isSavedInList ? `Removed from "${list.name}"` : `Added to "${list.name}"`
                                );
                              }}
                            >
                              <div className={styles.listItemLeft}>
                                <div className={`${styles.listCheckbox} ${isSavedInList ? styles.listCheckboxActive : ""}`}>
                                  {isSavedInList && <Check size={13} strokeWidth={2.25} color="#080808" />}
                                </div>
                                <span className={styles.listName}>{list.name}</span>
                              </div>
                              <span className={styles.listCount}>{list.items?.length || 0}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={styles.emptyListsText}>No lists yet</p>
                    )}

                    <form className={styles.newListRow} onSubmit={handleCreateList}>
                      <input
                        type="text"
                        placeholder="New list"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        className={styles.newListInput}
                        maxLength={32}
                      />
                      <button
                        type="submit"
                        className={styles.addListBtn}
                        aria-label="Create list"
                        title="Create list"
                      >
                        <Plus size={16} strokeWidth={1.75} />
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* More Options Button & Dropdown */}
              <div className={styles.btnWrap} ref={moreMenuRef}>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${showMoreMenu ? styles.iconBtnActive : ""}`}
                  onClick={() => {
                    setShowMoreMenu((m) => !m);
                    setShowListMenu(false);
                  }}
                  title="More options"
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={showMoreMenu}
                >
                  <MoreHorizontal size={18} strokeWidth={1.75} />
                </button>

                {showMoreMenu && (
                  <div className={styles.moreDropdown} role="menu" aria-label="More actions">
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${reaction === "dislike" ? styles.moreItemActive : ""}`}
                      onClick={() => toggleReaction("dislike")}
                    >
                      <ThumbsDown size={17} strokeWidth={1.75} />
                      <span>Not for me</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${reaction === "like" ? styles.moreItemActive : ""}`}
                      onClick={() => toggleReaction("like")}
                    >
                      <ThumbsUp size={17} strokeWidth={1.75} />
                      <span>I like this</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${reaction === "love" ? styles.moreItemActive : ""}`}
                      onClick={() => toggleReaction("love")}
                    >
                      <Heart size={17} strokeWidth={1.75} fill={reaction === "love" ? "currentColor" : "none"} />
                      <span>Love this</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.moreItem} ${isScheduled ? styles.moreItemActive : ""}`}
                      onClick={handleNotifyMe}
                    >
                      <Bell size={17} strokeWidth={1.75} />
                      <span>{isScheduled ? "Reminder set" : "Notify me"}</span>
                    </button>

                    {hasEpisodes && (
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.moreItem}
                        onClick={handleScrollToEpisodes}
                      >
                        <List size={17} strokeWidth={1.75} />
                        <span>Episodes</span>
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      className={styles.moreItem}
                      onClick={handleMoreLikeThis}
                    >
                      <Clapperboard size={17} strokeWidth={1.75} />
                      <span>More like this</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sub-Navigation Tabs Bar */}
      <nav className={styles.tabsBar} aria-label="Title sections">
        {hasEpisodes && (
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "episodes" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("episodes")}
          >
            Episodes
          </button>
        )}
        {hasEpisodes && (
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "ratings" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("ratings")}
          >
            Ratings
          </button>
        )}
        {!hasEpisodes && (
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "related" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("related")}
          >
            Related
          </button>
        )}
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "cast" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("cast")}
        >
          Cast
        </button>
        {hasEpisodes && (
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "related" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("related")}
          >
            Related
          </button>
        )}
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "trailers" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("trailers")}
        >
          Trailers
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "reviews" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("reviews")}
        >
          Reviews
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "about" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("about")}
        >
          About
        </button>
      </nav>

      {/* Tab Contents */}
      <div className={styles.tabContent}>
        {/* EPISODES TAB */}
        {activeTab === "episodes" && hasEpisodes && (
          <div>
            {/* Toolbar */}
            <div className={styles.episodesToolbar}>
              <div className={styles.episodesLeftControls}>
                <div className={styles.seasonPickerWrap} ref={seasonPickerRef}>
                  <button
                    type="button"
                    className={`${styles.seasonTriggerBtn} ${showSeasonModal ? styles.seasonTriggerActive : ""}`}
                    onClick={() => setShowSeasonModal((v) => !v)}
                    aria-haspopup="dialog"
                    aria-expanded={showSeasonModal}
                  >
                    <span>
                      {currentSeasonObj?.name || `Season ${selectedSeason}`}
                    </span>
                      <ChevronLeft size={15} strokeWidth={1.75} style={{ transform: showSeasonModal ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.2s ease" }} />
                  </button>

                  {showSeasonModal && (
                    <div className={styles.seasonModalPopover} role="dialog" aria-label="Select Season">
                      {/* Season Cards Carousel Track */}
                      <div className={styles.seasonCardsTrack}>
                        {/* Left Arrow */}
                        {seasonOptions.length > 1 && (
                          <button
                            type="button"
                            className={`${styles.seasonNavArrow} ${styles.seasonArrowLeft}`}
                            onClick={() => navigateSeason(-1)}
                            disabled={activeSeasonIndex <= 0}
                            aria-label="Previous Season"
                          >
                            <ChevronLeft size={16} strokeWidth={1.75} />
                          </button>
                        )}

                        <div
                          className={styles.seasonCardsRow}
                          ref={seasonCardsRowRef}
                          style={{
                            transform:
                              seasonOptions.length > 1
                                ? `translateX(-${activeSeasonIndex * 140 + 62}px)`
                                : "translateX(-50%)",
                            left: seasonOptions.length > 1 ? "50%" : "50%",
                          }}
                        >
                          {seasonOptions.map((s) => {
                            const isActive = s.seasonNumber === selectedSeason;
                            return (
                              <button
                                key={s.seasonNumber}
                                type="button"
                                data-active={isActive}
                                className={`${styles.seasonCardBtn} ${isActive ? styles.seasonCardActive : ""}`}
                                onClick={() => {
                                  setSelectedSeason(s.seasonNumber);
                                  setShowSeasonModal(false);
                                }}
                                aria-label={`Select ${s.name}`}
                              >
                                <div className={styles.seasonPosterWrap}>
                                  {s.poster ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={s.poster}
                                      alt={s.name}
                                      className={styles.seasonPosterImg}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className={styles.seasonPosterFallback}>
                                      <span>{s.name}</span>
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Right Arrow */}
                        {seasonOptions.length > 1 && (
                          <button
                            type="button"
                            className={`${styles.seasonNavArrow} ${styles.seasonArrowRight}`}
                            onClick={() => navigateSeason(1)}
                            disabled={activeSeasonIndex >= seasonOptions.length - 1}
                            aria-label="Next Season"
                          >
                            <ChevronRight size={16} strokeWidth={1.75} />
                          </button>
                        )}
                      </div>

                      {/* Active Season Meta Info below matching user reference */}
                      <div className={styles.seasonMetaInfo}>
                        <h4 className={styles.seasonMetaTitle}>
                          {currentSeasonObj?.name &&
                          !currentSeasonObj.name.toLowerCase().startsWith("season")
                            ? currentSeasonObj.name
                            : currentSeasonObj?.name || `Season ${selectedSeason}`}
                        </h4>
                        <p className={styles.seasonMetaSub}>
                          {[
                            currentSeasonObj?.episodeCount
                              ? `${currentSeasonObj.episodeCount} episodes`
                              : null,
                            currentSeasonObj?.year || null,
                            `${getSeasonWatchedCount(selectedSeason)} watched`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {seasonOptions.length > 1 && (
                          <button
                            type="button"
                            className={styles.openSeasonBtn}
                            onClick={() => setShowSeasonModal(false)}
                          >
                            Open
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.epSearchWrap}>
                  <Search size={14} strokeWidth={1.75} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search episodes"
                    value={epSearch}
                    onChange={(e) => setEpSearch(e.target.value)}
                    className={styles.epSearchInput}
                  />
                </div>

                <button
                  type="button"
                  className={styles.epSortBtn}
                  onClick={() => setEpSort((s) => (s === "oldest" ? "newest" : "oldest"))}
                >
                  <ArrowUpDown size={14} strokeWidth={1.75} />
                  <span>{epSort === "oldest" ? "Oldest" : "Newest"}</span>
                </button>
              </div>

              <div className={styles.watchedCountLabel}>
                {allEpisodes.length > 0 ? `${watchedCount}/${allEpisodes.length} watched` : "—"}
              </div>
            </div>

            {/* Episodes Grid */}
            {loadingSeason && !seasonEpisodesMap[selectedSeason] ? (
              <div className={styles.episodesGrid} aria-busy="true" aria-label="Loading episodes">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={styles.epCard}>
                    <div className={`skeleton ${styles.epThumbSkeleton}`} />
                    <div className={`skeleton ${styles.epMetaSkeleton}`} />
                  </div>
                ))}
              </div>
            ) : allEpisodes.length === 0 ? (
              <Empty
                title="No episodes listed"
                text="Episode details aren't available for this season yet."
              />
            ) : displayedEpisodes.length === 0 ? (
              <Empty
                title="No matching episodes"
                text={`No episodes matched "${epSearch.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setEpSearch("")}
              />
            ) : (
              <div className={styles.episodesGrid}>
                {displayedEpisodes.map((ep) => {
                  const isWatched = isEpWatched(selectedSeason, ep.episodeNumber);
                  const epKey = selectedSeason > 1 ? `s${selectedSeason}_e${ep.episodeNumber}` : ep.episodeNumber;
                  const altKey = selectedSeason === 1 ? `s1_e${ep.episodeNumber}` : null;
                  const progress = getEpProgress(selectedSeason, ep.episodeNumber);
                  const isSpoilerHidden = Boolean(
                    settings.hideSpoilers && !isWatched && !progress && !revealedSpoilers[`${selectedSeason}_${ep.episodeNumber}`]
                  );
                  const displayEpTitle = isSpoilerHidden
                    ? `Episode ${ep.episodeNumber} · Spoiler hidden`
                    : ep.title;
                  const isSelected = selectedEp === ep.episodeNumber || Boolean(progress);
                  const dateStr = formatEpDate(ep.airDate);
                  const epSubtext = [dateStr, ep.runtime ? `${ep.runtime} min` : null]
                    .filter(Boolean)
                    .join(" · ");
                  const epHref = `/watch/${t.id}?season=${selectedSeason || 1}&episode=${ep.episodeNumber}`;

                  return (
                    <div
                      key={ep.episodeNumber}
                      className={`${styles.epCard} ${isWatched ? styles.epCardWatched : ""} ${
                        isSelected ? styles.epCardSelected : ""
                      }`}
                      onMouseEnter={() => setSelectedEp(ep.episodeNumber)}
                    >
                      <div className={styles.epThumbnail}>
                        <Link
                          href={epHref}
                          className={styles.epThumbLink}
                          aria-label={`Play episode ${ep.episodeNumber}: ${displayEpTitle}`}
                        >
                          {ep.still ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ep.still}
                              alt={displayEpTitle}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className={styles.epImg}
                              style={isSpoilerHidden ? { filter: "blur(14px) brightness(0.75)", transform: "scale(1.06)" } : undefined}
                              onError={(e) => {
                                if (t.backdrop && e.currentTarget.src !== t.backdrop) {
                                  e.currentTarget.src = t.backdrop;
                                }
                              }}
                            />
                          ) : (
                            <div className={styles.epPlaceholder} />
                          )}
                          <div className={styles.epShade} />
                          <span className={styles.epNumberBadge}>{ep.episodeNumber}</span>
                          {progress > 0 && (
                            <div className={styles.epProgressTrack}>
                              <div
                                className={styles.epProgressFill}
                                style={{ width: `${Math.round(progress * 100)}%` }}
                              />
                            </div>
                          )}
                          <span className={styles.epPlayOverlay} aria-hidden="true">
                            <Play size={20} strokeWidth={1.75} fill="currentColor" />
                          </span>
                        </Link>

                        {progress > 0 && !isWatched ? (
                          <span className={styles.epProgressBadge}>
                            {Math.round(progress * 100)}%
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.watchedRoundBtn} ${
                              isWatched ? styles.watchedRoundBtnActive : ""
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleWatchedEpisode(setWatchedEpisodes, t.id, epKey, altKey);
                            }}
                            aria-label={isWatched ? "Mark as unwatched" : "Mark as watched"}
                            aria-pressed={isWatched}
                            title={isWatched ? "Mark as unwatched" : "Mark as watched"}
                          >
                            {isWatched && <Check size={14} strokeWidth={2} color="#080808" />}
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <Link href={epHref} className={styles.epMeta} style={{ flex: 1, minWidth: 0 }}>
                          <span className={styles.epTitle} title={displayEpTitle}>
                            {displayEpTitle}
                          </span>
                          <span className={styles.epSub}>
                            {epSubtext}
                          </span>
                        </Link>
                        {isSpoilerHidden && (
                          <button
                            type="button"
                            className={styles.revealBtn}
                            onClick={() =>
                              setRevealedSpoilers((prev) => ({
                                ...prev,
                                [`${selectedSeason}_${ep.episodeNumber}`]: true,
                              }))
                            }
                          >
                            Reveal
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* RATINGS TAB */}
        {activeTab === "ratings" && (
          <div className={styles.ratingsSection}>
            <div className={styles.ratingsGrid}>
              {/* Card 1: Score & Consensus */}
              <div className={styles.scoreCard}>
                <div className={styles.scoreHero}>
                  <div className={styles.starBig}>★</div>
                  <div className={styles.scoreVal}>
                    {t.rating > 0 ? t.rating.toFixed(1) : "N/A"}
                    <span className={styles.scoreMax}>/10</span>
                  </div>
                </div>
                <p className={styles.scoreSub}>
                  {t.voteCount ? `Based on ${t.voteCount.toLocaleString()} TMDB user ratings` : "No rating data available yet"}
                </p>
              </div>

              {/* Card 2: Interactive Rating */}
              <div className={styles.yourRatingCard}>
                <h3 className={styles.yourRatingTitle}>Your Rating</h3>
                <p className={styles.yourRatingDesc}>
                  {userRating
                    ? `You rated this ${userRating}/10 stars`
                    : "Rate this title to personalize your recommendations"}
                </p>
                <div className={styles.starsRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`${styles.starBtn} ${
                        (hoverStar || userRating || 0) >= star
                          ? styles.starBtnActive
                          : ""
                      }`}
                      onMouseEnter={() => setHoverStar(star)}
                      onMouseLeave={() => setHoverStar(0)}
                      onClick={() => handleSetUserRating(star)}
                      aria-label={`Rate ${star} out of 10`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {userRating && (
                  <button
                    type="button"
                    className={styles.clearRatingBtn}
                    onClick={() => handleSetUserRating(null)}
                  >
                    Clear rating
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RELATED TAB */}
        {activeTab === "related" && (
          <div>
            {/* If part of a collection (e.g. Spider-Verse Collection) */}
            {t.collection && (
              <div style={{ marginBottom: 38 }}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t.collection.name}</h2>
                  <div className={styles.navControls}>
                    <Link
                      href={`/collection/${t.collection.id}`}
                      className={styles.seeAllLink}
                    >
                      See all &gt;
                    </Link>
                    <div className={styles.arrowGroup}>
                      <button
                        type="button"
                        className={styles.navArrow}
                        onClick={() => scrollRelated("left")}
                        aria-label="Previous"
                      >
                        <ChevronLeft size={16} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className={styles.navArrow}
                        onClick={() => scrollRelated("right")}
                        aria-label="Next"
                      >
                        <ChevronRight size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.cardsRow} ref={relatedScrollRef}>
                  {/* Collection Card */}
                  <Link
                    href={`/collection/${t.collection.id}`}
                    className={styles.wideCard}
                  >
                    <div className={styles.wideThumbnail}>
                      {t.collection.backdrop && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.collection.backdrop}
                          alt={t.collection.name}
                          loading="lazy"
                          decoding="async"
                          className={styles.wideImg}
                        />
                      )}
                      <div className={styles.thumbShade} />
                      <span className={styles.topBadge}>Collection</span>
                      <div className={styles.cardTitleBottom}>
                        {t.collection.name}
                        <span className={styles.cardSubBottom}>
                          {t.collection.parts?.length || 0} films
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Chronological parts */}
                  {(t.collection.parts || []).map((part) => (
                    <Link
                      key={part.id}
                      href={`/title/${part.id}`}
                      className={styles.wideCard}
                    >
                      <div className={styles.wideThumbnail}>
                        {part.backdrop ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={part.backdrop}
                            alt={part.title}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className={styles.wideImg}
                          />
                        ) : (
                          <div className={styles.thumbShade} />
                        )}
                        <div className={styles.thumbShade} />

                        {/* Notch in top-left */}
                        {part.year && (
                          <span className={styles.notch}>
                            <span className={styles.badgeHd}>{part.year}</span>
                          </span>
                        )}
                      </div>

                      <div className={styles.wideMeta}>
                        <span className={styles.cardName}>{part.title}</span>
                        <div className={styles.cardMetaSub}>
                          {part.rating > 0 && (
                            <span className={styles.cardRating}>★ {part.rating.toFixed(1)}</span>
                          )}
                          <span>{part.year}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Collection / Related */}
            {!t.collection && similar.length === 0 ? (
              <Empty
                title="No related titles yet"
                text="Explore the catalog to discover more movies, series, and anime."
                href="/discover"
                cta="Browse catalog"
              />
            ) : null}

            {/* Similar titles row */}
            {similar.length > 0 && (
              <div id="more-like-this">
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>More like this</h2>
                  <div className={styles.navControls}>
                    <div className={styles.arrowGroup}>
                      <button
                        type="button"
                        className={styles.navArrow}
                        onClick={() => scrollMoreLikeThis("left")}
                        aria-label="Previous"
                      >
                        <ChevronLeft size={16} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className={styles.navArrow}
                        onClick={() => scrollMoreLikeThis("right")}
                        aria-label="Next"
                      >
                        <ChevronRight size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.cardsRow} ref={moreLikeScrollRef}>
                  {similar.map((sim) => (
                    <Link
                      key={sim.id}
                      href={`/title/${sim.id}`}
                      className={styles.wideCard}
                    >
                      <div className={styles.wideThumbnail}>
                        {sim.backdrop ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sim.backdrop}
                            alt={sim.title}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className={styles.wideImg}
                          />
                        ) : (
                          <div className={styles.thumbShade} />
                        )}
                        <div className={styles.thumbShade} />
                        {sim.quality && (
                          <span className={styles.notch}>
                            <span className={styles.badgeHd}>{sim.quality}</span>
                          </span>
                        )}
                        <div className={styles.cardTitleBottom}>
                          {sim.title}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CAST TAB */}
        {activeTab === "cast" && (
          (t.cast || []).length > 0 ? (
            <div className={styles.castGrid}>
              {(t.cast || []).map((actor) => (
                <div key={actor.id || actor.name} className={styles.castCard}>
                  {actor.profile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={actor.profile}
                      alt={actor.name}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className={styles.castAvatar}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className={styles.castAvatarEmpty}>
                      {actor.name.charAt(0)}
                    </div>
                  )}
                  <span className={styles.castName}>{actor.name}</span>
                  <span className={styles.castChar}>{actor.character}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No cast listed"
              text="Cast credits are unavailable for this title."
            />
          )
        )}

        {/* TRAILERS TAB */}
        {activeTab === "trailers" && (
          (t.videos || []).length > 0 ? (
            <div className={styles.trailersGrid}>
              {(t.videos || []).map((video) => (
                <button
                  key={video.id || video.key}
                  type="button"
                  className={styles.trailerCard}
                  onClick={() => openTrailer(video.key)}
                >
                  <div className={styles.trailerThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnail}
                      alt={video.name}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                    <div className={styles.trailerPlayIcon}>
                      <Play size={20} strokeWidth={1.75} fill="currentColor" />
                    </div>
                  </div>
                  <div className={styles.trailerInfo}>
                    <div className={styles.trailerName}>{video.name}</div>
                    <div className={styles.trailerType}>{video.type}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No trailers available"
              text="There are no trailers or clips for this title yet."
            />
          )
        )}

        {/* REVIEWS TAB */}
        {activeTab === "reviews" && (
          <div className={styles.reviewsList}>
            {(t.reviews && t.reviews.length > 0) ? (
              t.reviews.map((rev) => (
                <div key={rev.id || rev.author} className={styles.reviewCard}>
                  <div className={styles.reviewHeader}>
                    <div className={styles.reviewAuthor}>
                      {rev.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={rev.avatar}
                          alt={rev.author}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className={styles.authorAvatar}
                        />
                      ) : (
                        <div className={styles.authorAvatarEmpty}>
                          {rev.author.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className={styles.authorName}>{rev.author}</span>
                    </div>
                    {rev.rating && (
                      <span className={styles.reviewRating}>
                        ★ {rev.rating} / 10
                      </span>
                    )}
                  </div>
                  <p className={styles.reviewText}>{rev.content}</p>
                </div>
              ))
            ) : (
              <Empty
                title="No reviews yet"
                text="No reviews are available for this title yet."
              />
            )}
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === "about" && (
          <div className={styles.aboutGrid}>
            {t.anilistId && (
              <div className={styles.aboutItem}>
                <dt>AniList ID</dt>
                <dd>#{t.anilistId}</dd>
              </div>
            )}
            {t.about?.tagline && (
              <div className={styles.aboutItem}>
                <dt>Tagline</dt>
                <dd>"{t.about.tagline}"</dd>
              </div>
            )}
            {t.about?.status && (
              <div className={styles.aboutItem}>
                <dt>Status</dt>
                <dd>{t.about.status}</dd>
              </div>
            )}
            {t.about?.originalTitle && (
              <div className={styles.aboutItem}>
                <dt>Original Title</dt>
                <dd>{t.about.originalTitle}</dd>
              </div>
            )}
            {t.about?.originalLanguage && (
              <div className={styles.aboutItem}>
                <dt>Original Language</dt>
                <dd>{t.about.originalLanguage.toUpperCase()}</dd>
              </div>
            )}
            {studio && (
              <div className={styles.aboutItem}>
                <dt>Studio</dt>
                <dd>{studio.name}</dd>
              </div>
            )}
            {(t.directors?.length > 0 || t.director) && (
              <div className={styles.aboutItem}>
                <dt>
                  {t.type === "movie"
                    ? (t.directors?.length > 1 ? "Directors" : "Director")
                    : (t.directors?.length > 1 ? "Creators" : "Creator")}
                </dt>
                <dd>
                  {t.directors?.length > 0
                    ? t.directors.join(", ")
                    : t.director}
                </dd>
              </div>
            )}
            {(t.watchProviders && (t.watchProviders.flatrate?.length > 0 || t.watchProviders.rent?.length > 0 || t.watchProviders.buy?.length > 0)) || service ? (
              <div className={styles.aboutItem} style={{ gridColumn: "1 / -1" }}>
                <dt>Where to watch</dt>
                <dd>
                  {t.watchProviders && (t.watchProviders.flatrate?.length > 0 || t.watchProviders.rent?.length > 0 || t.watchProviders.buy?.length > 0) ? (
                    <div className={styles.providersGroup}>
                      {t.watchProviders.flatrate?.length > 0 && (
                        <div className={styles.providerCategory}>
                          <span className={styles.providerCategoryTitle}>Stream</span>
                          <div className={styles.providersList}>
                            {t.watchProviders.flatrate.map((p) => (
                              <a
                                key={p.id || p.name}
                                href={t.watchProviders.link || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.providerBadge}
                                title={`Stream on ${p.name}`}
                              >
                                {p.logo && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.logo}
                                    alt={p.name}
                                    className={styles.providerLogo}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <span>{p.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {t.watchProviders.rent?.length > 0 && (
                        <div className={styles.providerCategory}>
                          <span className={styles.providerCategoryTitle}>Rent</span>
                          <div className={styles.providersList}>
                            {t.watchProviders.rent.map((p) => (
                              <a
                                key={p.id || p.name}
                                href={t.watchProviders.link || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.providerBadge}
                                title={`Rent on ${p.name}`}
                              >
                                {p.logo && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.logo}
                                    alt={p.name}
                                    className={styles.providerLogo}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <span>{p.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {t.watchProviders.buy?.length > 0 && (
                        <div className={styles.providerCategory}>
                          <span className={styles.providerCategoryTitle}>Buy</span>
                          <div className={styles.providersList}>
                            {t.watchProviders.buy.map((p) => (
                              <a
                                key={p.id || p.name}
                                href={t.watchProviders.link || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.providerBadge}
                                title={`Buy on ${p.name}`}
                              >
                                {p.logo && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.logo}
                                    alt={p.name}
                                    className={styles.providerLogo}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <span>{p.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className={styles.justWatchAttribution}>
                        <a
                          href={t.watchProviders.link || "https://www.justwatch.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.justWatchLink}
                        >
                          Streaming availability powered by JustWatch ↗
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span>Stream on {service.name}</span>
                    </div>
                  )}
                </dd>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Trailer Modal (YouTube Embed) */}
      {activeVideo && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${t.title} trailer`}
          onClick={() => setActiveVideo(null)}
        >
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              ref={modalCloseRef}
              type="button"
              className={styles.closeModal}
              onClick={() => setActiveVideo(null)}
              aria-label="Close trailer"
            >
              <X size={20} strokeWidth={1.75} />
            </button>
            <div className={styles.videoWrap}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo}?autoplay=1&rel=0`}
                title={`${t.title} Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={styles.toastNotice}>
          <span>{toast}</span>
        </div>
      )}
    </Layout>
  );
}

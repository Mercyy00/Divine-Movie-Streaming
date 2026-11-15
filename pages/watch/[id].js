import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Tv,
  ThumbsUp,
  ThumbsDown,
  Check,
  Star,
  Share2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  ArrowUpDown,
  Download,
} from "lucide-react";
import Layout from "../../components/Layout";
import LoadingScreen from "../../components/LoadingScreen";
import Art from "../../components/Art";
import VideoPlayer from "../../components/VideoPlayer";
import Ambilight from "../../components/Ambilight";
import { useAmbientSource } from "../../components/useAmbientSource";
import { getAllCardTitles, getTitle } from "../../lib/data.server";
import { fetchLiveTitle, fetchImdbId } from "../../lib/tmdb";
import { fetchAniListDetails, extractAniListId } from "../../lib/anilist";
import { resolveGreekGodSources, resolveMediaIdentifiers } from "../../lib/servers";
import {
  formatResumeTime,
  extractResumeSeconds,
  computeNextEpisode,
  pickNextAvailableServer,
  getSeasonEpisodeCount,
  getSafeDownloadUrl,
} from "../../lib/watchHelpers";
import {
  useHistory,
  useSettings,
  useList,
  useReactions,
  useWatchedEpisodes,
  toggleWatchedEpisode,
  toggleListEntry,
  toSnapshot,
  inList,
} from "../../lib/store";
import { useToast } from "../../lib/useToast";
import styles from "../../styles/Watch.module.css";

export function getStaticPaths() {
  return {
    paths: getAllCardTitles().filter((t) => t.status !== "upcoming").map((t) => ({
      params: { id: t.id },
    })),
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
  const isAnime =
    Boolean(anilistId) ||
    id.startsWith("anilist-") ||
    id.startsWith("anime-") ||
    (t?.type === "anime" && (!t?.episodes || t.episodes.length === 0));

  if (isAnime) {
    if (!t || !t.episodes || t.episodes.length === 0) {
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
          };
        }
      } catch (e) {
        console.error("Watch live AniList error:", e.message || e);
      }
    }
  } else {
    const isSeries = t ? t.type !== "movie" : !id.startsWith("movie-");
    const needsFullSeasons = isSeries && (!t?.seasonsList || t.seasonsList.length <= 1);

    if (!t || needsFullSeasons) {
      let type = isSeries ? "tv" : "movie";
      let tmdbId = t?.tmdbId || id;
      if (typeof id === "string") {
        if (id.startsWith("movie-")) type = "movie";
        else if (id.startsWith("tv-") || id.startsWith("series-")) type = "tv";
      }

      try {
        const live = await fetchLiveTitle(type, tmdbId);
        if (live) {
          t = { ...(t || {}), ...live };
        } else if (!t) {
          const fallbackType = type === "movie" ? "tv" : "movie";
          t = await fetchLiveTitle(fallbackType, tmdbId);
        }
      } catch (e) {
        console.error("Watch live fetch error:", e.message || e);
      }
    }
  }

  if (!t) {
    return { notFound: true };
  }

  if (t && !t.imdbId) {
    try {
      t.imdbId = await fetchImdbId(t.type, t.tmdbId, t.title, t.year);
    } catch {}
  }

  return {
    props: {
      initialTitle: t,
      id,
    },
    revalidate: 1800,
  };
}

function WatchContent({ title: t, id, season, episode, isReady }) {
  const router = useRouter();
  const playerStageRef = useRef(null);
  const [toast, showToast] = useToast(2400);
  const [mode, setMode] = useState("player");
  const [videoEl, setVideoEl] = useState(null);
  const [history, setHistory] = useHistory();
  const [list, setList] = useList();
  const [reactions, setReactions] = useReactions();
  const [watchedEpisodes, setWatchedEpisodes] = useWatchedEpisodes();
  const [settings] = useSettings();

  const [showFullOverview, setShowFullOverview] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [commentSort, setCommentSort] = useState("top");
  const [newCommentText, setNewCommentText] = useState("");
  const [comments, setComments] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(`comments_${t?.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handlePostComment = () => {
    if (!newCommentText.trim()) return;
    const newC = {
      id: `c_${Date.now()}`,
      createdAt: Date.now(),
      author: settings.name || "Guest",
      avatar: settings.avatar || "/avatars/movie-spiderman.jpg",
      time: "Just now",
      text: newCommentText.trim(),
      likes: 0,
    };
    const updated = [newC, ...comments];
    setComments(updated);
    try {
      localStorage.setItem(`comments_${t?.id}`, JSON.stringify(updated));
    } catch {}
    setNewCommentText("");
    showToast("Comment posted");
  };

  const handleCommentReaction = (commentId, type) => {
    setComments((prev) => {
      const updated = prev.map((c) => {
        if (c.id === commentId) {
          return {
            ...c,
            likes: type === "like" ? (c.likes || 0) + 1 : Math.max(0, (c.likes || 0) - 1),
          };
        }
        return c;
      });
      try {
        localStorage.setItem(`comments_${t?.id}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const sortedComments = useMemo(() => {
    const copy = [...comments];
    if (commentSort === "newest") {
      return copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return copy.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  }, [comments, commentSort]);

  const currentSeason = Number(season) || 1;
  const currentEpisode = Number(episode) || 1;

  const isSeries = t.type !== "movie";

  // Ensure season and episode numbers are always explicitly mentioned in the URL for TV/anime
  useEffect(() => {
    if (!isReady || !router.isReady) return;
    if (isSeries && (!router.query.season || !router.query.episode)) {
      router.replace(
        `/watch/${t.id}?season=${currentSeason}&episode=${currentEpisode}`,
        undefined,
        { shallow: true }
      );
    }
  }, [isReady, router.isReady, isSeries, t.id, currentSeason, currentEpisode, router]);

  // Capture initial resume time ONCE on mount / season / episode change
  // so ongoing playback timeupdates do not trigger source refetches or re-renders
  const currentMediaKey = `${id}-s${currentSeason}-e${currentEpisode}`;
  const lastMediaKeyRef = useRef(null);
  const resumeResolvedForKeyRef = useRef(null);
  const initialSavedSecondsRef = useRef(0);
  const initialProgressRef = useRef(0);
  const resumeToastShownRef = useRef(null);

  if (
    lastMediaKeyRef.current !== currentMediaKey ||
    (resumeResolvedForKeyRef.current !== currentMediaKey && history.length > 0)
  ) {
    lastMediaKeyRef.current = currentMediaKey;
    if (history.length > 0) {
      resumeResolvedForKeyRef.current = currentMediaKey;
    }
    if (settings.resumePlayback === false) {
      initialProgressRef.current = 0;
      initialSavedSecondsRef.current = 0;
    } else {
      const initialItem = history.find(
        (item) =>
          (item.id === t.id ||
            (t.tmdbId && String(item.tmdbId || item.id) === String(t.tmdbId)) ||
            String(item.id) === String(id)) &&
          (!isSeries || ((item.season || 1) === currentSeason && (item.episode || 1) === currentEpisode))
      );
      const rawProg = Number(initialItem?.progress || 0);
      initialProgressRef.current = rawProg > 0 && rawProg < 0.95 ? rawProg : 0;
      initialSavedSecondsRef.current = extractResumeSeconds(
        initialItem,
        t?.runtime ? t.runtime * 60 : 0
      );
    }
  }

  const initialResumeSeconds = initialSavedSecondsRef.current || 0;
  const initialResumeProgress = initialProgressRef.current || 0;

  useEffect(() => {
    if (
      settings.resumePlayback !== false &&
      initialResumeSeconds > 10 &&
      resumeToastShownRef.current !== currentMediaKey
    ) {
      resumeToastShownRef.current = currentMediaKey;
      showToast(`Resuming from ${formatResumeTime(initialResumeSeconds)}`);
    }
  }, [currentMediaKey, initialResumeSeconds, settings.resumePlayback, showToast]);

  // Initialize immediately with Greek God servers (Poseidon default, Zeus second, etc.)
  const [sources, setSources] = useState(() => {
    try {
      const initialResolved = resolveGreekGodSources({
        id,
        type: t.type,
        tmdbId: t.tmdbId,
        anilistId: t.anilistId || extractAniListId(id) || extractAniListId(t.id),
        imdbId: t.imdbId || t.external_ids?.imdb_id,
        season: currentSeason,
        episode: currentEpisode,
        progress: initialResumeSeconds,
        autoplay: true,
        title: t.title,
        backdrop: t.backdrop,
        poster: t.poster,
        embedUrl: t.embedUrl,
      });
      return {
        loading: false,
        servers: initialResolved.servers,
        default: initialResolved.default,
        error: "",
      };
    } catch {
      return { loading: false, servers: [], default: null, error: "" };
    }
  });
  const [request, setRequest] = useState(0);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const sourcePickerRef = useRef(null);

  useEffect(() => {
    if (!showSourceMenu) return;

    const handleOutsideClick = (e) => {
      if (sourcePickerRef.current && !sourcePickerRef.current.contains(e.target)) {
        setShowSourceMenu(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowSourceMenu(false);
      }
    };

    const handleBlur = () => {
      setShowSourceMenu(false);
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [showSourceMenu]);

  const [showSeasonMenu, setShowSeasonMenu] = useState(false);
  const seasonPickerRef = useRef(null);

  useEffect(() => {
    if (!showSeasonMenu) return;

    const handleOutsideClick = (e) => {
      if (seasonPickerRef.current && !seasonPickerRef.current.contains(e.target)) {
        setShowSeasonMenu(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowSeasonMenu(false);
      }
    };

    const handleBlur = () => {
      setShowSeasonMenu(false);
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [showSeasonMenu]);

  useEffect(() => {
    let remembered = null;
    if (settings.rememberLastSource && typeof window !== "undefined") {
      try {
        const savedId = window.localStorage.getItem("viv:last_server");
        if (savedId && sources.servers.some((s) => s.id === savedId && s.status === "online")) {
          remembered = savedId;
        }
      } catch {}
    }
    setSelectedServerId(remembered);
    setShowSourceMenu(false);
    setShowSeasonMenu(false);
  }, [id, season, episode, settings.rememberLastSource, sources.servers]);

  const handleSelectServer = useCallback(
    (srvId) => {
      setSelectedServerId(srvId);
      if (settings.rememberLastSource && typeof window !== "undefined" && srvId) {
        try {
          window.localStorage.setItem("viv:last_server", srvId);
        } catch {}
      }
    },
    [settings.rememberLastSource]
  );

  const isSaved = inList(list, t.id);
  const userReaction = reactions?.[t.id] || null;
  const activeServerId = selectedServerId || sources.default;
  const activeServer = sources.servers.find((server) => server.id === activeServerId);
  const alternateServer = pickNextAvailableServer(sources.servers, activeServerId);
  const activeDownloadUrl = getSafeDownloadUrl(
    activeServer?.downloadUrl || activeServer?.download || activeServer?.download_url
  );

  const watchedList = (t.id && watchedEpisodes?.[t.id]) || [];

  const totalSeasons = useMemo(() => {
    if (!isSeries || !t) return 1;
    return Math.max(
      typeof t.seasons === "number" ? t.seasons : 0,
      typeof t.numberOfSeasons === "number" ? t.numberOfSeasons : 0,
      Array.isArray(t.seasonsList) ? t.seasonsList.length : 0,
      1
    );
  }, [isSeries, t]);

  const [seasonEpisodesMap, setSeasonEpisodesMap] = useState({});
  const [loadingSeason, setLoadingSeason] = useState(false);

  useEffect(() => {
    if (!isSeries || !t || currentSeason === 1) return;
    if (seasonEpisodesMap[currentSeason]) return;

    const { numericTmdbId } = resolveMediaIdentifiers({
      id: t.id,
      tmdbId: t.tmdbId,
      anilistId: t.anilistId,
      type: t.type,
    });
    if (!numericTmdbId) return;

    let active = true;
    setLoadingSeason(true);
    fetch(`/api/tmdb/season?tvId=${numericTmdbId}&season=${currentSeason}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.episodes) {
          setSeasonEpisodesMap((prev) => ({
            ...prev,
            [currentSeason]: data.episodes,
          }));
        }
        setLoadingSeason(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Watch season fetch error:", err);
        setLoadingSeason(false);
      });

    return () => {
      active = false;
    };
  }, [isSeries, t, currentSeason, seasonEpisodesMap]);

  // Episodes for series/anime (strictly ordered 1..N)
  const episodesList = useMemo(() => {
    if (!isSeries || !t) return [];
    if (seasonEpisodesMap[currentSeason] && seasonEpisodesMap[currentSeason].length > 0) {
      const list = [...seasonEpisodesMap[currentSeason]];
      list.sort((a, b) => (Number(a.episodeNumber ?? a.episode_number) || 0) - (Number(b.episodeNumber ?? b.episode_number) || 0));
      return list;
    }
    if (currentSeason === 1) {
      const source = (t.episodes && t.episodes.length > 0) ? t.episodes : (t.seasons?.[0]?.episodes || []);
      const list = [...source];
      list.sort((a, b) => (Number(a.episodeNumber ?? a.episode_number) || 0) - (Number(b.episodeNumber ?? b.episode_number) || 0));
      return list;
    }
    const count = getSeasonEpisodeCount(t, currentSeason);
    if (!count) return [];
    const fallback = [];
    for (let i = 1; i <= count; i++) {
      fallback.push({
        episodeNumber: i,
        title: `Episode ${i}`,
        overview: `Season ${currentSeason}, Episode ${i}`,
        still: t.backdrop || t.poster,
        runtime: t.runtime || null,
      });
    }
    return fallback;
  }, [isSeries, t, currentSeason, seasonEpisodesMap]);

  const currentEpisodeObj = episodesList.find((e) => e.episodeNumber === currentEpisode) || episodesList[0];
  const totalEpisodes = episodesList.length;

  // Recommendations for "More like this"
  const [smartRecs, setSmartRecs] = useState(t.recommendations || []);
  const [recFilter, setRecFilter] = useState("all");

  useEffect(() => {
    let active = true;
    const targetId = t.tmdbId || t.anilistId || t.id;
    if (!targetId) return;

    fetch(`/api/tmdb/recommendations?id=${encodeURIComponent(targetId)}&type=${t.type || "movie"}&limit=18`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active && Array.isArray(data) && data.length > 0) {
          setSmartRecs(data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [t.id, t.tmdbId, t.anilistId, t.type]);

  const hasDirectorRecs = useMemo(() => (smartRecs || []).some((r) => r.matchType === "director"), [smartRecs]);
  const hasCastRecs = useMemo(() => (smartRecs || []).some((r) => r.matchType === "cast"), [smartRecs]);

  const recommendations = useMemo(() => {
    const list = smartRecs && smartRecs.length > 0 ? smartRecs : (t.recommendations || []);
    if (recFilter === "director") {
      return list.filter((r) => r.matchType === "director");
    }
    if (recFilter === "cast") {
      return list.filter((r) => r.matchType === "cast");
    }
    if (recFilter === "genre") {
      return list.filter((r) => r.matchType === "genre" || r.matchType === "franchise");
    }
    return list.slice(0, 14);
  }, [smartRecs, t.recommendations, recFilter]);

  // Fetch streaming sources and sync with server
  useEffect(() => {
    if (!isReady) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ id, type: t.type });
    if (t.tmdbId) query.set("tmdbId", String(t.tmdbId));
    const aniId = t.anilistId || extractAniListId(id) || extractAniListId(t.id);
    if (aniId) query.set("anilistId", String(aniId));
    const imdbId = t.imdbId || t.external_ids?.imdb_id;
    if (imdbId) query.set("imdbId", String(imdbId));
    if (t.title) query.set("title", t.title);
    if (t.poster) query.set("poster", t.poster);
    if (t.type !== "movie") {
      query.set("season", String(currentSeason));
      query.set("episode", String(currentEpisode));
    }
    if (initialResumeSeconds > 10) {
      query.set("progress", String(initialResumeSeconds));
    }

    fetch(`/api/sources?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load streaming servers.");
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted && data?.servers?.length) {
          setSources({ ...data, loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSources((prev) =>
            prev.servers.length > 0
              ? prev
              : {
                  loading: false,
                  servers: [],
                  default: null,
                  error: error.message || "Could not load streaming servers.",
                }
          );
        }
      });

    return () => controller.abort();
  }, [id, t.type, t.tmdbId, t.anilistId, t.imdbId, t.title, t.poster, currentSeason, currentEpisode, isReady, request]);

  const lastSaveTimeRef = useRef(0);
  const lastSaveTimestampRef = useRef(0);

  const saveProgress = useCallback(
    (time, duration) => {
      if (settings.incognito) return;
      if (!Number.isFinite(time) || time < 0) return;
      const validDuration =
        Number.isFinite(duration) && duration > 0
          ? duration
          : t?.runtime
          ? t.runtime * 60
          : 0;
      if (!validDuration || validDuration <= 0) return;

      const now = Date.now();
      // Throttle saving history to at most once every 3 seconds to avoid re-rendering and tearing iframe on subsecond ticks
      if (now - lastSaveTimestampRef.current < 3000 && Math.abs(time - lastSaveTimeRef.current) < 3) {
        return;
      }
      lastSaveTimestampRef.current = now;
      lastSaveTimeRef.current = time;

      const progress = Math.min(1, Math.max(0, time / validDuration));
      const minsLeft = Math.ceil((validDuration - time) / 60);
      const timeLeft =
        minsLeft > 60
          ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left`
          : `${minsLeft}m left`;

      const entry = {
        id: t.id,
        tmdbId: t.tmdbId || null,
        title: toSnapshot(t),
        progress,
        timeLeft,
        secondsLeft: Math.ceil(validDuration - time),
        currentTime: Math.floor(time),
        duration: Math.floor(validDuration),
        at: now,
        ...(isSeries ? { season: currentSeason, episode: currentEpisode } : {}),
      };

      setHistory((previous) => {
        const list = previous || [];
        const filtered = list.filter((item) => {
          const sameTitle =
            item.id === t.id ||
            (t.tmdbId && String(item.tmdbId || item.id) === String(t.tmdbId));
          if (!sameTitle) return true;
          if (!isSeries) return false;
          return !((item.season || 1) === currentSeason && (item.episode || 1) === currentEpisode);
        });
        return [entry, ...filtered].slice(0, 60);
      });
    },
    [settings.incognito, t, isSeries, currentSeason, currentEpisode, setHistory]
  );

  const handleMarkWatched = useCallback(() => {
    if (!t.id) return;
    if (isSeries) {
      const epKey = currentSeason > 1 ? `s${currentSeason}_e${currentEpisode}` : currentEpisode;
      const altKey = currentSeason === 1 ? `s1_e${currentEpisode}` : null;
      toggleWatchedEpisode(setWatchedEpisodes, t.id, epKey, altKey);
    } else {
      toggleWatchedEpisode(setWatchedEpisodes, t.id, "movie", "watched");
    }
  }, [isSeries, t.id, currentSeason, currentEpisode, setWatchedEpisodes]);

  const nextEpInfo = useMemo(
    () =>
      computeNextEpisode({
        isSeries,
        currentSeason,
        currentEpisode,
        totalSeasons,
        totalEpisodes,
      }),
    [isSeries, currentSeason, currentEpisode, totalSeasons, totalEpisodes]
  );

  const hasNext = Boolean(nextEpInfo);
  const goNext = useCallback(() => {
    if (nextEpInfo) {
      router.push(`/watch/${t.id}?season=${nextEpInfo.season}&episode=${nextEpInfo.episode}`);
    }
  }, [router, t.id, nextEpInfo]);

  const goPrev = useCallback(() => {
    if (currentEpisode > 1) {
      router.push(`/watch/${t.id}?season=${currentSeason}&episode=${currentEpisode - 1}`);
    }
  }, [router, t.id, currentSeason, currentEpisode]);

  const room = typeof router.query.room === "string" && /^[A-Za-z2-9]{5}$/.test(router.query.room) ? router.query.room : null;

  const handleReaction = (type) => {
    setReactions((prev) => ({
      ...(prev || {}),
      [t.id]: prev?.[t.id] === type ? null : type,
    }));
    showToast(type === "like" ? "Added to Liked" : "Marked as Not for me");
  };

  const handleShare = async () => {
    if (navigator?.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied to clipboard");
    }
  };

  const handleOutsideBack = useCallback(
    (e) => {
      if (typeof document !== "undefined" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (
        typeof window !== "undefined" &&
        window.history.length > 1 &&
        document.referrer &&
        document.referrer.includes(window.location.host)
      ) {
        e.preventDefault();
        router.back();
      }
    },
    [router]
  );

  const overview = t.overview || "No synopsis available.";
  const synopsisLimit = 205;
  const showMore = overview.length > synopsisLimit;
  const displayedOverview = !showFullOverview && showMore
    ? `${overview.slice(0, synopsisLimit).trimEnd()}…`
    : overview;

  const isTitleWatched = isSeries
    ? watchedList.some((item) => {
        const s = String(item);
        const epStr = String(currentEpisode);
        if (currentSeason === 1 && (Number(item) === currentEpisode || s === epStr || s === `s1_e${epStr}`)) return true;
        return s === `s${currentSeason}_e${epStr}`;
      })
    : watchedList.some((item) => String(item) === "movie" || String(item) === "watched");

  const formattedDate = useMemo(() => {
    if (currentEpisodeObj?.airDate) return currentEpisodeObj.airDate;
    if (t.releaseDate) {
      try {
        const d = new Date(t.releaseDate);
        return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
      } catch {
        return t.releaseDate;
      }
    }
    return t.year ? String(t.year) : null;
  }, [currentEpisodeObj?.airDate, t.releaseDate, t.year]);

  const metaHeaderItems = [
    t.views ? { key: "views", node: <span>{t.views}</span> } : null,
    formattedDate ? { key: "date", node: <span>{formattedDate}</span> } : null,
    t.rating > 0
      ? { key: "rating", node: <span style={{ color: "#fff", fontWeight: 700 }}>★ {t.rating.toFixed(1)}</span> }
      : null,
    isSeries
      ? {
          key: "ep",
          node: (
            <span className={styles.metaEpisodePill}>
              S{currentSeason} E{currentEpisode}
            </span>
          ),
        }
      : null,
  ].filter(Boolean);

  const {
    activeVideoEl,
    isLive: isLiveAmbient,
    toggleCapture: toggleAmbientLive,
    getCropRect,
  } = useAmbientSource({
    videoEl,
    anchorRef: playerStageRef,
    showToast,
  });

  return (
    <div className={styles.watchContainer}>
      <Ambilight
        videoEl={activeVideoEl}
        images={[t.backdrop, ...(t.backdrops || [])]}
        intensity={0.48}
        anchorRef={playerStageRef}
        getCropRect={getCropRect}
        enabled={settings.ambientLight !== "off"}
      />
      <div className={`${styles.watchLayout} ${isTheater ? styles.theaterLayout : ""}`} style={{ position: "relative", zIndex: 1 }}>
        {/* ── LEFT COLUMN: PLAYER & DETAILS ────────────────────────────── */}
      <div className={styles.mainCol}>
        {/* Video Player Container */}
        <div ref={playerStageRef} className={styles.playerStageWrap}>
          <Link
            href={`/title/${t.id}`}
            onClick={handleOutsideBack}
            className={styles.outsideBackBtn}
            aria-label={`Back to ${t.title}`}
            title="Title details"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
          </Link>
          <div className={styles.playerWrap}>
            {mode === "trailer" && t.trailerKey ? (
              <div className={styles.stage}>
                <iframe
                  className={styles.trailer}
                  src={`https://www.youtube-nocookie.com/embed/${t.trailerKey}?autoplay=1&rel=0`}
                  title={`${t.title} Official Trailer`}
                  allow="autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
                <div className={styles.top}>
                  <Link href={`/title/${t.id}`} className={styles.back}>
                    <ArrowLeft size={20} strokeWidth={1.75} />
                    <span>{t.title}</span>
                  </Link>
                  <button
                    type="button"
                    className={`chip ${styles.trailerButton}`}
                    onClick={() => setMode("player")}
                  >
                    <Tv size={14} strokeWidth={1.75} />
                    <span>Switch to Player</span>
                  </button>
                </div>
              </div>
            ) : (sources.default || sources.servers.length > 0) && !sources.loading ? (
              <VideoPlayer
                servers={sources.servers}
                defaultServer={selectedServerId || sources.default}
                title={t}
                initialProgress={initialResumeProgress}
                initialProgressSeconds={initialResumeSeconds}
                onProgress={saveProgress}
                onServerChange={handleSelectServer}
                onResumeNotice={showToast}
                onWatched={handleMarkWatched}
                nextEpisode={nextEpInfo}
                onNext={goNext}
                onEpisodeSelect={(s, ep) => {
                  router.push(`/watch/${t.id}?season=${s}&episode=${ep}`);
                }}
                onExit={() => {
                  router.push(`/title/${t.id}`);
                }}
                room={room}
                partyName={settings.name || "Guest"}
                onVideoElement={setVideoEl}
                recommendations={recommendations}
                isTheater={isTheater}
                onToggleTheater={() => setIsTheater((v) => !v)}
              />
            ) : (
              <div className={styles.stage}>
                <Art title={t} variant="backdrop" className={styles.art} />
                <div className={styles.unavailableShade} />
                <div className={styles.status} role={sources.error ? "alert" : "status"}>
                  <p>{sources.loading ? "Finding streaming servers…" : sources.error || "No streams are available for this title."}</p>
                  {!sources.loading && (
                    <div className={styles.unavailableActions}>
                      {alternateServer && (
                        <button
                          type="button"
                          className="chip"
                          onClick={() => handleSelectServer(alternateServer.id)}
                        >
                          Try another server ({alternateServer.name})
                        </button>
                      )}
                      <button type="button" className="chip" onClick={() => setRequest((value) => value + 1)}>
                        Retry sources
                      </button>
                      <Link href={`/title/${t.id}`} className="chip">
                        Back to title
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className={styles.titleArea}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className={styles.mainTitle}>{t.title}</h1>
            {t.anilistId && (
              <span className={styles.anilistTag}>
                AniList #{t.anilistId}
              </span>
            )}
          </div>
          {isSeries && currentEpisodeObj && (
            <p className={styles.subTitle}>
              S{currentSeason} E{currentEpisode} {currentEpisodeObj.title}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className={styles.actionBtnsRow}>
          {/* Like / Dislike Group */}
          <div className={styles.likeDislikeGroup}>
            <button
              type="button"
              className={`${styles.likeBtn} ${userReaction === "like" ? styles.likeBtnActive : ""}`}
              onClick={() => handleReaction("like")}
              aria-label="Like this title"
              aria-pressed={userReaction === "like"}
              title="Like this title"
            >
              <ThumbsUp size={15} strokeWidth={1.75} />
              <span>{userReaction === "like" ? "Liked" : "Like"}</span>
            </button>
            <div className={styles.likeDivider} />
            <button
              type="button"
              className={`${styles.dislikeBtn} ${userReaction === "dislike" ? styles.dislikeBtnActive : ""}`}
              onClick={() => handleReaction("dislike")}
              aria-label="Dislike this title"
              aria-pressed={userReaction === "dislike"}
              title="Not for me"
            >
              <ThumbsDown size={15} strokeWidth={1.75} />
            </button>
          </div>

          {/* Save / Watchlist */}
          <button
            type="button"
            className={`${styles.actionPillBtn} ${isSaved ? styles.actionPillBtnActive : ""}`}
            aria-pressed={isSaved}
            onClick={() => {
              toggleListEntry(setList, t.id, t);
              showToast(isSaved ? "Removed from watchlist" : "Saved to watchlist");
            }}
          >
            {isSaved ? <Check size={16} strokeWidth={1.75} /> : <Plus size={16} strokeWidth={1.75} />}
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>

          {/* Server selector */}
          <div ref={sourcePickerRef} className={styles.sourcePicker}>
            <button
              type="button"
              className={`${styles.actionPillBtn} ${showSourceMenu ? styles.actionPillBtnActive : ""}`}
              aria-label={`Server: ${activeServer?.name || "Select server"}`}
              aria-expanded={showSourceMenu}
              onClick={() => setShowSourceMenu((open) => !open)}
            >
              <Star size={14} fill="currentColor" className={styles.serverStarIcon} />
              <span>{activeServer?.name || "Select server"}</span>
              <ChevronDown size={13} className={`${styles.chevronIcon} ${showSourceMenu ? styles.chevronRotated : ""}`} />
            </button>
            {showSourceMenu && (
              <div className={styles.sourceMenu} role="menu" aria-label="Streaming servers">
                <div className={styles.sourceMenuHeader}>
                  <span className={styles.sourceMenuTitle}>Streaming Servers</span>
                  <span className={styles.sourceMenuCount}>{sources.servers.length} mirrors</span>
                </div>
                {sources.servers.length ? (
                  <>
                    {sources.servers.map((server) => {
                      const isActive = server.id === (selectedServerId || sources.default);
                      return (
                        <button
                          key={server.id}
                          type="button"
                          className={`${styles.sourceOption} ${isActive ? styles.sourceOptionActive : ""}`}
                          disabled={server.status !== "online"}
                          role="menuitem"
                          onClick={() => {
                            handleSelectServer(server.id);
                            setShowSourceMenu(false);
                          }}
                        >
                          <div className={styles.sourceChoice}>
                            <span className={styles.sourceIndicator}>
                              {isActive ? (
                                <span className={styles.sourceDotActive} />
                              ) : (
                                <span className={styles.sourceDotIdle} />
                              )}
                            </span>
                            <span className={styles.sourceName}>{server.name}</span>
                          </div>
                          <div className={styles.sourceMeta}>
                            {server.id === (sources.default || "poseidon") ? (
                              <span className={styles.sourceBadgeDefault}>Default</span>
                            ) : server.status === "online" ? (
                              <span className={styles.sourceBadgeOnline}>Online</span>
                            ) : (
                              <span className={styles.sourceBadgeOffline}>Offline</span>
                            )}
                            {isActive && <Check size={13} strokeWidth={1.75} className={styles.sourceCheckIcon} />}
                          </div>
                        </button>
                      );
                    })}
                    {alternateServer && (
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.sourceMenuFooterBtn}
                        onClick={() => {
                          handleSelectServer(alternateServer.id);
                          setShowSourceMenu(false);
                          showToast(`Switched to ${alternateServer.name}`);
                        }}
                      >
                        Try another server ({alternateServer.name})
                      </button>
                    )}
                  </>
                ) : (
                  <p className={styles.sourceEmpty}>{sources.loading ? "Finding servers…" : "No servers available"}</p>
                )}
              </div>
            )}
          </div>

          {/* Download (only shown when active server provides a real download link) */}
          {activeDownloadUrl && (
            <a
              href={activeDownloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className={styles.actionPillBtn}
              aria-label="Download"
              title="Download"
            >
              <Download size={15} />
              <span>Download</span>
            </a>
          )}

          {/* Share */}
          <button
            type="button"
            className={styles.actionPillBtn}
            onClick={handleShare}
            aria-label="Share"
            title="Share"
          >
            <Share2 size={15} />
            <span>Share</span>
          </button>

          {/* Mark as Watched */}
          <button
            type="button"
            className={`${styles.actionPillBtn} ${styles.actionIconBtn} ${isTitleWatched ? styles.actionPillBtnActive : ""}`}
            onClick={handleMarkWatched}
            aria-pressed={isTitleWatched}
            aria-label={isTitleWatched ? "Marked as watched" : "Mark as watched"}
            title={isTitleWatched ? "Watched" : "Mark as watched"}
          >
            <Check size={16} strokeWidth={1.75} />
          </button>

          {/* Ambient Lighting Toggle */}
          <button
            type="button"
            className={`${styles.actionPillBtn} ${styles.actionIconBtn} ${
              isLiveAmbient
                ? styles.ambientPillLive
                : settings.ambientLight !== "off"
                ? styles.ambientPillActive
                : ""
            }`}
            onClick={toggleAmbientLive}
            aria-label={`Ambient lighting: ${
              isLiveAmbient ? "Live scene sync active" : settings.ambientLight === "off" ? "Off" : "Artwork mode"
            }`}
            title={
              isLiveAmbient
                ? "Live scene sync is active. Click to switch back to artwork."
                : "Sync ambient lighting to live scene playback"
            }
          >
            <Sparkles size={16} strokeWidth={1.75} className={isLiveAmbient ? styles.sparkleLive : ""} />
          </button>
        </div>

        {/* Metadata Box */}
        <div className={styles.metaBox}>
          {metaHeaderItems.length > 0 && (
            <div className={styles.metaHeaderLine}>
              {metaHeaderItems.map((item, idx) => (
                <span key={item.key} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {idx > 0 && <span className={styles.metaGap} />}
                  {item.node}
                </span>
              ))}
            </div>
          )}

          <p className={styles.synopsisText}>
            {displayedOverview}
            {showMore && (
              <button
                type="button"
                className={styles.moreToggleBtn}
                onClick={() => setShowFullOverview((v) => !v)}
              >
                {showFullOverview ? "less" : "...more"}
              </button>
            )}
          </p>
        </div>

        {/* Comments Section */}
        <div className={styles.commentsSection}>
          <div className={styles.commentsHeadRow}>
            <h2 className={styles.commentsHeading}>
              Comments {comments.length > 0 ? <span className={styles.commentsCount}>{comments.length}</span> : null}
            </h2>
            <button
              type="button"
              className={styles.sortBtn}
              aria-label={`Sort comments by ${commentSort === "top" ? "newest" : "top"}`}
              onClick={() => setCommentSort((prev) => (prev === "top" ? "newest" : "top"))}
            >
              <ArrowUpDown size={14} strokeWidth={1.75} />
              <span>{commentSort === "top" ? "Top" : "Newest"}</span>
            </button>
          </div>
          <div className={styles.commentInputRow}>
            <div className={styles.commentAvatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.avatar || "/avatars/movie-spiderman.jpg"}
                alt="User"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className={styles.commentInputWrap}>
              <input
                type="text"
                placeholder="Add a comment…"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePostComment()}
                className={styles.commentInput}
              />
              {newCommentText.trim() && (
                <button
                  type="button"
                  className={styles.commentSubmitBtn}
                  onClick={handlePostComment}
                >
                  Comment
                </button>
              )}
            </div>
          </div>

          <div className={styles.commentsList}>
            {sortedComments.length > 0 ? (
              sortedComments.map((c) => (
                <div key={c.id} className={styles.commentItem}>
                  <div className={styles.commentItemAvatar}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.avatar} alt={c.author} referrerPolicy="no-referrer" />
                  </div>
                  <div className={styles.commentItemBody}>
                    <div className={styles.commentItemHeader}>
                      <span className={styles.commentAuthor}>{c.author}</span>
                      <span className={styles.commentTime}>{c.time}</span>
                    </div>
                    <p className={styles.commentText}>{c.text}</p>
                    <div className={styles.commentReactions}>
                      <button
                        type="button"
                        className={styles.commentReactionBtn}
                        onClick={() => handleCommentReaction(c.id, "like")}
                      >
                        <ThumbsUp size={13} />
                        {c.likes > 0 && <span>{c.likes}</span>}
                      </button>
                      <button
                        type="button"
                        className={styles.commentReactionBtn}
                        onClick={() => handleCommentReaction(c.id, "dislike")}
                      >
                        <ThumbsDown size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.emptyCommentsNotice}>No comments yet. Be the first to share a thought.</p>
            )}
          </div>
        </div>

      </div>

      {/* ── RIGHT COLUMN: EPISODES PLAYLIST & RECOMMENDATIONS ─────────── */}
      <div className={styles.sideCol}>
        {/* If Series / Anime: Episodes Playlist */}
          {isSeries && (
          <div>
            <div className={styles.playlistHeader}>
              <div className={styles.seasonPickerWrap} ref={seasonPickerRef}>
                <button
                  type="button"
                  className={`${styles.seasonSelectBtn} ${totalSeasons > 1 ? styles.seasonSelectBtnClickable : ""}`}
                  onClick={() => totalSeasons > 1 && setShowSeasonMenu((prev) => !prev)}
                  aria-expanded={showSeasonMenu}
                  aria-haspopup="listbox"
                  aria-label={`Select season (Current: Season ${currentSeason})`}
                >
                  <span>Season {currentSeason}</span>
                  <ChevronDown
                    size={14}
                    className={`${styles.chevronIcon} ${showSeasonMenu ? styles.chevronRotated : ""}`}
                  />
                </button>
                {showSeasonMenu && totalSeasons > 1 && (
                  <div className={styles.seasonMenu} role="listbox">
                    <div className={styles.seasonMenuHeader}>
                      <span>Seasons</span>
                      <span className={styles.seasonMenuCount}>{totalSeasons} seasons</span>
                    </div>
                    {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => {
                      const isCurrent = sNum === currentSeason;
                      return (
                        <button
                          key={sNum}
                          type="button"
                          className={`${styles.seasonOption} ${isCurrent ? styles.seasonOptionActive : ""}`}
                          onClick={() => {
                            setShowSeasonMenu(false);
                            router.push(`/watch/${t.id}?season=${sNum}&episode=1`);
                          }}
                        >
                          <span className={styles.seasonOptionNumber}>Season {sNum}</span>
                          {isCurrent && <Check size={13} strokeWidth={1.75} className={styles.sourceCheckIcon} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className={styles.playlistNav}>
                <span>{totalEpisodes > 0 ? `${currentEpisode} / ${totalEpisodes}` : "Episode data unavailable"}</span>
                <button
                  type="button"
                  className={styles.navArrowBtn}
                  onClick={goPrev}
                  disabled={currentEpisode <= 1}
                  aria-label="Previous episode"
                >
                  <ChevronLeft size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className={styles.navArrowBtn}
                  onClick={goNext}
                  disabled={!hasNext}
                  aria-label="Next episode"
                >
                  <ChevronRight size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className={styles.episodesScrollList}>
              {loadingSeason && !seasonEpisodesMap[currentSeason] ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`skeleton ${styles.epRowSkeleton}`} aria-hidden="true" />
                ))
              ) : episodesList.length ? episodesList.map((ep) => {
                const isActive = ep.episodeNumber === currentEpisode;
                const isEpWatched = watchedList.some((item) => {
                  const s = String(item);
                  const epStr = String(ep.episodeNumber);
                  if (currentSeason === 1 && (Number(item) === ep.episodeNumber || s === epStr || s === `s1_e${epStr}`)) return true;
                  return s === `s${currentSeason}_e${epStr}`;
                });
                return (
                  <Link
                    key={ep.episodeNumber}
                    href={`/watch/${t.id}?season=${currentSeason}&episode=${ep.episodeNumber}`}
                    className={`${styles.epItemRow} ${isActive ? styles.epItemActive : ""}`}
                  >
                    <div className={styles.epThumbWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ep.still || t.backdrop || t.poster}
                        alt={ep.title}
                        className={styles.epThumbImg}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const fb = t.backdrop || t.poster;
                          if (fb && e.currentTarget.src !== fb) e.currentTarget.src = fb;
                        }}
                      />
                      {isEpWatched && (
                        <span className={styles.epCheckBadge}>
                          <Check size={12} strokeWidth={1.75} />
                        </span>
                      )}
                    </div>
                    <div className={styles.epInfoCol}>
                      <span className={styles.epTitleText}>
                        {ep.episodeNumber}. {ep.title}
                      </span>
                      <span className={styles.epSubText}>
                        {isActive ? (
                          <span className={styles.epNowPlaying}>Now playing · </span>
                        ) : null}
                        {ep.runtime ? `${ep.runtime} min` : ""}
                      </span>
                    </div>
                  </Link>
                );
              }) : <p className={styles.sourceEmpty}>Episode information is unavailable for Season {currentSeason}.</p>}
            </div>
          </div>
        )}

        {/* More Like This Section */}
        {recommendations.length > 0 && (
          <div className={styles.moreLikeThisSection}>
            <div className={styles.moreLikeThisHeaderRow}>
              <h3 className={styles.moreLikeThisTitle}>More like this</h3>
              {(hasDirectorRecs || hasCastRecs) && (
                <div className={styles.recFilterChips}>
                  <button
                    type="button"
                    className={`${styles.recFilterChip} ${recFilter === "all" ? styles.recFilterChipActive : ""}`}
                    onClick={() => setRecFilter("all")}
                  >
                    All
                  </button>
                  {hasDirectorRecs && (
                    <button
                      type="button"
                      className={`${styles.recFilterChip} ${recFilter === "director" ? styles.recFilterChipActive : ""}`}
                      onClick={() => setRecFilter("director")}
                    >
                      Director
                    </button>
                  )}
                  {hasCastRecs && (
                    <button
                      type="button"
                      className={`${styles.recFilterChip} ${recFilter === "cast" ? styles.recFilterChipActive : ""}`}
                      onClick={() => setRecFilter("cast")}
                    >
                      Cast
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.recFilterChip} ${recFilter === "genre" ? styles.recFilterChipActive : ""}`}
                    onClick={() => setRecFilter("genre")}
                  >
                    Vibe
                  </button>
                </div>
              )}
            </div>

            <div className={styles.moreLikeThisList}>
              {recommendations.map((rec) => (
                <Link
                  key={rec.id}
                  href={`/watch/${rec.id}`}
                  className={styles.recItemRow}
                >
                  <div className={styles.recThumbWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rec.backdrop || rec.poster}
                      alt={rec.title}
                      className={styles.recThumbImg}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className={styles.recInfoCol}>
                    <span className={styles.recTitle}>{rec.title}</span>
                    <span className={styles.recSub}>
                      {rec.year ? `${rec.year} · ` : ""}{rec.type === "movie" ? "Movie" : "Series"}
                    </span>
                    <div className={styles.recMetaLine}>
                      {rec.rating > 0 && <span className={styles.recRating}>★ {rec.rating}</span>}
                      {rec.matchReason && (
                        <span className={styles.recBadge} title={rec.matchReason}>
                          {rec.matchReason}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && <div className={styles.toastNotice}>{toast}</div>}
      </div>
    </div>
  );
}

export default function Watch(props) {
  return <WatchForRoute key={props.id} {...props} />;
}

function WatchForRoute({ initialTitle, id }) {
  const router = useRouter();
  const [liveTitle, setLiveTitle] = useState(initialTitle);
  const [loading, setLoading] = useState(!initialTitle);

  useEffect(() => {
    if (!liveTitle && id) {
      setTimeout(() => setLoading(true), 0);
      const isAnime = /^\d+$/.test(id) || id.startsWith("anilist-") || id.startsWith("anime-");
      const url = isAnime
        ? `/api/anilist/details?id=${encodeURIComponent(id)}`
        : `/api/tmdb/details?id=${encodeURIComponent(id)}`;

      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && data.title) setLiveTitle(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [id, liveTitle]);

  const t = liveTitle || initialTitle;
  const season = router.query.season ?? "1";
  const episode = router.query.episode ?? router.query.ep ?? "1";

  if (router.isFallback || (!t && loading)) {
    return (
      <Layout title="Loading Stream · DIVINE">
        <div
          className={styles.stage}
          style={{
            minHeight: "85vh",
            position: "relative",
            overflow: "hidden",
            background: "#050505",
          }}
        >
          <div className="skeleton" style={{ position: "absolute", inset: 0, opacity: 0.15 }} />
          <div className={styles.top}>
            <div className="skeleton" style={{ width: 140, height: 36, borderRadius: 20 }} />
            <div className="skeleton" style={{ width: 100, height: 28, borderRadius: 14 }} />
          </div>
          <div className={styles.status} style={{ pointerEvents: "none" }}>
            <LoadingScreen message="Preparing stream…" minHeight="auto" size="md" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!t) {
    return (
      <Layout title="Title not found">
        <div className="pageInner">
          <h1>Title not found</h1>
          <Link href="/">Return Home</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Watching ${t.title} · DIVINE`} image={t.backdrop || t.poster} flush>
      <WatchContent
        key={`${id}:${season}:${episode}`}
        title={t}
        id={id}
        season={season}
        episode={episode}
        isReady={router.isReady}
      />
    </Layout>
  );
}

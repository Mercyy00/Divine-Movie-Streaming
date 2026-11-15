import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  RotateCw,
  PictureInPicture2,
  Settings as SettingsIcon,
  Tv,
  Sparkles,
  Captions,
  RectangleHorizontal,
  Check,
} from "lucide-react";
import useVideoPlayback from "./useVideoPlayback";
import { joinRoom } from "../lib/watchParty";
import { useSettings } from "../lib/store";
import {
  formatResumeTime,
  pickNextAvailableServer,
  getServerOrigin,
  getAllowedServerOrigins,
  isTrustedIframeMessage,
} from "../lib/watchHelpers";
import styles from "../styles/Watch.module.css";

export const formatTime = (seconds) => formatResumeTime(seconds);

export default function VideoPlayer({
  servers = [],
  defaultServer,
  title,
  initialProgress = 0,
  initialProgressSeconds = 0,
  onProgress,
  onServerChange,
  onResumeNotice,
  nextEpisode,
  onNext,
  onEpisodeSelect,
  onExit,
  room,
  partyName = "Guest",
  onWatched,
  onVideoElement,
  recommendations = [],
  isTheater = false,
  onToggleTheater,
  embedTimeoutMs = 12000,
}) {
  const stageRef = useRef(null);
  const iframeRef = useRef(null);
  const hideTimer = useRef(null);
  const attempts = useRef(new Set());
  const requestedServer = useRef(defaultServer);
  const currentDurationRef = useRef(0);
  const [settings] = useSettings();
  const [activeId, setActiveId] = useState(defaultServer);
  const [failedServers, setFailedServers] = useState([]);
  const [retry, setRetry] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [switchNotice, setSwitchNotice] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState(false);
  const [selectedSubLanguage, setSelectedSubLanguage] = useState("off");
  const [showRecsDrawer, setShowRecsDrawer] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(
    settings.resumePlayback !== false && initialProgress > 0.02 && initialProgress < 0.95
  );
  const [mobileSheet, setMobileSheet] = useState({
    isOpen: false,
    tabs: {},
    tabNames: [],
    activeTab: "",
  });

  const activeServer = servers.find((server) => server.id === activeId);
  const alternateServer = pickNextAvailableServer(servers, activeId, failedServers);
  const anyOtherOnlineServer = alternateServer || pickNextAvailableServer(servers, activeId, []);
  const activeServerOrigin = getServerOrigin(activeServer);
  const allowedServerOrigins = useMemo(() => getAllowedServerOrigins(servers), [servers]);
  const [embedStatus, setEmbedStatus] = useState({
    key: "",
    loaded: false,
    timedOut: false,
  });
  const currentEmbedKey =
    activeServer?.type === "embed" && activeServer?.url
      ? `${activeServer.id}:${retry}:${activeServer.url}`
      : "";
  const isEmbedLoaded = Boolean(currentEmbedKey) && embedStatus.key === currentEmbedKey && embedStatus.loaded;
  const isEmbedTimedOut = Boolean(currentEmbedKey) && embedStatus.key === currentEmbedKey && embedStatus.timedOut;

  const postToActiveFrame = useCallback(
    (payload, preferredFrame = null) => {
      if (!activeServerOrigin) return false;
      const frame =
        preferredFrame ||
        iframeRef.current ||
        (typeof document !== "undefined"
          ? document.getElementById("player") ||
            document.getElementById("vidbolt-player") ||
            document.getElementById("embed-player")
          : null);
      if (!frame?.contentWindow) return false;
      frame.contentWindow.postMessage(payload, activeServerOrigin);
      return true;
    },
    [activeServerOrigin]
  );

  const switchToServer = useCallback(
    (srv) => {
      if (!srv) return;
      requestedServer.current = srv.id;
      setEmbedStatus({ key: "", loaded: false, timedOut: false });
      setActiveId(srv.id);
      setSwitchNotice(`Switched to ${srv.name}.`);
      onServerChange?.(srv.id);
    },
    [onServerChange]
  );

  const handlePlaybackProgress = useCallback((time, duration) => {
    if (onProgress) onProgress(time, duration);
    if (duration > 0 && time / duration >= 0.9 && onWatched) {
      onWatched();
    }
  }, [onProgress, onWatched]);

  const player = useVideoPlayback({
    streamUrl: activeServer?.type === "embed" ? null : activeServer?.url,
    retry,
    initialProgress: showResumePrompt || settings.resumePlayback === false ? 0 : initialProgress,
    onProgress: handlePlaybackProgress,
    onFailure: () => {
      attempts.current.add(activeId);
      setFailedServers([...attempts.current]);
      const next = pickNextAvailableServer(servers, activeId, attempts.current);
      if (next) {
        requestedServer.current = next.id;
        setSwitchNotice(`${activeServer?.name || "Server"} is unavailable. Switched to ${next.name}.`);
        setActiveId(next.id);
        onServerChange?.(next.id);
      }
      return Boolean(next);
    },
  });

  const handleIframeLoad = () => {
    if (currentEmbedKey) {
      setEmbedStatus({ key: currentEmbedKey, loaded: true, timedOut: false });
    }
    if ((activeServer?.provider === "VidRift" || activeServer?.id === "poseidon") && initialProgressSeconds > 10) {
      try {
        postToActiveFrame({ type: "vidrift:resume", currentTime: Math.floor(initialProgressSeconds) });
      } catch {}
    }
    if ((activeServer?.provider === "VidQueen" || activeServer?.id === "hera") && initialProgressSeconds > 10) {
      try {
        const frame = iframeRef.current || (typeof document !== "undefined" ? document.getElementById("player") : null);
        postToActiveFrame({ type: "SET_TIME", time: Math.floor(initialProgressSeconds) }, frame);
        setTimeout(() => {
          postToActiveFrame({ type: "SET_TIME", time: Math.floor(initialProgressSeconds) }, frame);
        }, 1200);
      } catch {}
    }
  };

  // Auto-failover if embed iframe fails to load within ~12s
  useEffect(() => {
    if (activeServer?.type !== "embed" || !currentEmbedKey || isEmbedLoaded || isEmbedTimedOut) {
      return;
    }
    const ms = Number(embedTimeoutMs) > 0 ? Number(embedTimeoutMs) : 12000;
    const timeoutId = setTimeout(() => {
      attempts.current.add(activeId);
      setFailedServers([...attempts.current]);
      const next = pickNextAvailableServer(servers, activeId, attempts.current);
      if (next) {
        requestedServer.current = next.id;
        setSwitchNotice(`${activeServer?.name || "Server"} timed out. Switched to ${next.name}.`);
        setEmbedStatus({ key: "", loaded: false, timedOut: false });
        setActiveId(next.id);
        onServerChange?.(next.id);
      } else {
        setEmbedStatus({ key: currentEmbedKey, loaded: false, timedOut: true });
      }
    }, ms);
    return () => clearTimeout(timeoutId);
  }, [
    activeServer?.type,
    activeServer?.name,
    activeId,
    currentEmbedKey,
    isEmbedLoaded,
    isEmbedTimedOut,
    servers,
    onServerChange,
    embedTimeoutMs,
  ]);

  // Expose seekTo helper for VidQueen
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.seekTo = (seconds) => {
      const sec = Number(seconds);
      if (!Number.isFinite(sec)) return;
      postToActiveFrame({ type: "SET_TIME", time: sec });
    };
    return () => {
      try {
        delete window.seekTo;
      } catch {}
    };
  }, [postToActiveFrame]);

  const handleMobileOptionSelect = (row) => {
    try {
      const playerEl = iframeRef.current || (typeof document !== "undefined" ? document.getElementById("vidbolt-player") : null);
      postToActiveFrame({ type: "mobile-option", option: row.option, value: row.value }, playerEl);
    } catch (err) {
      console.error("Failed to post mobile-option:", err);
    }
    setMobileSheet((prev) => ({
      ...prev,
      isOpen: false,
    }));
  };

  // Report HTML5 video element for Ambilight reactive glow or null for iframe embeds
  useEffect(() => {
    if (activeServer?.type === "embed") {
      onVideoElement?.(null);
    } else if (player?.videoRef?.current) {
      onVideoElement?.(player.videoRef.current);
    }
  }, [activeServer?.type, onVideoElement, player?.videoRef]);

  useEffect(() => {
    return () => {
      onVideoElement?.(null);
    };
  }, [onVideoElement]);

  // Unified postMessage listener for embed servers (VidQueen, Vidy, VidRift, vidstuck, vidbolt, Cinezo)
  useEffect(() => {
    if (activeServer?.type !== "embed") return;

    const handleMessage = (event) => {
      const frame =
        iframeRef.current ||
        (typeof document !== "undefined"
          ? document.getElementById("player") ||
            document.getElementById("vidbolt-player") ||
            document.getElementById("embed-player")
          : null);
      if (!isTrustedIframeMessage(event, frame?.contentWindow, allowedServerOrigins)) {
        return;
      }

      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          // Non-JSON string, ignore
        }
      }
      if (!data || typeof data !== "object") return;

      // 0. VidQueen (Hera) event handling
      if (event.origin === "https://vidqueen.st") {
        const msg = data || {};

        if (msg.type === "PLAYER_EVENT" && msg.data) {
          const { event: playerEvent, currentTime, duration } = msg.data;
          if (playerEvent === "fullscreen-enter" || playerEvent === "fullscreen-exit") {
            // Fullscreen events handled within embed
          } else {
            // play, pause, seeked, timeupdate, ended
            const curTime = Number(currentTime);
            const durTime = Number(duration);
            if (Number.isFinite(curTime) && curTime >= 0) {
              handlePlaybackProgress(curTime, Number.isFinite(durTime) ? durTime : 0);
            }
            if (playerEvent === "ended") {
              if (onWatched) onWatched();
              if (onNext) onNext();
            }
          }
          return;
        }

        if (msg.type === "MEDIA_DATA" && msg.data?.progress) {
          const { watched, duration } = msg.data.progress;
          const watchedSec = Number(watched);
          const durSec = Number(duration);
          if (Number.isFinite(watchedSec) && watchedSec >= 0) {
            handlePlaybackProgress(watchedSec, Number.isFinite(durSec) ? durSec : 0);
          }
          return;
        }
        return;
      }

      // 1. Cinezo (Ares) event handling (WATCH_PROGRESS: { mediaId, eventType, currentTime, duration })
      if (data.type === "WATCH_PROGRESS" && data.data) {
        if (event.origin !== "https://player.cinezo.live") return;

        const { mediaId, eventType, currentTime, duration } = data.data;
        const timeNum = Number(currentTime);
        const durNum = Number(duration);

        if (mediaId && typeof window !== "undefined") {
          try {
            window.localStorage?.setItem(
              `progress_${mediaId}`,
              JSON.stringify({
                currentTime: timeNum,
                duration: durNum,
                lastWatched: Date.now(),
                eventType,
              })
            );
          } catch {}
        }

        if (Number.isFinite(timeNum) && timeNum >= 0) {
          handlePlaybackProgress(timeNum, durNum);
        }

        if (eventType === "ended") {
          if (onWatched) onWatched();
          if (onNext) onNext();
        }
        return;
      }

      // 1. Vidy event handling (PLAYER_EVENT: { event: "timeupdate" | "ended", currentTime, duration })
      if (data.event === "timeupdate") {
        const currentTime = Number(data.currentTime);
        const duration = Number(data.duration);
        if (Number.isFinite(currentTime) && currentTime >= 0) {
          handlePlaybackProgress(currentTime, duration);
        }
      } else if (data.event === "ended") {
        if (onWatched) onWatched();
        if (onNext) onNext();
      }

      // 2. VidRift event handling (vidrift:progress, vidrift:paused, vidrift:ended, vidrift:nextup-play, vidrift:episode, vidrift:exit)
      if (data.type === "vidrift:progress" || data.type === "vidrift:paused") {
        const currentTime = Number(data.currentTime);
        const duration = Number(data.duration);
        if (Number.isFinite(currentTime) && currentTime >= 0) {
          handlePlaybackProgress(currentTime, duration);
        }
      } else if (data.type === "vidrift:ended" || data.type === "vidrift:nextup-play") {
        if (onWatched) onWatched();
        if (onNext) onNext();
      } else if (data.type === "vidrift:episode") {
        if (onEpisodeSelect && data.season && data.episode) {
          onEpisodeSelect(data.season, data.episode);
        }
      } else if (
        data.type === "vidrift:exit" ||
        data.type === "exit" ||
        data.event === "exit" ||
        data.type === "close" ||
        data.event === "close"
      ) {
        if (onExit) {
          onExit();
        } else if (typeof window !== "undefined" && window.history.length > 1) {
          window.history.back();
        }
      }

      // 3. Vidstuck event handling ({ id, type, progress, timestamp, duration, season, episode })
      if (typeof data.timestamp === "number" && (typeof data.duration === "number" || typeof data.progress === "number")) {
        const currentTime = Number(data.timestamp);
        let duration = Number(data.duration);
        if ((!Number.isFinite(duration) || duration <= 0) && typeof data.progress === "number" && data.progress > 0) {
          const pct = data.progress > 1 ? data.progress / 100 : data.progress;
          duration = currentTime / pct;
        }
        if (Number.isFinite(currentTime) && currentTime >= 0) {
          handlePlaybackProgress(currentTime, duration);
        }
        if (typeof data.progress === "number" && data.progress >= 95) {
          if (onWatched) onWatched();
          if (onNext) onNext();
        }
      }

      // 4. Vidbolt event handling (ready, play, pause, timeupdate, durationchange, ended, mobile-panel)
      if (data.type === "ready") {
        // Vidbolt stream manifest is ready (initial position is handled natively via startAt query param)
      } else if (data.type === "durationchange" && typeof data.duration === "number") {
        currentDurationRef.current = Number(data.duration);
      } else if (
        (data.type === "timeupdate" || data.event === "timeupdate" || data.type === "progress") &&
        (typeof data.time === "number" || typeof data.currentTime === "number")
      ) {
        const currentTime = Number(data.time ?? data.currentTime);
        const duration = Number(data.duration || currentDurationRef.current || 0);
        if (Number.isFinite(currentTime) && currentTime >= 0) {
          handlePlaybackProgress(currentTime, duration);
        }
      } else if ((data.type === "ended" || data.event === "ended")) {
        if (onWatched) onWatched();
        if (onNext) onNext();
      } else if (data.type === "mobile-panel" && Array.isArray(data.options)) {
        const options = data.options;
        const tabs = {};
        for (const row of options) {
          const group = row.group || "Options";
          if (!tabs[group]) tabs[group] = [];
          tabs[group].push(row);
        }
        const tabNames = Object.keys(tabs);
        const activeTab = tabs[data.initialGroup] ? data.initialGroup : tabNames[0];
        setMobileSheet({
          isOpen: true,
          tabs,
          tabNames,
          activeTab,
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeServer?.type, allowedServerOrigins, initialProgressSeconds, handlePlaybackProgress, onWatched, onNext, onEpisodeSelect, onExit]);

  const wake = () => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    if (player.playing) {
      hideTimer.current = setTimeout(() => {
        setChrome(false);
        setShowSettingsMenu(false);
      }, 3000);
    }
  };

  useEffect(() => {
    setChrome(true);
    if (player.playing) hideTimer.current = setTimeout(() => setChrome(false), 3000);
    return () => clearTimeout(hideTimer.current);
  }, [player.playing]);

  const isSeries = title.type !== "movie";
  const showSkipIntro = isSeries && player.ready && player.currentTime >= 15 && player.currentTime < 90;
  const nearEnd = Boolean(nextEpisode) && player.duration > 0 && player.currentTime / player.duration >= 0.95;
  const [countdown, setCountdown] = useState(10);
  const [nextCancelled, setNextCancelled] = useState(false);

  useEffect(() => {
    setNextCancelled(false);
    setCountdown(10);
  }, [title?.id, nextEpisode?.season, nextEpisode?.episode]);

  useEffect(() => {
    if (!defaultServer || requestedServer.current === defaultServer) return;
    requestedServer.current = defaultServer;
    attempts.current.clear();
    setFailedServers([]);
    setSwitchNotice("");
    setActiveId(defaultServer);
  // Only react when the parent explicitly chooses a different server. Tracking
  // activeId here would undo automatic failover when the current source fails.
  }, [defaultServer]);

  useEffect(() => {
    if (!nearEnd || nextCancelled || settings.autoplayNext === false) {
      setCountdown(10);
      return;
    }
    if (countdown <= 0) {
      onNext?.();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [nearEnd, nextCancelled, countdown, onNext, settings.autoplayNext]);

  // Watch party: broadcast local play/pause/seek, apply remote ones.
  useEffect(() => {
    const video = player.videoRef.current;
    if (!room || !video) return;
    let applying = false;
    const conn = joinRoom(room, partyName, {
      onPlayback: ({ type, time }) => {
        applying = true;
        if (Number.isFinite(time) && Math.abs(video.currentTime - time) > 1.5) video.currentTime = time;
        if (type === "play") video.play().catch(() => {});
        if (type === "pause") video.pause();
        setTimeout(() => { applying = false; }, 400);
      },
    });
    if (!conn) return;
    const send = (type) => () => { if (!applying) conn.sendPlayback({ type, time: video.currentTime }); };
    const onPlay = send("play"), onPause = send("pause"), onSeek = send("seek");
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      conn.leave();
    };
  }, [room, partyName, player.videoRef]);

  const skipSec = parseInt(settings.skipInterval || "10", 10) || 10;

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen();
      else player.videoRef.current?.webkitEnterFullscreen?.();
    } catch {
      setSwitchNotice("Fullscreen is unavailable in this browser.");
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (player.videoRef.current && document.pictureInPictureEnabled) {
        await player.videoRef.current.requestPictureInPicture();
      }
    } catch {
      setSwitchNotice("Picture-in-Picture unavailable.");
    }
  };

  const changeSpeed = (speed) => {
    setPlaybackSpeed(speed);
    player.setSpeed?.(speed);
    setShowSettingsMenu(false);
  };

  // Keyboard controls + Escape for player menus/drawers
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (showSettingsMenu || showSubtitlesMenu || showRecsDrawer || mobileSheet.isOpen) {
          setShowSettingsMenu(false);
          setShowSubtitlesMenu(false);
          setShowRecsDrawer(false);
          setMobileSheet((prev) => ({ ...prev, isOpen: false }));
          return;
        }
      }

      const tag = (e.target?.tagName || document.activeElement?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;

      if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        if (activeServer?.id === "hera" || activeServer?.provider === "VidQueen") {
          const frame = iframeRef.current || (typeof document !== "undefined" ? document.getElementById("player") : null);
          const cur = Number(player.currentTime) || 0;
          const next = Math.max(0, cur - skipSec);
          postToActiveFrame({ type: "SET_TIME", time: next }, frame);
        } else {
          player.seek(Math.max(0, player.currentTime - skipSec));
        }
        wake();
      } else if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        if (activeServer?.id === "hera" || activeServer?.provider === "VidQueen") {
          const frame = iframeRef.current || (typeof document !== "undefined" ? document.getElementById("player") : null);
          const cur = Number(player.currentTime) || 0;
          const dur = Number(player.duration) || Infinity;
          const next = Math.min(dur, cur + skipSec);
          postToActiveFrame({ type: "SET_TIME", time: next }, frame);
        } else {
          player.seek(Math.min(player.duration || 0, player.currentTime + skipSec));
        }
        wake();
      } else if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        player.togglePlay();
        wake();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        fullscreen();
        wake();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        player.toggleMute();
        wake();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        player.changeVolume(Math.min(1, Math.round((player.volume + 0.1) * 10) / 10));
        wake();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        player.changeVolume(Math.max(0, Math.round((player.volume - 0.1) * 10) / 10));
        wake();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [player, skipSec, activeServer?.id, activeServer?.provider, postToActiveFrame, showSettingsMenu, showSubtitlesMenu, showRecsDrawer, mobileSheet.isOpen]);

  // Touch gesture handling
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStart.current.time) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.time;

    // Double tap detection (<300ms, little movement)
    if (dt < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) {
        const tapX = e.changedTouches[0].clientX - rect.left;
        if (tapX < rect.width * 0.35) {
          player.seek(Math.max(0, player.currentTime - 10));
          wake();
        } else if (tapX > rect.width * 0.65) {
          player.seek(Math.min(player.duration || 0, player.currentTime + 10));
          wake();
        }
      }
    }
    // Horizontal swipe seek
    else if (Math.abs(dx) > 60 && Math.abs(dy) < 40 && dt < 600) {
      const seekAmount = (dx / 300) * 30; // 30s max swipe
      player.seek(Math.max(0, Math.min(player.duration || 0, player.currentTime + seekAmount)));
      wake();
    }
    // Vertical swipe volume
    else if (Math.abs(dy) > 60 && Math.abs(dx) < 40 && dt < 600) {
      const volChange = -dy / 250;
      player.changeVolume(Math.max(0, Math.min(1, player.volume + volChange)));
      wake();
    }
    touchStart.current.time = 0;
  };

  const retryPlayback = () => {
    attempts.current.clear();
    setFailedServers([]);
    setEmbedStatus({ key: "", loaded: false, timedOut: false });
    setSwitchNotice("");
    setActiveId(defaultServer);
    setRetry((value) => value + 1);
  };

  const handleResume = () => {
    setShowResumePrompt(false);
    if (activeServer?.id === "hera" || activeServer?.provider === "VidQueen") {
      const frame = iframeRef.current || (typeof document !== "undefined" ? document.getElementById("player") : null);
      postToActiveFrame({ type: "SET_TIME", time: Math.floor(initialProgressSeconds) }, frame);
    }
    if (player.duration) {
      player.seek(initialProgress * player.duration);
    }
    if (initialProgressSeconds > 10) {
      onResumeNotice?.(`Resumed from ${formatResumeTime(initialProgressSeconds)}`);
    }
    player.togglePlay();
  };

  const handleStartOver = () => {
    setShowResumePrompt(false);
    if (activeServer?.id === "hera" || activeServer?.provider === "VidQueen") {
      const frame = iframeRef.current || (typeof document !== "undefined" ? document.getElementById("player") : null);
      postToActiveFrame({ type: "SET_TIME", time: 0 }, frame);
    }
    player.seek(0);
    player.togglePlay();
  };

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocus={wake}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {activeServer?.type === "embed" ? (
        <>
          <iframe
            ref={iframeRef}
            id={
              activeServer?.id === "hera" || activeServer?.provider === "VidQueen"
                ? "player"
                : activeServer?.id === "apollo" || activeServer?.provider === "vidbolt"
                ? "vidbolt-player"
                : "embed-player"
            }
            key={`${activeServer?.id || "embed-player"}-${retry}`}
            src={
              activeServer?.url && activeServer.url.includes("play4u.org") && !activeServer.url.includes("embed=")
                ? `${activeServer.url}${activeServer.url.includes("?") ? "&" : "?"}embed=1`
                : activeServer?.url
            }
            title={`${title.title || "Video Player"} - ${activeServer.name}`}
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: 0,
            }}
            frameBorder="0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
            referrerPolicy="origin-when-cross-origin"
            loading="lazy"
            className={styles.embedIframe}
            onLoad={handleIframeLoad}
          />
          {isEmbedTimedOut && (
            <div className={styles.status} role="alert" style={{ background: "rgba(7, 8, 13, 0.86)", inset: 0 }}>
              <p>{activeServer?.name || "This server"} timed out after 12 seconds.</p>
              <div className={styles.unavailableActions}>
                {anyOtherOnlineServer && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => switchToServer(anyOtherOnlineServer)}
                  >
                    Try another server ({anyOtherOnlineServer.name})
                  </button>
                )}
                <button type="button" className="chip" onClick={retryPlayback}>
                  Retry
                </button>
              </div>
            </div>
          )}
          {!isEmbedTimedOut && switchNotice && (
            <div
              role="status"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 999,
                background: "rgba(18, 20, 26, 0.85)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>{switchNotice}</span>
              {anyOtherOnlineServer && (
                <button
                  type="button"
                  onClick={() => switchToServer(anyOtherOnlineServer)}
                  style={{
                    background: "rgba(255, 255, 255, 0.16)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.24)",
                    borderRadius: 999,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Try another server
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss server notice"
                onClick={() => setSwitchNotice("")}
                style={{
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  border: 0,
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          )}
          {/* Embed servers (VidRift, Vidy, vidstuck, vidbolt, etc.) have their own native back button & title.
              Overlaying our back button causes duplicate text and visual collisions. */}
          {mobileSheet.isOpen && (
            <div className={styles.mobileSheetOverlay} onClick={() => setMobileSheet((prev) => ({ ...prev, isOpen: false }))}>
              <div className={styles.mobileSheetContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.mobileSheetHeader}>
                  <div className={styles.mobileSheetTabs}>
                    {mobileSheet.tabNames.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        className={`${styles.mobileSheetTab} ${mobileSheet.activeTab === tab ? styles.mobileSheetTabActive : ""}`}
                        onClick={() => setMobileSheet((prev) => ({ ...prev, activeTab: tab }))}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.mobileSheetClose}
                    onClick={() => setMobileSheet((prev) => ({ ...prev, isOpen: false }))}
                    aria-label="Close settings"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.mobileSheetList}>
                  {(mobileSheet.tabs[mobileSheet.activeTab] || []).map((row, idx) => (
                    <button
                      key={`${row.option}-${row.value}-${idx}`}
                      type="button"
                      className={`${styles.mobileSheetRow} ${row.selected ? styles.mobileSheetRowSelected : ""}`}
                      onClick={() => handleMobileOptionSelect(row)}
                    >
                      <span className={styles.mobileSheetLabel}>{row.label || row.value}</span>
                      {row.selected && <span className={styles.mobileSheetCheck}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <video
            ref={(el) => {
              const vr = player.videoRef;
              if (vr) {
                // eslint-disable-next-line react-hooks/immutability
                vr.current = el;
              }
              if (activeServer?.type !== "embed") {
                onVideoElement?.(el);
              }
            }}
            crossOrigin="anonymous"
            className={styles.video}
            playsInline
            preload="metadata"
            poster={title.backdrop || title.poster}
            aria-label={`${title.title} video`}
            onClick={player.togglePlay}
          />
          <div className={styles.vignette} />

          {/* Cast Icon in top right */}
          <div className={`${styles.castIconTop} ${chrome ? "" : styles.hidden}`}>
            <button
              type="button"
              className={styles.iconBtnMinimal}
              title="Google Cast"
              aria-label="Google Cast"
              onClick={() => setSwitchNotice("Cast is ready when a compatible screen is on your Wi-Fi.")}
            >
              <Tv size={20} />
            </button>
          </div>

          {/* Resume Prompt Modal */}
          {showResumePrompt && (
            <div className={styles.resumePromptCard} role="dialog" aria-label="Resume playback">
              <p className={styles.resumePromptTitle}>
                {initialProgressSeconds > 10
                  ? `Resume from ${formatResumeTime(initialProgressSeconds)}?`
                  : "Resume from where you left off?"}
              </p>
              <div className={styles.resumePromptActions}>
                <button type="button" className={styles.resumeBtnPrimary} onClick={handleResume}>
                  Resume
                </button>
                <button type="button" className={styles.resumeBtnSecondary} onClick={handleStartOver}>
                  Start over
                </button>
              </div>
            </div>
          )}

          {/* Big Center Play Button */}
          {player.ready && !player.playing && !player.error && !showResumePrompt && (
            <button type="button" className={styles.center} onClick={player.togglePlay} aria-label="Play">
              <span className={styles.bigPlay}>
                <Play size={34} fill="currentColor" />
              </span>
            </button>
          )}

          {/* Status / Buffering / Error */}
          {player.error ? (
            <div className={styles.status} role="alert">
              <p>{player.error}</p>
              <div className={styles.unavailableActions}>
                <button type="button" className="chip" onClick={retryPlayback}>
                  Retry playback
                </button>
                {alternateServer && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => switchToServer(alternateServer)}
                  >
                    Try another server ({alternateServer.name})
                  </button>
                )}
              </div>
            </div>
          ) : player.buffering ? (
            <div className={styles.status} role="status">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/loader-leaf.gif"
                alt=""
                style={{
                  width: 68,
                  height: "auto",
                  display: "block",
                  filter: "drop-shadow(0 4px 16px rgba(255, 255, 255, 0.25))",
                }}
              />
              <p>{player.ready ? "Buffering…" : "Loading stream…"}</p>
            </div>
          ) : null}

          {/* Skip Intro Button */}
          {showSkipIntro && !nearEnd && (
            <button
              type="button"
              className={styles.skipBtn}
              onClick={() => player.seek(Math.min(player.duration || Infinity, player.currentTime + 85))}
            >
              Skip intro
            </button>
          )}

          {/* Next Episode Card */}
          {nearEnd && !nextCancelled && (
            <div className={styles.nextCard} role="status">
              <span>
                {settings.autoplayNext === false
                  ? `Up next: S${nextEpisode.season} E${nextEpisode.episode}`
                  : `Next episode in ${countdown}s`}
              </span>
              <button type="button" className={styles.skipBtn} onClick={() => onNext?.()}>
                Play now
              </button>
              <button type="button" className={styles.skipBtn} onClick={() => setNextCancelled(true)}>
                Cancel
              </button>
            </div>
          )}

          {/* Bottom Controls Bar */}
          <div className={`${styles.bar} ${chrome ? "" : styles.hidden}`}>
            <p className={styles.playerNotice} role="status">
              {player.notice || switchNotice}
            </p>

            {/* Seek Bar */}
            <input
              className={styles.seek}
              type="range"
              min={0}
              max={player.duration || 0}
              step="0.1"
              value={Math.min(player.currentTime, player.duration || 0)}
              disabled={!player.ready}
              aria-label="Seek time"
              aria-valuetext={`${formatTime(player.currentTime)} of ${formatTime(player.duration)}`}
              style={{ "--p": `${player.duration ? (player.currentTime / player.duration) * 100 : 0}%` }}
              onChange={(event) => player.seek(Number(event.target.value))}
            />

            <div className={styles.controls}>
              {/* Controls Left: Play, Seek -10s, Seek +10s, Volume, Time */}
              <div className={styles.controlsLeft}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={player.togglePlay}
                  disabled={!player.ready}
                  aria-label={player.playing ? "Pause" : "Play"}
                >
                  {player.playing ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
                </button>

                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => player.seek(Math.max(0, player.currentTime - 10))}
                  aria-label="Seek back 10 seconds"
                  title="Seek back 10 seconds"
                >
                  <RotateCcw size={19} />
                </button>

                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => player.seek(Math.min(player.duration || 0, player.currentTime + 10))}
                  aria-label="Seek forward 10 seconds"
                  title="Seek forward 10 seconds"
                >
                  <RotateCw size={19} />
                </button>

                <button
                  type="button"
                  className={styles.btn}
                  onClick={player.toggleMute}
                  aria-label={player.muted ? "Unmute" : "Mute"}
                >
                  {player.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>

                <input
                  className={styles.volume}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-label="Volume"
                  value={player.muted ? 0 : player.volume}
                  onChange={(event) => player.changeVolume(Number(event.target.value))}
                />

                <span className={styles.time}>
                  {formatTime(player.currentTime)} / {formatTime(player.duration)}
                </span>
              </div>

              {/* Controls Right: PiP, Subtitles, Settings Gear, Theater, Fullscreen */}
              <div className={styles.controlsRight}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={togglePiP}
                  title="Picture-in-Picture"
                  aria-label="Picture-in-Picture"
                >
                  <PictureInPicture2 size={19} />
                </button>

                {/* Subtitles & Captions Popover */}
                <div className={styles.srvWrap}>
                  <button
                    type="button"
                    className={`${styles.btn} ${showSubtitlesMenu || selectedSubLanguage !== "off" ? styles.btnActive : ""}`}
                    onClick={() => {
                      setShowSubtitlesMenu((v) => !v);
                      setShowSettingsMenu(false);
                      setShowRecsDrawer(false);
                    }}
                    title="Subtitles & Captions"
                    aria-label="Subtitles & Captions"
                  >
                    <Captions size={19} />
                  </button>

                  {showSubtitlesMenu && (
                    <div className={styles.srvMenu} role="menu" aria-label="Subtitles & Captions">
                      <span className={styles.srvMenuTitle}>Subtitles</span>
                      <button
                        type="button"
                        className={`${styles.srvItem} ${selectedSubLanguage === "off" ? styles.srvActive : ""}`}
                        onClick={() => {
                          setSelectedSubLanguage("off");
                          player.chooseSubtitleTrack?.(-1);
                          setShowSubtitlesMenu(false);
                        }}
                      >
                        <span>Off</span>
                        {selectedSubLanguage === "off" && <Check size={14} />}
                      </button>
                      {player.subtitleTracks?.length > 0 ? (
                        player.subtitleTracks.map((tr) => (
                          <button
                            key={tr.id}
                            type="button"
                            className={`${styles.srvItem} ${player.selectedSubtitleTrack === tr.id ? styles.srvActive : ""}`}
                            onClick={() => {
                              setSelectedSubLanguage(tr.lang || tr.label);
                              player.chooseSubtitleTrack?.(tr.id);
                              setShowSubtitlesMenu(false);
                            }}
                          >
                            <span>{tr.label}</span>
                            {player.selectedSubtitleTrack === tr.id && <Check size={14} />}
                          </button>
                        ))
                      ) : (
                        <p className={styles.srvEmptyNote}>No subtitle tracks for this stream</p>
                      )}
                    </div>
                  )}
                </div>

                {/* More Like This Popover / Drawer */}
                {recommendations && recommendations.length > 0 && (
                  <button
                    type="button"
                    className={`${styles.btn} ${showRecsDrawer ? styles.btnActive : ""}`}
                    onClick={() => {
                      setShowRecsDrawer((v) => !v);
                      setShowSettingsMenu(false);
                      setShowSubtitlesMenu(false);
                    }}
                    title="More like this"
                    aria-label="More like this"
                  >
                    <Sparkles size={19} />
                  </button>
                )}

                {/* Settings Gear Popover */}
                <div className={styles.srvWrap}>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => {
                      setShowSettingsMenu((v) => !v);
                      setShowSubtitlesMenu(false);
                      setShowRecsDrawer(false);
                    }}
                    title="Playback Settings"
                    aria-label="Playback Settings"
                  >
                    <SettingsIcon size={19} />
                  </button>

                  {showSettingsMenu && (
                    <div className={styles.srvMenu}>
                      {/* Speed Selector */}
                      <span className={styles.srvMenuTitle}>Speed</span>
                      <div className={styles.speedRow}>
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`${styles.speedBtn} ${playbackSpeed === s ? styles.speedBtnActive : ""}`}
                            onClick={() => changeSpeed(s)}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>

                      {/* Audio Track Selector */}
                      {player.audioTracks?.length > 1 && (
                        <>
                          <hr className={styles.srvDivider} />
                          <span className={styles.srvMenuTitle}>Audio</span>
                          {player.audioTracks.map((tr) => (
                            <button
                              key={tr.id}
                              type="button"
                              className={`${styles.srvItem} ${player.selectedAudioTrack === tr.id ? styles.srvActive : ""}`}
                              onClick={() => {
                                player.chooseAudioTrack?.(tr.id);
                                setShowSettingsMenu(false);
                              }}
                            >
                              <span>{tr.label}</span>
                              {player.selectedAudioTrack === tr.id && <Check size={14} />}
                            </button>
                          ))}
                        </>
                      )}

                      {/* Quality Selector */}
                      {player.qualities?.length > 0 && (
                        <>
                          <hr className={styles.srvDivider} />
                          <span className={styles.srvMenuTitle}>Quality</span>
                          <button
                            type="button"
                            className={`${styles.srvItem} ${player.quality === -1 ? styles.srvActive : ""}`}
                            onClick={() => {
                              player.chooseQuality(-1);
                              setShowSettingsMenu(false);
                            }}
                          >
                            <span>Auto{player.currentHeight ? ` (${player.currentHeight}p)` : ""}</span>
                          </button>
                          {player.qualities.map((h) => (
                            <button
                              key={h}
                              type="button"
                              className={`${styles.srvItem} ${player.quality === h ? styles.srvActive : ""}`}
                              onClick={() => {
                                player.chooseQuality(h);
                                setShowSettingsMenu(false);
                              }}
                            >
                              <span>{h}p</span>
                            </button>
                          ))}
                        </>
                      )}

                      {/* Server Selector */}
                      {servers.length > 0 && (
                        <>
                          <hr className={styles.srvDivider} />
                          <span className={styles.srvMenuTitle}>Server</span>
                          {servers.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={`${styles.srvItem} ${activeId === s.id ? styles.srvActive : ""}`}
                              disabled={s.status !== "online"}
                              onClick={() => {
                                switchToServer(s);
                                setShowSettingsMenu(false);
                              }}
                            >
                              <span>{s.name}</span>
                              <span className={styles.srvBadge}>
                                {s.status !== "online" ? "Offline" : failedServers.includes(s.id) ? "Retry" : "Online"}
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Theater Mode */}
                <button
                  type="button"
                  className={`${styles.btn} ${isTheater ? styles.btnActive : ""}`}
                  onClick={() => onToggleTheater?.()}
                  title={isTheater ? "Exit Theater Mode" : "Theater Mode"}
                  aria-label="Theater Mode"
                >
                  <RectangleHorizontal size={19} />
                </button>

                <button type="button" className={styles.btn} onClick={fullscreen} aria-label="Fullscreen">
                  <Maximize size={20} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* In-Player "More Like This" Slide-Out Drawer */}
      {showRecsDrawer && recommendations && recommendations.length > 0 && (
        <div className={styles.inPlayerDrawerOverlay} onClick={() => setShowRecsDrawer(false)}>
          <div className={styles.inPlayerDrawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.inPlayerDrawerHeader}>
              <div>
                <h4 className={styles.inPlayerDrawerTitle}>More like this</h4>
                <p className={styles.inPlayerDrawerSub}>
                  Similar cast, director & vibe for {title?.title || "current title"}
                </p>
              </div>
              <button
                type="button"
                className={styles.inPlayerDrawerClose}
                onClick={() => setShowRecsDrawer(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.inPlayerCardsGrid}>
              {recommendations.map((rec) => (
                <Link
                  key={rec.id}
                  href={`/watch/${rec.id}`}
                  className={styles.inPlayerCard}
                  onClick={() => setShowRecsDrawer(false)}
                >
                  <div className={styles.inPlayerCardThumbWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rec.backdrop || rec.poster}
                      alt={rec.title}
                      className={styles.inPlayerCardImg}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    {rec.matchReason && (
                      <span className={styles.inPlayerCardBadge}>{rec.matchReason}</span>
                    )}
                  </div>
                  <div className={styles.inPlayerCardBody}>
                    <span className={styles.inPlayerCardTitle}>{rec.title}</span>
                    <div className={styles.inPlayerCardMeta}>
                      <span>{rec.year ? `${rec.year} · ` : ""}{rec.type === "movie" ? "Movie" : "Series"}</span>
                      {rec.rating > 0 && <span>★ {rec.rating}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

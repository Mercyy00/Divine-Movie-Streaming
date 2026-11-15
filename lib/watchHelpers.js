/**
 * Pure helpers for Title and Watch pages (Phase 4).
 * Kept dependency-free so node:test can verify edge cases directly.
 */

export function formatResumeTime(seconds) {
  const sec = Math.max(0, Math.floor(Number.isFinite(Number(seconds)) ? Number(seconds) : 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(rem).padStart(2, "0")}`;
}

export function extractResumeSeconds(entry, fallbackDurationSec = 0) {
  if (!entry || typeof entry !== "object") return 0;
  const progress = Number(entry.progress);
  if (Number.isFinite(progress) && progress >= 0.95) return 0;

  if (Number.isFinite(Number(entry.currentTime)) && Number(entry.currentTime) > 0) {
    return Math.floor(Number(entry.currentTime));
  }

  if (Number.isFinite(progress) && progress > 0 && progress < 0.95) {
    if (Number.isFinite(Number(entry.duration)) && Number(entry.duration) > 0) {
      return Math.floor(Number(entry.duration) * progress);
    }
    if (Number.isFinite(Number(entry.secondsLeft)) && Number(entry.secondsLeft) > 0) {
      return Math.floor((Number(entry.secondsLeft) / (1 - progress)) * progress);
    }
    if (Number.isFinite(Number(fallbackDurationSec)) && Number(fallbackDurationSec) > 0) {
      return Math.floor(Number(fallbackDurationSec) * progress);
    }
  }

  return 0;
}

export function computeNextEpisode({
  isSeries,
  currentSeason = 1,
  currentEpisode = 1,
  totalSeasons = 1,
  totalEpisodes = 0,
}) {
  if (!isSeries) return null;
  const s = Math.max(1, Math.floor(Number(currentSeason) || 1));
  const ep = Math.max(1, Math.floor(Number(currentEpisode) || 1));
  const totS = Math.max(1, Math.floor(Number(totalSeasons) || 1));
  const totEp = Math.max(0, Math.floor(Number(totalEpisodes) || 0));

  if (totEp > 0 && ep < totEp) {
    return { season: s, episode: ep + 1 };
  }
  if (s < totS && (totEp === 0 || ep >= totEp)) {
    return { season: s + 1, episode: 1 };
  }
  return null;
}

export function pickNextAvailableServer(servers = [], currentId = null, excludedIds = []) {
  if (!Array.isArray(servers) || servers.length === 0) return null;
  const excluded = new Set(excludedIds instanceof Set ? [...excludedIds] : Array.isArray(excludedIds) ? excludedIds : []);
  if (currentId) excluded.add(currentId);
  return servers.find((srv) => srv && srv.status === "online" && !excluded.has(srv.id)) || null;
}

export function getSeasonEpisodeCount(title, seasonNumber = 1) {
  if (!title || typeof title !== "object") return 0;
  const sNum = Math.max(1, Math.floor(Number(seasonNumber) || 1));
  if (Array.isArray(title.seasonsList)) {
    const match = title.seasonsList.find((s) => Number(s.seasonNumber) === sNum);
    if (match) {
      if (Number(match.episodeCount) > 0) return Number(match.episodeCount);
      if (Array.isArray(match.episodes) && match.episodes.length > 0) return match.episodes.length;
    }
  }
  if (sNum === 1) {
    if (Array.isArray(title.episodes) && title.episodes.length > 0) return title.episodes.length;
    if (Array.isArray(title.seasons?.[0]?.episodes) && title.seasons[0].episodes.length > 0) {
      return title.seasons[0].episodes.length;
    }
  }
  return 0;
}

export function buildTitleMetaParts(t, runtimeStr = "") {
  if (!t || typeof t !== "object") return [];
  const parts = [];
  if (Number(t.rating) > 0) {
    parts.push({ key: "rating", kind: "rating", value: Number(t.rating) });
  }
  if (t.year) {
    parts.push({ key: "year", kind: "text", value: String(t.year) });
  }
  if (runtimeStr && typeof runtimeStr === "string" && runtimeStr.trim()) {
    parts.push({ key: "runtime", kind: "text", value: runtimeStr.trim() });
  }
  if (t.cert && typeof t.cert === "string" && t.cert.trim()) {
    parts.push({ key: "cert", kind: "cert", value: t.cert.trim() });
  }
  if (t.quality && typeof t.quality === "string" && t.quality.trim()) {
    parts.push({ key: "quality", kind: "quality", value: t.quality.trim() });
  }
  if (t.anilistId) {
    parts.push({ key: "anilist", kind: "anilist", value: `AniList #${t.anilistId}` });
  }
  return parts;
}

export function getServerOrigin(serverOrUrl) {
  if (!serverOrUrl) return "";
  if (typeof serverOrUrl === "object") {
    if (typeof serverOrUrl.origin === "string" && /^https?:\/\//i.test(serverOrUrl.origin)) {
      try {
        return new URL(serverOrUrl.origin).origin;
      } catch {
        // fall through to url
      }
    }
    return getServerOrigin(serverOrUrl.url);
  }
  if (typeof serverOrUrl !== "string") return "";
  const raw = serverOrUrl.trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export function getAllowedServerOrigins(servers = []) {
  const origins = new Set();
  if (!Array.isArray(servers)) return origins;
  for (const srv of servers) {
    const origin = getServerOrigin(srv);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function isTrustedIframeMessage(event, iframeWindow, allowedOrigins) {
  if (!event || !iframeWindow) return false;
  if (event.source !== iframeWindow) return false;
  if (typeof event.origin !== "string" || !event.origin || event.origin === "null") return false;
  if (!(allowedOrigins instanceof Set)) return false;
  return allowedOrigins.has(event.origin);
}

export function getSafeDownloadUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    return new URL(trimmed).href;
  } catch {
    return "";
  }
}

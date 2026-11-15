import { z } from "zod";

export const guestTitleSnapshotSchema = z
  .object({
    id: z.union([z.string().max(120), z.number()]).optional(),
    tmdbId: z.union([z.string().max(40), z.number()]).optional(),
    title: z.string().max(240).optional(),
    name: z.string().max(240).optional(),
    type: z.enum(["movie", "series", "anime", "tv"]).optional(),
    year: z.union([z.string().max(16), z.number()]).optional(),
    rating: z.union([z.string().max(16), z.number()]).optional(),
    runtime: z.union([z.string().max(32), z.number()]).optional(),
    poster: z.string().max(500).optional(),
    backdrop: z.string().max(500).optional(),
    logo: z.string().max(500).optional(),
    genres: z.array(z.string().max(48)).max(12).optional(),
    quality: z.string().max(32).optional(),
    badge: z.string().max(32).optional(),
    cert: z.string().max(32).optional(),
    service: z.string().max(48).optional(),
    studio: z.string().max(80).optional(),
  })
  .strict();

export const guestHistoryItemSchema = z
  .object({
    id: z.string().min(1).max(120),
    progress: z.number().min(0).max(1).default(0),
    season: z.number().int().min(0).max(500).optional(),
    episode: z.number().int().min(0).max(5000).optional(),
    timeLeft: z.string().max(40).nullable().optional(),
    at: z.number().nonnegative().optional(),
    currentTime: z.number().nonnegative().optional(),
    duration: z.number().nonnegative().optional(),
    secondsLeft: z.number().nonnegative().optional(),
    tmdbId: z.union([z.string().max(40), z.number()]).optional(),
    title: guestTitleSnapshotSchema.optional(),
  })
  .strict();

export const guestSyncPayloadSchema = z
  .object({
    guestId: z.string().regex(/^[a-zA-Z0-9_-]{12,64}$/, "Invalid guestId format"),
    history: z.array(guestHistoryItemSchema).max(200),
  })
  .strict();

export function normalizeGuestHistoryRows(guestId, history = []) {
  const deduped = new Map();
  for (const item of history) {
    const season = Number(item.season) || 0;
    const episode = Number(item.episode) || 0;
    const key = `${item.id}:${season}:${episode}`;
    const watchedAtMs = Number(item.at) || Date.now();
    const existing = deduped.get(key);
    if (existing && existing.watchedAt.getTime() >= watchedAtMs) continue;

    const baseTitle = item.title && typeof item.title === "object" ? { ...item.title } : { id: item.id };
    const playback = {};
    if (Number.isFinite(item.currentTime)) playback.currentTime = Math.floor(item.currentTime);
    if (Number.isFinite(item.duration)) playback.duration = Math.floor(item.duration);
    if (Number.isFinite(item.secondsLeft)) playback.secondsLeft = Math.floor(item.secondsLeft);
    if (item.tmdbId) playback.tmdbId = item.tmdbId;

    deduped.set(key, {
      guestId,
      titleId: item.id.slice(0, 120),
      titleData: Object.keys(playback).length ? { ...baseTitle, _playback: playback } : baseTitle,
      progress: Number.isFinite(item.progress) ? Math.min(1, Math.max(0, item.progress)) : 0,
      season,
      episode,
      timeLeft: typeof item.timeLeft === "string" ? item.timeLeft.slice(0, 40) : null,
      watchedAt: new Date(watchedAtMs),
    });
  }
  return [...deduped.values()];
}

/**
 * Pure merge of GuestWatchHistory rows into User WatchHistory rows,
 * deduping by (titleId, season, episode) and keeping the latest watchedAt.
 */
export function mergeGuestIntoUserWatchHistory(userId, guestRows = [], userRows = []) {
  const byKey = new Map();
  for (const u of userRows) {
    const key = `${u.titleId}:${u.season || 0}:${u.episode || 0}`;
    byKey.set(key, {
      ...u,
      watchedAt: u.watchedAt instanceof Date ? u.watchedAt : new Date(u.watchedAt || 0),
    });
  }

  const upserts = [];
  for (const g of guestRows) {
    const season = Number(g.season) || 0;
    const episode = Number(g.episode) || 0;
    const key = `${g.titleId}:${season}:${episode}`;
    const gTime = g.watchedAt instanceof Date ? g.watchedAt : new Date(g.watchedAt || 0);
    const existing = byKey.get(key);

    if (!existing || gTime.getTime() > existing.watchedAt.getTime()) {
      const mergedRow = {
        userId,
        titleId: g.titleId,
        titleData: g.titleData || {},
        progress: Number(g.progress) || 0,
        season,
        episode,
        timeLeft: g.timeLeft || null,
        watchedAt: gTime,
      };
      byKey.set(key, mergedRow);
      upserts.push(mergedRow);
    }
  }

  return upserts;
}

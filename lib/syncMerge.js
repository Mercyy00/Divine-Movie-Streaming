// Pure functions for merging client and server user state
import { mergeWatchLog } from "./profileStats.js";
export { mergeWatchLog };

export const DEVICE_SPECIFIC_SETTINGS = new Set([
  "volume",
  "device",
  "deviceLabel",
  "tmdbKey",
]);

export function cleanSettingsForSync(settings = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!DEVICE_SPECIFIC_SETTINGS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

export const keyOfHistory = (e) => `${e?.id}:${e?.season || 0}:${e?.episode || 0}`;

export function mergeHistory(serverHistory = [], localHistory = []) {
  const map = new Map();
  [...serverHistory, ...localHistory].forEach((item) => {
    if (!item?.id) return;
    const k = keyOfHistory(item);
    const existing = map.get(k);
    if (!existing || (item.at || 0) > (existing.at || 0)) {
      map.set(k, item);
    }
  });
  return [...map.values()]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, 60);
}

export function mergeWatchlist(serverWatchlist = [], localWatchlist = []) {
  const seen = new Set();
  const merged = [];
  [...localWatchlist, ...serverWatchlist].forEach((item) => {
    const id = typeof item === "string" ? item : item?.id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(item);
  });
  return merged;
}

export function mergeCustomLists(serverLists = [], localLists = []) {
  const customListIds = new Set((localLists || []).map((c) => c.id));
  return [
    ...(localLists || []),
    ...((serverLists || []).filter((c) => c && c.id && !customListIds.has(c.id))),
  ];
}

export function mergeProfilesList(serverProfiles = [], localProfiles = []) {
  const map = new Map();
  (serverProfiles || []).forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });
  (localProfiles || []).forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });
  return [...map.values()];
}

export function mergeProfileBucket(serverBucket = {}, localBucket = {}) {
  const mergedHistory = mergeHistory(serverBucket.history || [], localBucket.history || []);
  const mergedWatchlist = mergeWatchlist(
    serverBucket.watchlist || [],
    localBucket.watchlist || localBucket.list || []
  );
  const mergedCustomLists = mergeCustomLists(
    serverBucket.customLists || [],
    localBucket.customLists || []
  );
  const mergedReactions = { ...(serverBucket.reactions || {}), ...(localBucket.reactions || {}) };
  const mergedRatings = { ...(serverBucket.ratings || {}), ...(localBucket.ratings || {}) };
  const mergedWatched = { ...(serverBucket.watched || {}), ...(localBucket.watched || {}) };
  const mergedWatchLog = mergeWatchLog(serverBucket.watchLog || [], localBucket.watchLog || []);
  const scheduleSeen = new Set();
  const mergedSchedule = [...(localBucket.schedule || []), ...(serverBucket.schedule || [])].filter((item) => {
    const id = typeof item === "object" ? item?.id : item;
    if (!id || scheduleSeen.has(String(id))) return false;
    scheduleSeen.add(String(id));
    return true;
  });

  return {
    history: mergedHistory,
    watchlist: mergedWatchlist,
    customLists: mergedCustomLists,
    reactions: mergedReactions,
    ratings: mergedRatings,
    watched: mergedWatched,
    watchLog: mergedWatchLog,
    schedule: mergedSchedule,
  };
}

export function mergeUserData(server = {}, local = {}) {
  const mergedHistory = mergeHistory(server.history || [], local.history || []);
  const mergedWatchlist = mergeWatchlist(server.watchlist || [], local.list || []);

  const serverExtras = server.extras || {};
  const mergedReactions = { ...(serverExtras.reactions || {}), ...(local.reactions || {}) };
  const mergedRatings = { ...(serverExtras.ratings || {}), ...(local.ratings || {}) };
  const mergedWatched = { ...(serverExtras.watched || {}), ...(local.watched || {}) };
  const mergedCustomLists = mergeCustomLists(serverExtras.customLists || [], local.customLists || []);

  const safeServerSettings = cleanSettingsForSync(serverExtras.settings || {});
  const safeLocalSettings = cleanSettingsForSync(local.settings || {});
  const mergedSettings = {
    ...safeServerSettings,
    ...safeLocalSettings,
  };

  const mergedWatchLog = mergeWatchLog(serverExtras.watchLog || [], local.watchLog || []);

  const hasProfiles =
    (Array.isArray(serverExtras.profiles) && serverExtras.profiles.length > 0) ||
    (Array.isArray(local.profiles) && local.profiles.length > 0);
  const mergedProfiles = hasProfiles
    ? mergeProfilesList(serverExtras.profiles || [], local.profiles || [])
    : undefined;

  const serverBuckets = serverExtras.profileBuckets || {};
  const localBuckets = local.profileBuckets || {};
  const bucketIds = new Set([
    ...Object.keys(serverBuckets).filter((id) => id && id !== "guest"),
    ...Object.keys(localBuckets).filter((id) => id && id !== "guest"),
  ]);
  const mergedProfileBuckets = {};
  for (const pid of bucketIds) {
    mergedProfileBuckets[pid] = mergeProfileBucket(serverBuckets[pid] || {}, localBuckets[pid] || {});
  }

  return {
    schemaVersion: 1,
    history: mergedHistory,
    watchlist: mergedWatchlist,
    extras: {
      settings: mergedSettings,
      reactions: mergedReactions,
      ratings: mergedRatings,
      watched: mergedWatched,
      customLists: mergedCustomLists,
      watchLog: mergedWatchLog,
      ...(mergedProfiles ? { profiles: mergedProfiles } : {}),
      ...(bucketIds.size > 0 ? { profileBuckets: mergedProfileBuckets } : {}),
    },
  };
}

import { PROFILE_AVATARS, DEFAULT_AVATAR, normalizeAvatarUrl } from "./avatars.js";
import { useSyncExternalStore, useCallback, useEffect } from "react";

// Tiny localStorage-backed store. Safe on the server and when storage is blocked.
const listeners = new Set();
const cache = new Map();

function notifyListeners() {
  listeners.forEach((l) => l());
}

function read(key, fallback) {
  if (typeof window === "undefined") return fallback;
  if (cache.has(key)) return cache.get(key);
  let value = fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) value = JSON.parse(raw);
  } catch {}
  cache.set(key, value);
  return value;
}

function write(key, value, notify = true) {
  cache.set(key, value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
  if (notify) notifyListeners();
}

function subscribe(cb) {
  listeners.add(cb);
  const onStorage = (e) => {
    if (e.key && e.key.startsWith("viv:")) {
      cache.delete(e.key);
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStored(key, fallback) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback
  );
  const set = useCallback(
    (next) => write(key, typeof next === "function" ? next(read(key, fallback)) : next),
    [key, fallback]
  );
  return [value, set];
}

export const PROFILE_SCOPED_BASE_KEYS = [
  "viv:history",
  "viv:list",
  "viv:custom_lists",
  "viv:reactions",
  "viv:watched_episodes",
  "viv:user_ratings",
  "viv:schedule",
  "viv:searches",
  "viv:watch_log",
  "viv:notifications_read",
  "viv:notifications_dismissed",
];

export function getProfileStorageKey(baseKey, profileId = "guest") {
  if (!profileId || profileId === "guest") return baseKey;
  return `${baseKey}::${String(profileId)}`;
}

export function useProfileStored(baseKey, fallback) {
  const [activeProfileId] = useActiveProfileId();
  const scopedKey = getProfileStorageKey(baseKey, activeProfileId || "guest");
  return useStored(scopedKey, fallback);
}

const EMPTY_LIST = [];
const EMPTY_OBJ = {};

export const DEFAULT_HISTORY = [];

export const DEFAULT_WATCHLIST = [];

export const DEFAULT_REACTIONS = {};

export const SETTINGS_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS = {
  _version: SETTINGS_SCHEMA_VERSION,
  // 1. Account
  name: "Guest",
  email: "guest@divine.internal",
  avatar: "",
  signedIn: false,
  publicProfile: false,
  showWatchHistory: false,
  passwordSet: false,
  googleLinked: false,
  historyHidden: false,

  // 2. Integrations
  simklConnected: false,
  traktConnected: false,
  anilistConnected: false,
  malConnected: false,

  // 3. Player
  preferredQuality: "Auto",
  preferredAudio: "Original",
  skipInterval: "10s",
  autoplayNext: true,
  pauseScreen: true,
  skipIntros: false,
  skipCredits: false,
  skipFiller: false,
  resumePlayback: true,
  rememberLastSource: false,
  dataSaver: false,

  // 4. Appearance
  theme: "dark",
  accent: "autumn", // "autumn" | "gold" | "mono"
  themeMode: "default", // "default" | "performance"
  smoothScroll: true, // Buttery smooth inertial momentum scrolling
  showBackground: true,
  bgIntensity: 85,
  ambientLight: "art", // "art" | "live" | "off"
  autoplayPreviews: true,
  bannerTrailersOnHover: false,

  // 5. Content & Privacy
  region: "United States",
  adultContent: false,
  hideWatched: false,
  hideSpoilers: false,
  incognito: false,
  shareGuestHistory: true,
};

export const GUEST_ID_KEY = "divine:guest-id";

export function getGuestId() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{12,64}$/.test(existing)) return existing;
  } catch {}
  return null;
}

export function getOrCreateGuestId() {
  if (typeof window === "undefined") return null;
  const existing = getGuestId();
  if (existing) return existing;
  let next = "";
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      next = `g_${crypto.randomUUID().replace(/-/g, "")}`;
    } else {
      next = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
    }
    window.localStorage.setItem(GUEST_ID_KEY, next);
  } catch {
    return null;
  }
  return next;
}

export function clearAllLocalData() {
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith("viv:") || k === GUEST_ID_KEY)
      .forEach((k) => {
        window.localStorage.removeItem(k);
        cache.delete(k);
      });
    listeners.forEach((l) => l());
  } catch {}
}

export const DEFAULT_CUSTOM_LISTS = [];

export function useHistory() {
  const [history, setHistory] = useProfileStored("viv:history", DEFAULT_HISTORY);

  useEffect(() => {
    if (!Array.isArray(history)) {
      setHistory(DEFAULT_HISTORY);
      return;
    }

    // Old title-card clicks added fabricated 15% progress. Playback records
    // carry a timeLeft value, so keep those and discard the synthetic rows.
    const actualHistory = history.filter(
      (entry) => !(entry?.progress === 0.15 && !entry.timeLeft && !entry.secondsLeft)
    );
    if (actualHistory.length !== history.length) setHistory(actualHistory);
  }, [history, setHistory]);

  return [history, setHistory];
} // [{id, title: {…card}, progress, at, timeLeft}]
export const useList = () => useProfileStored("viv:list", DEFAULT_WATCHLIST); // [id | {id, title: {…card}}]
export const useSearches = () => useProfileStored("viv:searches", EMPTY_LIST); // [string]
export const DEFAULT_WATCH_LOG = [];
export const useWatchLog = () => useProfileStored("viv:watch_log", DEFAULT_WATCH_LOG);
export { recordWatchDelta, migrateHistoryToWatchLog } from "./profileStats.js";
function readSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const key = "viv:settings";
  if (cache.has(key)) return cache.get(key);
  let value = DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Clean up legacy leaked keys or personal identities
      delete parsed.tmdbKey;
      delete parsed.febboxCookie;
      if (parsed.name === "Jayesh") parsed.name = "Guest";
      if (parsed.email === "godlikejayesh@gmail.com") parsed.email = "guest@divine.internal";
      if (parsed.avatar) parsed.avatar = normalizeAvatarUrl(parsed.avatar);
      value = { ...DEFAULT_SETTINGS, ...parsed, _version: SETTINGS_SCHEMA_VERSION };
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }
  } catch {}
  cache.set(key, value);
  return value;
}

export const useSettings = () => {
  const value = useSyncExternalStore(
    subscribe,
    readSettings,
    () => DEFAULT_SETTINGS
  );
  const set = useCallback(
    (next) => write("viv:settings", typeof next === "function" ? next(readSettings()) : { ...DEFAULT_SETTINGS, ...next }),
    []
  );
  return [value, set];
};
export const useCustomLists = () => useProfileStored("viv:custom_lists", DEFAULT_CUSTOM_LISTS); // [{id, name, items: [id]}]
export const useReactions = () => useProfileStored("viv:reactions", DEFAULT_REACTIONS); // {[titleId]: 'dislike' | 'like' | 'love'}
export const useWatchedEpisodes = () => useProfileStored("viv:watched_episodes", EMPTY_OBJ); // {[titleId]: [number]}
export const useUserRatings = () => useProfileStored("viv:user_ratings", EMPTY_OBJ); // {[titleId]: number (1-10)}
export const useSchedule = () => useProfileStored("viv:schedule", EMPTY_LIST); // [id]
export const useReadNotifications = () => useProfileStored("viv:notifications_read", EMPTY_LIST);
export const useDismissedNotifications = () => useProfileStored("viv:notifications_dismissed", EMPTY_LIST);

export function toggleScheduleItem(setSchedule, titleId, titleData = null) {
  setSchedule((prev) => {
    const list = prev || [];
    const id = typeof titleId === "object" ? titleId?.id : titleId;
    const exists = list.some((item) => (typeof item === "object" ? item.id : item) === id);
    if (exists) {
      return list.filter((item) => (typeof item === "object" ? item.id : item) !== id);
    }
    const entry = titleData || (typeof titleId === "object" ? titleId : { id: titleId });
    return [...list, entry];
  });
}

export function setUserRating(setRatings, titleId, score) {
  setRatings((prev) => ({
    ...(prev || {}),
    [titleId]: score,
  }));
}

export function toggleWatchedEpisode(setWatched, titleId, epKey, altKey = null) {
  setWatched((prev) => {
    const list = prev?.[titleId] || [];
    const matches = (item) =>
      String(item) === String(epKey) ||
      (typeof epKey === "number" && Number(item) === epKey) ||
      (altKey && (String(item) === String(altKey) || Number(item) === Number(altKey)));

    const exists = list.some(matches);
    const updated = exists ? list.filter((item) => !matches(item)) : [...list, epKey];
    return {
      ...(prev || {}),
      [titleId]: updated,
    };
  });
}

function buildListItemEntry(idOrCard, cardData = null) {
  const cardObj =
    cardData && typeof cardData === "object"
      ? cardData
      : idOrCard && typeof idOrCard === "object"
      ? idOrCard
      : null;
  const targetId = cardObj?.id ?? entryId(idOrCard);
  if (targetId === null || targetId === undefined || targetId === "") return null;
  const snapshot = cardObj ? toSnapshot(cardObj) : null;
  return snapshot ? { id: targetId, title: snapshot } : targetId;
}

export function toggleCustomListItem(setCustomLists, listId, titleId, cardData = null) {
  const entry = buildListItemEntry(titleId, cardData);
  const targetId = entryId(entry);
  if (targetId === null || targetId === undefined) return;
  setCustomLists((lists) =>
    (lists || []).map((l) => {
      if (l.id !== listId) return l;
      const items = l.items || [];
      const exists = items.some((item) => String(entryId(item)) === String(targetId));
      return {
        ...l,
        updatedAt: Date.now(),
        items: exists
          ? items.filter((item) => String(entryId(item)) !== String(targetId))
          : [...items, entry],
      };
    })
  );
}

export function createCustomList(setCustomLists, name, initialTitleOrCard, options = {}) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const now = Date.now();
  const id = `list_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const initialEntry = initialTitleOrCard
    ? buildListItemEntry(initialTitleOrCard, options.card || null)
    : null;
  const newList = {
    id,
    name: trimmed.slice(0, 48),
    description: typeof options.description === "string" ? options.description.trim().slice(0, 200) : "",
    isPublic: options.isPublic !== false,
    items: initialEntry ? [initialEntry] : [],
    createdAt: now,
    updatedAt: now,
  };
  setCustomLists((lists) => [...(lists || []), newList]);
  return newList;
}

export function updateCustomList(setCustomLists, listId, updates = {}) {
  setCustomLists((lists) =>
    (lists || []).map((l) => {
      if (l.id !== listId) return l;
      return {
        ...l,
        ...(typeof updates.name === "string" && updates.name.trim()
          ? { name: updates.name.trim().slice(0, 48) }
          : {}),
        ...(typeof updates.description === "string"
          ? { description: updates.description.trim().slice(0, 200) }
          : {}),
        ...(typeof updates.isPublic === "boolean" ? { isPublic: updates.isPublic } : {}),
        ...(Array.isArray(updates.items) ? { items: updates.items } : {}),
        updatedAt: Date.now(),
      };
    })
  );
}

export function reorderCustomListItems(setCustomLists, listId, fromIndex, toIndex) {
  setCustomLists((lists) =>
    (lists || []).map((l) => {
      if (l.id !== listId) return l;
      const nextItems = [...(l.items || [])];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= nextItems.length ||
        toIndex >= nextItems.length ||
        fromIndex === toIndex
      ) {
        return l;
      }
      const [moved] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, moved);
      return {
        ...l,
        items: nextItems,
        updatedAt: Date.now(),
      };
    })
  );
}

export function deleteCustomList(setCustomLists, listId) {
  setCustomLists((lists) => (lists || []).filter((l) => l.id !== listId));
}

export const DEFAULT_PROFILES = [
  {
    id: "guest",
    name: "Guest",
    avatar: DEFAULT_AVATAR,
    isKids: false,
  },
];

export { PROFILE_AVATARS };

function normalizeProfileList(list) {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_PROFILES;
  let changed = false;
  const normalized = list.map((p) => {
    if (!p || typeof p !== "object") return p;
    const nextAvatar = normalizeAvatarUrl(p.avatar);
    if (nextAvatar !== p.avatar) changed = true;
    return nextAvatar === p.avatar ? p : { ...p, avatar: nextAvatar };
  });
  return changed ? normalized : list;
}

export function readProfiles() {
  if (typeof window === "undefined") return DEFAULT_PROFILES;
  const key = "viv:profiles";
  if (cache.has(key)) return cache.get(key);
  let value = DEFAULT_PROFILES;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      value = normalizeProfileList(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(value)) {
        try {
          window.localStorage.setItem(key, JSON.stringify(value));
        } catch {}
      }
    }
  } catch {}
  cache.set(key, value);
  return value;
}

export const useProfiles = () => {
  const value = useSyncExternalStore(
    subscribe,
    readProfiles,
    () => DEFAULT_PROFILES
  );
  const set = useCallback(
    (next) => {
      const prev = readProfiles();
      const computed = typeof next === "function" ? next(prev) : next;
      write("viv:profiles", normalizeProfileList(computed));
    },
    []
  );
  return [value, set];
};

export const useActiveProfileId = () => useStored("viv:active_profile_id", "guest");

export function clearProfileLocalData(profileId) {
  if (typeof window === "undefined" || !profileId || profileId === "guest") return;
  try {
    for (const baseKey of PROFILE_SCOPED_BASE_KEYS) {
      const scoped = getProfileStorageKey(baseKey, profileId);
      window.localStorage.removeItem(scoped);
      cache.delete(scoped);
    }
    notifyListeners();
  } catch {}
}

export function readProfileBucket(profileId = "guest") {
  const pid = profileId || "guest";
  return {
    history: read(getProfileStorageKey("viv:history", pid), DEFAULT_HISTORY) || [],
    watchlist: read(getProfileStorageKey("viv:list", pid), DEFAULT_WATCHLIST) || [],
    customLists: read(getProfileStorageKey("viv:custom_lists", pid), DEFAULT_CUSTOM_LISTS) || [],
    reactions: read(getProfileStorageKey("viv:reactions", pid), DEFAULT_REACTIONS) || {},
    watched: read(getProfileStorageKey("viv:watched_episodes", pid), EMPTY_OBJ) || {},
    ratings: read(getProfileStorageKey("viv:user_ratings", pid), EMPTY_OBJ) || {},
    schedule: read(getProfileStorageKey("viv:schedule", pid), EMPTY_LIST) || [],
    searches: read(getProfileStorageKey("viv:searches", pid), EMPTY_LIST) || [],
    watchLog: read(getProfileStorageKey("viv:watch_log", pid), DEFAULT_WATCH_LOG) || [],
  };
}

export function writeProfileBucket(profileId = "guest", bucket = {}, notify = true) {
  const pid = profileId || "guest";
  if (Array.isArray(bucket.history)) write(getProfileStorageKey("viv:history", pid), bucket.history, false);
  if (Array.isArray(bucket.watchlist)) write(getProfileStorageKey("viv:list", pid), bucket.watchlist, false);
  if (Array.isArray(bucket.customLists)) write(getProfileStorageKey("viv:custom_lists", pid), bucket.customLists, false);
  if (bucket.reactions && typeof bucket.reactions === "object") write(getProfileStorageKey("viv:reactions", pid), bucket.reactions, false);
  if (bucket.watched && typeof bucket.watched === "object") write(getProfileStorageKey("viv:watched_episodes", pid), bucket.watched, false);
  if (bucket.ratings && typeof bucket.ratings === "object") write(getProfileStorageKey("viv:user_ratings", pid), bucket.ratings, false);
  if (Array.isArray(bucket.schedule)) write(getProfileStorageKey("viv:schedule", pid), bucket.schedule, false);
  if (Array.isArray(bucket.searches)) write(getProfileStorageKey("viv:searches", pid), bucket.searches, false);
  if (Array.isArray(bucket.watchLog)) write(getProfileStorageKey("viv:watch_log", pid), bucket.watchLog, false);
  if (notify) notifyListeners();
}

export function readAllProfileBuckets(profilesList = null) {
  const list = Array.isArray(profilesList) && profilesList.length ? profilesList : readProfiles();
  const ids = new Set(["guest", ...list.map((p) => p?.id).filter(Boolean)]);
  const buckets = {};
  for (const pid of ids) {
    buckets[pid] = readProfileBucket(pid);
  }
  return buckets;
}

export function switchProfile(setActiveId, setSettings, profile) {
  const cleanAvatar = normalizeAvatarUrl(profile?.avatar);
  setActiveId(profile.id);
  setSettings((s) => ({
    ...s,
    name: profile.name,
    avatar: cleanAvatar,
    activeProfileId: profile.id,
    isKids: Boolean(profile.isKids),
    adultContent: profile.isKids ? false : s.adultContent,
  }));
}

export function addProfile(setProfiles, name, avatar, isKids = false) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const id = `prof_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newProf = {
    id,
    name: trimmed,
    avatar: normalizeAvatarUrl(avatar),
    isKids,
  };
  setProfiles((prev) => [...(prev || DEFAULT_PROFILES), newProf]);
  return newProf;
}

export function updateProfile(setProfiles, profileId, updates) {
  const cleanUpdates =
    updates && Object.prototype.hasOwnProperty.call(updates, "avatar")
      ? { ...updates, avatar: normalizeAvatarUrl(updates.avatar) }
      : updates;
  setProfiles((prev) =>
    (prev || DEFAULT_PROFILES).map((p) => (p.id === profileId ? { ...p, ...cleanUpdates } : p))
  );
}

export function deleteProfile(setProfiles, profileId) {
  setProfiles((prev) => {
    const current = prev || DEFAULT_PROFILES;
    const filtered = current.filter((p) => p.id !== profileId);
    return filtered.length > 0 ? filtered : DEFAULT_PROFILES;
  });
  clearProfileLocalData(profileId);
}

export function removeFromHistory(setHistory, id) {
  setHistory((h) => (h || []).filter((x) => x.id !== id));
}

// ---------- Card snapshot helpers ----------
// Watchlist and history persist a compact card snapshot alongside the id so
// titles discovered live from TMDB keep rendering after the visit that added
// them. Plain-string entries from older versions still resolve via page-level
// cardMap props, so nothing needs migrating.

// Fields that make a card render standalone. Dropped from snapshots before
// saving to keep localStorage small.
const SNAPSHOT_KEEP = [
  "id", "tmdbId", "title", "type", "year", "rating", "runtime", "poster", "backdrop",
  "logo", "genres", "quality", "badge", "cert", "service", "studio", "nextEpisodeToAir",
];

export function toSnapshot(input) {
  if (!input || typeof input !== "object") return null;
  const card = {};
  for (const key of SNAPSHOT_KEEP) {
    if (input[key] !== undefined && input[key] !== null) card[key] = input[key];
  }
  if (!card.id) return null;
  return card;
}

// Resolve a stored entry (plain id, {id, title} or legacy object shapes) back
// to a renderable card, preferring the stored snapshot.
export function entryCard(entry) {
  if (!entry) return null;
  if (typeof entry === "object") {
    if (entry.title && typeof entry.title === "object") return entry.title;
    if (entry.title || entry.poster) return entry; // legacy embedded-object shape
    return null;
  }
  return null; // plain string id: caller falls back to cardMap
}

export function entryId(entry) {
  if (entry === null || entry === undefined) return null;
  return typeof entry === "object" ? entry.id : entry;
}

// Membership test that works for both legacy string entries and {id, title}
// snapshot entries.
export function inList(list, id) {
  if (id === null || id === undefined || id === "") return false;
  return (list || []).some((e) => String(entryId(e)) === String(id));
}

// Toggle a watchlist entry, storing a card snapshot so live-discovered titles
// keep rendering later. Existing legacy entries keep their position.
export function toggleListEntry(setList, id, card) {
  const snapshot = toSnapshot(card) || { id };
  setList((l) => {
    const list = l || [];
    return inList(list, id)
      ? list.filter((e) => entryId(e) !== id)
      : [{ id, title: snapshot }, ...list];
  });
}

export function clearCustomList(setCustomLists, listId) {
  setCustomLists((lists) =>
    (lists || []).map((l) => (l.id === listId ? { ...l, items: [] } : l))
  );
}

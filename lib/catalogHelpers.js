/**
 * Pure catalog helper utilities for Browse pages (/movies, /series, /anime, /discover).
 * Safe for both client components and Node unit tests.
 */

function createRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle returning a new array without mutating input.
 * @template T
 * @param {T[]} items
 * @param {number} seed
 * @returns {T[]}
 */
export function seededShuffle(items, seed = 0) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const copy = [...items];
  const numericSeed = Number(seed);
  if (!Number.isFinite(numericSeed) || numericSeed <= 0 || copy.length <= 1) {
    return copy;
  }

  const rand = createRng(numericSeed * 2654435761);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Deduplicate and append a newly fetched page of media items.
 * Returns { items, addedCount } synchronously so callers never depend on React updater closures.
 */
export function mergeUniqueMediaPage(existingItems = [], incomingItems = []) {
  const prev = Array.isArray(existingItems) ? existingItems : [];
  const next = Array.isArray(incomingItems) ? incomingItems : [];
  if (next.length === 0) {
    return { items: prev, addedCount: 0 };
  }

  const getKey = (item) => {
    if (!item || typeof item !== "object") return "";
    const raw = item.id ?? item.tmdbId ?? item.anilistId;
    return raw != null ? String(raw) : "";
  };

  const seen = new Set();
  for (const item of prev) {
    const key = getKey(item);
    if (key) seen.add(key);
  }

  const distinct = [];
  for (const item of next) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distinct.push(item);
  }

  if (distinct.length === 0) {
    return { items: prev, addedCount: 0 };
  }

  return {
    items: [...prev, ...distinct],
    addedCount: distinct.length,
  };
}

/**
 * Parse Next.js router.query into canonical browse state.
 */
export function parseBrowseQuery(
  query = {},
  {
    defaultCategory = "trending",
    validCategories = null,
    filterKeys = [],
    extraDefaults = {},
    extraAliases = {},
  } = {}
) {
  const rawCat = typeof query.category === "string" ? query.category : defaultCategory;
  const category =
    Array.isArray(validCategories) && validCategories.length > 0
      ? validCategories.includes(rawCat)
        ? rawCat
        : defaultCategory
      : rawCat;

  const filters = {};
  for (const key of filterKeys) {
    filters[key] = typeof query[key] === "string" && query[key].trim() ? query[key] : "all";
  }

  const extra = {};
  for (const [key, defVal] of Object.entries(extraDefaults)) {
    let val = typeof query[key] === "string" && query[key].trim() ? query[key] : null;
    if (!val && Array.isArray(extraAliases[key])) {
      for (const alias of extraAliases[key]) {
        if (typeof query[alias] === "string" && query[alias].trim()) {
          val = query[alias];
          break;
        }
      }
    }
    extra[key] = val || defVal;
  }

  return { category, filters, extra };
}

/**
 * Serialize browse state to clean URL query object (omitting defaults).
 */
export function buildBrowseQuery(
  { category, filters = {}, extra = {} } = {},
  { defaultCategory = "trending", extraDefaults = {} } = {}
) {
  const next = {};
  if (category && category !== defaultCategory) {
    next.category = category;
  }

  for (const [key, val] of Object.entries(extra)) {
    const defVal = extraDefaults[key] ?? "all";
    if (val && val !== defVal) {
      next[key] = val;
    }
  }

  for (const [key, val] of Object.entries(filters)) {
    if (val && val !== "all") {
      next[key] = val;
    }
  }

  return next;
}

/**
 * Count how many non-default filters, sub-filters, and category selections are active.
 */
export function countActiveFilters(
  { category, filters = {}, extra = {} } = {},
  { defaultCategory = "trending", extraDefaults = {} } = {}
) {
  let count = 0;
  if (category && category !== defaultCategory) {
    count += 1;
  }
  for (const val of Object.values(filters)) {
    if (val && val !== "all") {
      count += 1;
    }
  }
  for (const [key, val] of Object.entries(extra)) {
    const defVal = extraDefaults[key] ?? "all";
    if (val && val !== defVal) {
      count += 1;
    }
  }
  return count;
}

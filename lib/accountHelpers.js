// Pure helpers for Account, Profiles, Lists, History, and Content Filtering

export function isKidsRestrictedTitle(item) {
  if (!item || typeof item !== "object") return false;
  if (item.adult === true) return true;
  const cert = String(item.cert || item.certification || "").trim().toUpperCase();
  if (!cert) return false;
  return /^(R|NC-17|NC17|TV-MA|TVMA|18\+?|X|MA15\+|M18|R21)$/.test(cert);
}

export function filterTitlesForProfile(items = [], settings = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!settings?.isKids) return list;
  return list.filter((item) => !isKidsRestrictedTitle(item));
}

export function groupHistoryEntries(entries = [], nowInput = Date.now()) {
  const today = [];
  const yesterday = [];
  const thisWeek = [];
  const earlier = [];

  const now = new Date(nowInput);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfThisWeek = startOfToday - 6 * 86400000;

  (Array.isArray(entries) ? entries : []).forEach((item) => {
    const rawAt = item?.at || (item?.watchedAt ? new Date(item.watchedAt).getTime() : 0);
    const at = Number.isFinite(Number(rawAt)) ? Number(rawAt) : 0;
    if (at >= startOfToday) today.push(item);
    else if (at >= startOfYesterday) yesterday.push(item);
    else if (at >= startOfThisWeek) thisWeek.push(item);
    else earlier.push(item);
  });

  return [
    { title: "Today", items: today },
    { title: "Yesterday", items: yesterday },
    { title: "This week", items: thisWeek },
    { title: "Earlier", items: earlier },
  ].filter((g) => g.items.length > 0);
}

export function filterHistoryEntries(entries = [], activeFilter = "all", searchQuery = "") {
  let list = Array.isArray(entries) ? entries : [];

  if (activeFilter === "movies") {
    list = list.filter((e) => e.title?.type === "movie");
  } else if (activeFilter === "series") {
    list = list.filter((e) => e.title?.type === "series" || e.title?.type === "tv");
  } else if (activeFilter === "anime") {
    list = list.filter((e) => e.title?.type === "anime");
  } else if (activeFilter === "in_progress") {
    list = list.filter((e) => (e.progress || 0) < 0.95);
  } else if (activeFilter === "completed") {
    list = list.filter((e) => (e.progress || 0) >= 0.95);
  }

  const q = String(searchQuery || "").trim().toLowerCase();
  if (q) {
    list = list.filter((e) => {
      const name = String(e.title?.title || "").toLowerCase();
      const genres = Array.isArray(e.title?.genres) ? e.title.genres : [];
      return name.includes(q) || genres.some((g) => String(g).toLowerCase().includes(q));
    });
  }

  return list;
}

export function reorderListItems(items = [], fromIndex, toIndex) {
  const list = Array.isArray(items) ? [...items] : [];
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
}

export function formatRelativeUpdated(timestampOrDate, nowInput = Date.now()) {
  if (!timestampOrDate) return "";
  const ts = typeof timestampOrDate === "number" ? timestampOrDate : new Date(timestampOrDate).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const now = typeof nowInput === "number" ? nowInput : new Date(nowInput).getTime();
  const diffMs = Math.max(0, now - ts);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months} ${months === 1 ? "month" : "months"} ago`;
}

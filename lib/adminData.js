import { resolveEffectiveUserRole } from "./adminAuth.js";

export function clampPageSize(val, fallback = 25) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return Math.min(100, n);
}

export function clampPage(val) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n < 1) return 1;
  return Math.min(10000, n);
}

export function parseAdminListQuery(query = {}) {
  const type = ["all", "guest", "user", "admin"].includes(query.type) ? query.type : "all";
  const method = ["all", "google", "email", "guest"].includes(query.method) ? query.method : "all";
  const status = ["all", "active", "banned"].includes(query.status) ? query.status : "all";
  const dateRange = ["all", "24h", "7d", "30d"].includes(query.dateRange) ? query.dateRange : "all";
  const sort = ["lastActive", "created", "titlesWatched"].includes(query.sort) ? query.sort : "lastActive";
  const order = query.order === "asc" ? "asc" : "desc";
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, 25);
  return { type, method, status, dateRange, sort, order, q, page, pageSize };
}

export function dateCutoffFromRange(dateRange, now = Date.now()) {
  if (dateRange === "24h") return now - 24 * 60 * 60 * 1000;
  if (dateRange === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (dateRange === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export function deriveUserSignInMethod(user) {
  const providers = new Set((user.accounts || []).map((a) => String(a.provider || "").toLowerCase()));
  const hasGoogle = providers.has("google");
  const hasGithub = providers.has("github");
  const hasEmail = Boolean(user.passwordHash);
  if (hasGoogle && hasEmail) return "Google + Email";
  if (hasGoogle) return "Google";
  if (hasGithub) return "GitHub";
  return "Email";
}

export function normalizeUserPerson(u) {
  const effectiveRole = resolveEffectiveUserRole(u);
  const signInMethod = deriveUserSignInMethod(u);
  const latestWatch = u.watchHistory?.[0]?.watchedAt ? new Date(u.watchHistory[0].watchedAt).getTime() : 0;
  const latestGuest = (u.guests || []).reduce((max, g) => {
    const t = g.lastSeenAt ? new Date(g.lastSeenAt).getTime() : 0;
    return Math.max(max, t);
  }, 0);
  const createdMs = u.createdAt ? new Date(u.createdAt).getTime() : Date.now();
  const updatedMs = u.updatedAt ? new Date(u.updatedAt).getTime() : createdMs;
  const lastActiveMs = Math.max(createdMs, updatedMs, latestWatch, latestGuest);
  const country = (u.guests || []).find((g) => g.country)?.country || null;

  return {
    id: u.id,
    entityType: "user",
    personType: effectiveRole === "ADMIN" ? "admin" : "user",
    isAdmin: effectiveRole === "ADMIN",
    displayName: u.name || u.username || (u.email ? u.email.split("@")[0] : "User"),
    username: u.username || null,
    email: u.email || null,
    emailVerified: Boolean(u.emailVerified),
    image: u.image || null,
    signInMethod,
    providers: [...new Set((u.accounts || []).map((a) => a.provider))],
    country,
    createdAt: new Date(createdMs).toISOString(),
    lastActiveAt: new Date(lastActiveMs).toISOString(),
    titlesWatched: u._count?.watchHistory ?? 0,
    watchlistCount: u._count?.watchlist ?? 0,
    customListsCount: u._count?.customLists ?? 0,
    status: u.bannedAt ? "banned" : "active",
    bannedAt: u.bannedAt ? new Date(u.bannedAt).toISOString() : null,
    linkedGuestCount: (u.guests || []).length,
  };
}

export function normalizeGuestPerson(g) {
  const createdMs = g.firstSeenAt ? new Date(g.firstSeenAt).getTime() : g.createdAt ? new Date(g.createdAt).getTime() : Date.now();
  const lastActiveMs = g.lastSeenAt ? new Date(g.lastSeenAt).getTime() : createdMs;
  const shortTag = String(g.id || "").slice(-4).toUpperCase() || "0000";

  return {
    id: g.id,
    entityType: "guest",
    personType: "guest",
    isAdmin: false,
    displayName: `Guest #${shortTag}`,
    username: null,
    email: null,
    emailVerified: false,
    image: null,
    signInMethod: "Guest",
    providers: [],
    country: g.country || null,
    userAgent: g.userAgent || null,
    createdAt: new Date(createdMs).toISOString(),
    lastActiveAt: new Date(lastActiveMs).toISOString(),
    titlesWatched: g._count?.watchHistory ?? 0,
    watchlistCount: 0,
    customListsCount: 0,
    status: "active",
    bannedAt: null,
    linkedGuestCount: 0,
  };
}

export function filterSortPaginatePeople(people, filters, now = Date.now()) {
  const {
    type = "all",
    method = "all",
    status = "all",
    dateRange = "all",
    sort = "lastActive",
    order = "desc",
    q = "",
    page = 1,
    pageSize = 25,
  } = filters || {};

  const cutoff = dateCutoffFromRange(dateRange, now);
  const qLower = q.toLowerCase();

  const filtered = people.filter((p) => {
    if (type !== "all" && p.personType !== type) return false;
    if (status !== "all" && p.status !== status) return false;
    if (method !== "all") {
      const m = p.signInMethod.toLowerCase();
      if (method === "google" && !m.includes("google")) return false;
      if (method === "email" && !m.includes("email")) return false;
      if (method === "guest" && m !== "guest") return false;
    }
    if (cutoff > 0) {
      const activeMs = new Date(p.lastActiveAt).getTime();
      if (activeMs < cutoff) return false;
    }
    if (qLower) {
      const hay = [p.displayName, p.username, p.email, p.id, p.country, p.signInMethod]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  const dir = order === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (sort === "titlesWatched") {
      return (a.titlesWatched - b.titlesWatched) * dir;
    }
    if (sort === "created") {
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }
    return (new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime()) * dir;
  });

  const total = filtered.length;
  const safeSize = clampPageSize(pageSize, 25);
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  const items = filtered.slice(start, start + safeSize);

  return {
    items,
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages,
  };
}

export function summarizePeople(people, now = Date.now()) {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  let signedInUsers = 0;
  let guests = 0;
  let active24h = 0;
  let active7d = 0;
  let newThisWeek = 0;

  for (const p of people) {
    if (p.entityType === "user") signedInUsers += 1;
    else guests += 1;

    const lastMs = new Date(p.lastActiveAt).getTime();
    const createdMs = new Date(p.createdAt).getTime();
    if (lastMs >= dayAgo) active24h += 1;
    if (lastMs >= weekAgo) active7d += 1;
    if (createdMs >= weekAgo) newThisWeek += 1;
  }

  return {
    totalPeople: people.length,
    signedInUsers,
    guests,
    active24h,
    active7d,
    newThisWeek,
  };
}

export function estimateWatchHours(historyEntries = []) {
  let totalMinutes = 0;
  for (const h of historyEntries) {
    const td = h.titleData && typeof h.titleData === "object" ? h.titleData : {};
    const playback = td._playback && typeof td._playback === "object" ? td._playback : {};
    if (Number.isFinite(playback.currentTime) && playback.currentTime > 0) {
      totalMinutes += playback.currentTime / 60;
      continue;
    }
    const rawRuntime = td.runtime;
    let runtimeMins = 0;
    if (typeof rawRuntime === "number" && rawRuntime > 0) {
      runtimeMins = rawRuntime;
    } else if (typeof rawRuntime === "string") {
      const m = rawRuntime.match(/(\d+)/);
      if (m) runtimeMins = parseInt(m[1], 10);
    }
    if (!runtimeMins) {
      runtimeMins = td.type === "movie" ? 105 : 32;
    }
    const progress = Number.isFinite(h.progress) ? Math.min(1, Math.max(0, h.progress)) : 0;
    totalMinutes += runtimeMins * progress;
  }
  return Math.round((totalMinutes / 60) * 10) / 10;
}

export function computeAdminStats(users = [], guests = [], userHistory = [], guestHistory = [], now = Date.now()) {
  const normalizedUsers = users.map(normalizeUserPerson);
  const unclaimedGuests = guests.filter((g) => !g.userId).map(normalizeGuestPerson);
  const allPeople = [...normalizedUsers, ...unclaimedGuests];
  const summary = summarizePeople(allPeople, now);

  // Last 14 days buckets (oldest -> newest)
  const dayKeys = [];
  const dayMap = new Map();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dayKeys.push(key);
    dayMap.set(key, {
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      signups: 0,
      newGuests: 0,
      activeSets: new Set(),
    });
  }

  for (const u of normalizedUsers) {
    const cKey = u.createdAt.slice(0, 10);
    if (dayMap.has(cKey)) dayMap.get(cKey).signups += 1;
    const aKey = u.lastActiveAt.slice(0, 10);
    if (dayMap.has(aKey)) dayMap.get(aKey).activeSets.add(`u:${u.id}`);
  }

  for (const g of guests) {
    const fKey = new Date(g.firstSeenAt || g.createdAt || now).toISOString().slice(0, 10);
    if (dayMap.has(fKey)) dayMap.get(fKey).newGuests += 1;
    const aKey = new Date(g.lastSeenAt || now).toISOString().slice(0, 10);
    if (dayMap.has(aKey)) dayMap.get(aKey).activeSets.add(g.userId ? `u:${g.userId}` : `g:${g.id}`);
  }

  const allHistory = [
    ...userHistory.map((h) => ({ ...h, actorKey: `u:${h.userId}` })),
    ...guestHistory.map((h) => ({ ...h, actorKey: `g:${h.guestId}` })),
  ];

  const top7Map = new Map();
  const top30Map = new Map();
  const cutoff7 = now - 7 * 86400000;
  const cutoff30 = now - 30 * 86400000;

  for (const h of allHistory) {
    const wMs = new Date(h.watchedAt || 0).getTime();
    const key = new Date(wMs).toISOString().slice(0, 10);
    if (dayMap.has(key)) dayMap.get(key).activeSets.add(h.actorKey);

    const td = h.titleData && typeof h.titleData === "object" ? h.titleData : {};
    const titleName = td.title || td.name || h.titleId;
    const baseEntry = {
      titleId: h.titleId,
      title: titleName,
      poster: td.poster || null,
      type: td.type || "movie",
      watches: 0,
      actors: new Set(),
    };

    if (wMs >= cutoff30) {
      const e30 = top30Map.get(h.titleId) || { ...baseEntry, actors: new Set() };
      e30.watches += 1;
      e30.actors.add(h.actorKey);
      top30Map.set(h.titleId, e30);
    }
    if (wMs >= cutoff7) {
      const e7 = top7Map.get(h.titleId) || { ...baseEntry, actors: new Set() };
      e7.watches += 1;
      e7.actors.add(h.actorKey);
      top7Map.set(h.titleId, e7);
    }
  }

  const formatTop = (map) =>
    [...map.values()]
      .sort((a, b) => b.watches - a.watches)
      .slice(0, 10)
      .map((x) => ({
        titleId: x.titleId,
        title: x.title,
        poster: x.poster,
        type: x.type,
        watches: x.watches,
        uniqueViewers: x.actors.size,
      }));

  let newGuests7d = 0;
  let returningGuests7d = 0;
  for (const g of guests) {
    const fMs = new Date(g.firstSeenAt || g.createdAt || 0).getTime();
    const lMs = new Date(g.lastSeenAt || 0).getTime();
    if (lMs >= cutoff7) {
      if (fMs >= cutoff7) newGuests7d += 1;
      else returningGuests7d += 1;
    }
  }

  let googleSignups = 0;
  let emailSignups = 0;
  for (const u of normalizedUsers) {
    if (u.signInMethod.includes("Google")) googleSignups += 1;
    if (u.signInMethod.includes("Email")) emailSignups += 1;
  }

  return {
    summary,
    daily: dayKeys.map((k) => {
      const b = dayMap.get(k);
      return {
        date: b.date,
        label: b.label,
        signups: b.signups,
        newGuests: b.newGuests,
        activePeople: b.activeSets.size,
      };
    }),
    topTitles7d: formatTop(top7Map),
    topTitles30d: formatTop(top30Map),
    guestBreakdown: {
      newGuests7d,
      returningGuests7d,
    },
    methodBreakdown: {
      google: googleSignups,
      email: emailSignups,
      guest: unclaimedGuests.length,
    },
  };
}

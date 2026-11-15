export const SEARCH_GROUP_ORDER = ["movie", "series", "anime", "person"];

export const SEARCH_GROUP_LABELS = {
  movie: "Movies",
  series: "Series",
  anime: "Anime",
  person: "People",
};

export function normalizeSearchItemKind(item) {
  if (!item || typeof item !== "object") return "movie";
  if (item.kind === "person" || item.type === "person" || item.department) return "person";
  if (item.type === "anime" || String(item.id || "").startsWith("anilist-")) return "anime";
  if (item.type === "series" || item.type === "tv" || String(item.id || "").startsWith("tv-")) return "series";
  return "movie";
}

export function buildGroupedSearchSections({
  query = "",
  results = [],
  people = [],
  recents = [],
  trending = [],
  maxPerGroup = 4,
}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    const sections = [];
    const recentRows = (recents || []).slice(0, 5).map((text) => ({
      key: `recent:${text}`,
      kind: "recent",
      text,
    }));
    if (recentRows.length > 0) {
      sections.push({
        id: "recent",
        label: "Recent searches",
        items: recentRows,
      });
    }
    const trendingRows = (trending || []).slice(0, 6).map((t) => ({
      key: `trending:${t.id}`,
      kind: "title",
      t,
    }));
    if (trendingRows.length > 0) {
      sections.push({
        id: "trending",
        label: "Trending now",
        items: trendingRows,
      });
    }
    const flatRows = sections.flatMap((section) => section.items).map((item, idx) => ({
      ...item,
      flatIndex: idx,
    }));
    const indexedSections = [];
    let offset = 0;
    for (const section of sections) {
      const slice = flatRows.slice(offset, offset + section.items.length);
      offset += section.items.length;
      indexedSections.push({ ...section, items: slice });
    }
    return { sections: indexedSections, flatRows };
  }

  const buckets = {
    movie: [],
    series: [],
    anime: [],
    person: [],
  };
  const seen = new Set();

  for (const item of [...(results || []), ...(people || [])]) {
    if (!item || !item.id) continue;
    const kind = normalizeSearchItemKind(item);
    const dedupKey = `${kind}:${item.id}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    if (buckets[kind].length < maxPerGroup) {
      buckets[kind].push({
        key: dedupKey,
        kind: kind === "person" ? "person" : "title",
        t: item,
      });
    }
  }

  const sections = SEARCH_GROUP_ORDER.filter((groupKey) => buckets[groupKey].length > 0).map((groupKey) => ({
    id: groupKey,
    label: SEARCH_GROUP_LABELS[groupKey],
    items: buckets[groupKey],
  }));

  const flatRows = sections.flatMap((section) => section.items).map((item, idx) => ({
    ...item,
    flatIndex: idx,
  }));
  const indexedSections = [];
  let offset = 0;
  for (const section of sections) {
    const slice = flatRows.slice(offset, offset + section.items.length);
    offset += section.items.length;
    indexedSections.push({ ...section, items: slice });
  }
  return { sections: indexedSections, flatRows };
}

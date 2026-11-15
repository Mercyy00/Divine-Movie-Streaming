import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isKidsRestrictedTitle,
  filterTitlesForProfile,
  groupHistoryEntries,
  filterHistoryEntries,
  reorderListItems,
  formatRelativeUpdated,
} from "../lib/accountHelpers.js";
import {
  createCustomList,
  toggleCustomListItem,
  inList,
  entryCard,
  entryId,
} from "../lib/store.js";

test("isKidsRestrictedTitle detects adult and mature certifications cleanly", () => {
  assert.equal(isKidsRestrictedTitle({ adult: true, cert: "PG" }), true);
  assert.equal(isKidsRestrictedTitle({ cert: "R" }), true);
  assert.equal(isKidsRestrictedTitle({ certification: "tv-ma" }), true);
  assert.equal(isKidsRestrictedTitle({ cert: "NC-17" }), true);
  assert.equal(isKidsRestrictedTitle({ cert: "18+" }), true);
  assert.equal(isKidsRestrictedTitle({ cert: "PG-13" }), false);
  assert.equal(isKidsRestrictedTitle({ cert: "TV-PG" }), false);
  assert.equal(isKidsRestrictedTitle({ title: "Paddington" }), false);
});

test("filterTitlesForProfile restricts mature items only when isKids is true", () => {
  const catalog = [
    { id: "a", title: "Spirited Away", cert: "PG" },
    { id: "b", title: "Arcane", cert: "TV-14" },
    { id: "c", title: "Breaking Bad", cert: "TV-MA" },
    { id: "d", title: "Oldboy", adult: true },
  ];

  assert.equal(filterTitlesForProfile(catalog, { isKids: false }).length, 4);
  const kidsCatalog = filterTitlesForProfile(catalog, { isKids: true });
  assert.deepEqual(
    kidsCatalog.map((t) => t.id),
    ["a", "b"]
  );
});

test("groupHistoryEntries buckets entries by Today, Yesterday, This week, Earlier", () => {
  const now = new Date(2026, 4, 15, 14, 0, 0).getTime();
  const startOfToday = new Date(2026, 4, 15, 0, 0, 0).getTime();

  const entries = [
    { id: "1", at: now - 1000 * 60 * 30 },
    { id: "2", at: startOfToday - 1000 * 60 * 60 * 5 },
    { id: "3", watchedAt: new Date(startOfToday - 3 * 86400000).toISOString() },
    { id: "4", at: startOfToday - 15 * 86400000 },
  ];

  const groups = groupHistoryEntries(entries, now);
  assert.deepEqual(
    groups.map((g) => [g.title, g.items.map((i) => i.id)]),
    [
      ["Today", ["1"]],
      ["Yesterday", ["2"]],
      ["This week", ["3"]],
      ["Earlier", ["4"]],
    ]
  );

  // Empty buckets should be omitted
  const onlyToday = groupHistoryEntries([{ id: "1", at: now }], now);
  assert.deepEqual(
    onlyToday.map((g) => g.title),
    ["Today"]
  );
});

test("filterHistoryEntries filters by type, completion status, and search query", () => {
  const entries = [
    { id: "m1", progress: 0.4, title: { title: "Dune: Part Two", type: "movie", genres: ["Sci-Fi"] } },
    { id: "s1", progress: 0.98, title: { title: "Severance", type: "series", genres: ["Thriller"] } },
    { id: "a1", progress: 0.5, title: { title: "Frieren", type: "anime", genres: ["Fantasy"] } },
  ];

  assert.deepEqual(
    filterHistoryEntries(entries, "movies").map((e) => e.id),
    ["m1"]
  );
  assert.deepEqual(
    filterHistoryEntries(entries, "series").map((e) => e.id),
    ["s1"]
  );
  assert.deepEqual(
    filterHistoryEntries(entries, "anime").map((e) => e.id),
    ["a1"]
  );
  assert.deepEqual(
    filterHistoryEntries(entries, "in_progress").map((e) => e.id),
    ["m1", "a1"]
  );
  assert.deepEqual(
    filterHistoryEntries(entries, "completed").map((e) => e.id),
    ["s1"]
  );
  assert.deepEqual(
    filterHistoryEntries(entries, "all", "fantasy").map((e) => e.id),
    ["a1"]
  );
});

test("reorderListItems moves items immutably and handles invalid indices safely", () => {
  const original = ["a", "b", "c", "d"];
  assert.deepEqual(reorderListItems(original, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reorderListItems(original, 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(reorderListItems(original, -1, 2), original);
  assert.deepEqual(reorderListItems(original, 1, 99), original);
  assert.deepEqual(reorderListItems(original, 1, 1), original);
  assert.deepEqual(original, ["a", "b", "c", "d"]);
});

test("formatRelativeUpdated produces readable relative timestamps", () => {
  const now = 1_750_000_000_000;
  assert.equal(formatRelativeUpdated(null, now), "");
  assert.equal(formatRelativeUpdated(now - 20 * 1000, now), "Updated just now");
  assert.equal(formatRelativeUpdated(now - 5 * 60 * 1000, now), "Updated 5 minutes ago");
  assert.equal(formatRelativeUpdated(now - 2 * 3600 * 1000, now), "Updated 2 hours ago");
  assert.equal(formatRelativeUpdated(now - 26 * 3600 * 1000, now), "Updated yesterday");
  assert.equal(formatRelativeUpdated(now - 5 * 86400 * 1000, now), "Updated 5 days ago");
  assert.equal(formatRelativeUpdated(now - 45 * 86400 * 1000, now), "Updated 1 month ago");
});

test("Phase 5 static integrity checks across Account, Lists, History, Settings, Watch, Title, Admin", () => {
  const root = process.cwd();

  const historySrc = fs.readFileSync(path.join(root, "pages", "history.js"), "utf8");
  assert.equal(historySrc.includes("/api/user/history"), false);
  assert.equal(historySrc.includes("groupHistoryEntries"), true);
  assert.equal(historySrc.includes("filterHistoryEntries"), true);

  const listsSrc = fs.readFileSync(path.join(root, "pages", "lists.js"), "utf8");
  assert.equal(listsSrc.includes("entryId(x) !== item.id"), true);
  assert.equal(listsSrc.includes("/api/user/list"), true);
  assert.equal(listsSrc.includes("window.open"), false);

  const settingsSrc = fs.readFileSync(path.join(root, "pages", "settings.js"), "utf8");
  assert.equal(settingsSrc.includes("Connected to Simkl"), false);
  assert.equal(settingsSrc.includes("Connected to AniList"), false);
  assert.equal(settingsSrc.includes("PUT"), true);
  assert.equal(settingsSrc.includes("/api/user/profile"), true);
  assert.equal(settingsSrc.includes("/terms"), true);
  assert.equal(settingsSrc.includes("/privacy"), true);
  assert.equal(settingsSrc.includes("/dmca"), true);

  const watchSrc = fs.readFileSync(path.join(root, "pages", "watch", "[id].js"), "utf8");
  assert.equal(watchSrc.includes("settings.incognito"), true);

  const titleSrc = fs.readFileSync(path.join(root, "pages", "title", "[id].js"), "utf8");
  assert.equal(titleSrc.includes("settings.hideSpoilers"), true);

  const publicProfileSrc = fs.readFileSync(path.join(root, "pages", "u", "[username].js"), "utf8");
  assert.equal(publicProfileSrc.includes("if (remoteUser && !isOwner) return [];"), true);

  const adminUsersSrc = fs.readFileSync(path.join(root, "pages", "admin", "users.js"), "utf8");
  const adminFeaturedSrc = fs.readFileSync(path.join(root, "pages", "admin", "featured.js"), "utf8");
  assert.equal(adminUsersSrc.includes("getServerSideProps"), true);
  assert.equal(adminUsersSrc.includes('role !== "ADMIN"'), true);
  assert.equal(adminFeaturedSrc.includes("getServerSideProps"), true);
  assert.equal(adminFeaturedSrc.includes('role !== "ADMIN"'), true);

  const layoutSrc = fs.readFileSync(path.join(root, "components", "Layout.js"), "utf8");
  assert.equal(layoutSrc.includes("/brands/tmdb.svg"), true);

  const headerSrc = fs.readFileSync(path.join(root, "components", "Header.js"), "utf8");
  assert.equal(headerSrc.includes('<Link href="/lists" role="menuitem"'), true);

  const adminFeaturesSrc = fs.readFileSync(path.join(root, "pages", "admin", "features.js"), "utf8");
  assert.equal(adminFeaturesSrc.includes('destination: "/admin/featured"'), true);

  const authSrc = fs.readFileSync(path.join(root, "lib", "auth.js"), "utf8");
  assert.equal(authSrc.includes("isConfiguredAdminEmail"), true);
});

test("createCustomList and toggleCustomListItem persist card snapshots and match IDs reliably", () => {
  let listsState = [];
  const setCustomLists = (updater) => {
    listsState = typeof updater === "function" ? updater(listsState) : updater;
  };

  const liveMovie = {
    id: "550",
    tmdbId: 550,
    title: "Fight Club",
    type: "movie",
    year: 1999,
    poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    genres: ["Drama"],
  };

  const created = createCustomList(setCustomLists, "Weekend Classics", liveMovie);
  assert.equal(listsState.length, 1);
  assert.equal(created.name, "Weekend Classics");
  assert.equal(listsState[0].items.length, 1);
  assert.equal(entryId(listsState[0].items[0]), "550");
  assert.equal(entryCard(listsState[0].items[0])?.title, "Fight Club");
  assert.equal(inList(listsState[0].items, "550"), true);
  assert.equal(inList(listsState[0].items, 550), true);

  // Toggling off removes by matching ID even across snapshot objects
  toggleCustomListItem(setCustomLists, created.id, "550", liveMovie);
  assert.equal(listsState[0].items.length, 0);
  assert.equal(inList(listsState[0].items, "550"), false);

  // Toggling back on restores full snapshot
  toggleCustomListItem(setCustomLists, created.id, "550", liveMovie);
  assert.equal(listsState[0].items.length, 1);
  assert.equal(entryCard(listsState[0].items[0])?.poster, liveMovie.poster);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  seededShuffle,
  mergeUniqueMediaPage,
  parseBrowseQuery,
  buildBrowseQuery,
  countActiveFilters,
} from "../lib/catalogHelpers.js";

test("seededShuffle preserves all items without mutating source array", () => {
  const source = [
    { id: 1, title: "Alpha" },
    { id: 2, title: "Beta" },
    { id: 3, title: "Gamma" },
    { id: 4, title: "Delta" },
    { id: 5, title: "Epsilon" },
    { id: 6, title: "Zeta" },
  ];
  const snapshot = source.map((x) => x.id);

  assert.deepEqual(seededShuffle([], 3), []);
  assert.deepEqual(seededShuffle([{ id: 1 }], 3), [{ id: 1 }]);
  assert.deepEqual(seededShuffle(source, 0).map((x) => x.id), snapshot);

  const s1a = seededShuffle(source, 1);
  const s1b = seededShuffle(source, 1);
  const s2 = seededShuffle(source, 2);

  assert.deepEqual(source.map((x) => x.id), snapshot);
  assert.deepEqual(s1a.map((x) => x.id), s1b.map((x) => x.id));
  assert.deepEqual(
    [...s1a].map((x) => x.id).sort((a, b) => a - b),
    snapshot
  );
  assert.notDeepEqual(s1a.map((x) => x.id), s2.map((x) => x.id));
});

test("mergeUniqueMediaPage deduplicates across id, tmdbId and anilistId synchronously", () => {
  const page1 = [
    { id: "m-1", tmdbId: 101, title: "One" },
    { id: "m-2", tmdbId: 102, title: "Two" },
  ];
  const page2 = [
    { id: "m-2", tmdbId: 102, title: "Two Duplicate" },
    { id: "m-3", tmdbId: 103, title: "Three" },
    { anilistId: 900, title: "Anime 900" },
    { anilistId: 900, title: "Anime 900 Duplicate" },
  ];

  const merged = mergeUniqueMediaPage(page1, page2);
  assert.equal(merged.addedCount, 2);
  assert.equal(merged.items.length, 4);
  assert.deepEqual(
    merged.items.map((x) => x.title),
    ["One", "Two", "Three", "Anime 900"]
  );

  const emptyIncoming = mergeUniqueMediaPage(merged.items, []);
  assert.equal(emptyIncoming.addedCount, 0);
  assert.equal(emptyIncoming.items.length, 4);

  const allDupes = mergeUniqueMediaPage(merged.items, [
    { id: "m-1", title: "One again" },
    { id: "m-3", title: "Three again" },
  ]);
  assert.equal(allDupes.addedCount, 0);
  assert.equal(allDupes.items.length, 4);
});

test("parseBrowseQuery, buildBrowseQuery and countActiveFilters round-trip cleanly", () => {
  const opts = {
    defaultCategory: "trending",
    validCategories: ["trending", "popular", "top", "simulcasts"],
    filterKeys: ["genre", "year", "rating"],
    extraDefaults: { studio: "all", subgenre: "all" },
    extraAliases: { subgenre: ["keywords"] },
  };

  // Alias support + invalid category fallback + default omissions
  const parsed = parseBrowseQuery(
    { category: "bogus", genre: "Action", keywords: "Isekai", year: "2024" },
    opts
  );
  assert.equal(parsed.category, "trending");
  assert.deepEqual(parsed.filters, { genre: "Action", year: "2024", rating: "all" });
  assert.deepEqual(parsed.extra, { studio: "all", subgenre: "Isekai" });

  assert.equal(countActiveFilters(parsed, opts), 3);

  const serialized = buildBrowseQuery(parsed, opts);
  assert.deepEqual(serialized, {
    subgenre: "Isekai",
    genre: "Action",
    year: "2024",
  });

  // Clearing back to empty query resets all omitted params
  const reset = parseBrowseQuery({}, opts);
  assert.equal(reset.category, "trending");
  assert.deepEqual(reset.filters, { genre: "all", year: "all", rating: "all" });
  assert.deepEqual(reset.extra, { studio: "all", subgenre: "all" });
  assert.equal(countActiveFilters(reset, opts), 0);
  assert.deepEqual(buildBrowseQuery(reset, opts), {});
});

test("Phase 3 static integrity: marvel.svg well-formed & Home has zero dead /browse/* links", () => {
  const root = process.cwd();
  const marvelSvg = fs.readFileSync(path.join(root, "public", "brands", "marvel.svg"), "utf8");
  assert.match(marvelSvg, /<svg[^>]*[^/]>[\s\S]*<\/svg>/);

  const homeSrc = fs.readFileSync(path.join(root, "pages", "index.js"), "utf8");
  assert.equal(/href=["']\/browse\//.test(homeSrc), false);
});

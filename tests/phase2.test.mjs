import test from "node:test";
import assert from "node:assert/strict";
import { hashResetToken } from "../lib/tokenHash.js";
import { buildGroupedSearchSections, normalizeSearchItemKind } from "../lib/searchHelpers.js";

test("hashResetToken produces a deterministic 64-char SHA-256 hex digest", () => {
  const rawToken = "demo-reset-token-12345";
  const digest1 = hashResetToken(rawToken);
  const digest2 = hashResetToken(rawToken);
  const other = hashResetToken("other-token");

  assert.equal(digest1.length, 64);
  assert.match(digest1, /^[a-f0-9]{64}$/);
  assert.equal(digest1, digest2);
  assert.notEqual(digest1, rawToken);
  assert.notEqual(digest1, other);
  assert.equal(hashResetToken(""), "");
  assert.equal(hashResetToken(null), "");
});

test("buildGroupedSearchSections returns recents and trending when query is empty", () => {
  const { sections, flatRows } = buildGroupedSearchSections({
    query: "   ",
    recents: ["Dune", "Attack on Titan"],
    trending: [
      { id: "movie-693134", title: "Dune: Part Two", type: "movie" },
      { id: "tv-1396", title: "Breaking Bad", type: "series" },
    ],
  });

  assert.equal(sections.length, 2);
  assert.equal(sections[0].id, "recent");
  assert.equal(sections[0].label, "Recent searches");
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[1].id, "trending");
  assert.equal(sections[1].label, "Trending now");
  assert.equal(sections[1].items.length, 2);
  assert.equal(flatRows.length, 4);
});

test("buildGroupedSearchSections groups Movies, Series, Anime, and People and deduplicates", () => {
  const { sections, flatRows } = buildGroupedSearchSections({
    query: "dune",
    results: [
      { id: "movie-438631", title: "Dune", type: "movie" },
      { id: "movie-438631", title: "Dune Duplicate", type: "movie" },
      { id: "tv-90228", title: "Dune: Prophecy", type: "series" },
      { id: "anilist-21", title: "One Piece", type: "anime" },
    ],
    people: [{ id: "person-1", name: "Denis Villeneuve", department: "Directing" }],
  });

  assert.deepEqual(
    sections.map((s) => s.label),
    ["Movies", "Series", "Anime", "People"]
  );
  assert.equal(sections[0].items.length, 1);
  assert.equal(sections[3].items[0].kind, "person");
  assert.equal(flatRows.length, 4);
  assert.equal(normalizeSearchItemKind({ id: "tv-1" }), "series");
  assert.equal(normalizeSearchItemKind({ id: "anilist-5" }), "anime");
});

test("MediaCard and Art enforce responsive vertical poster tiles on small screens (<= 768px)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const mediaCardCss = fs.readFileSync(path.resolve("components/MediaCard.module.css"), "utf8");
  const mediaCardJs = fs.readFileSync(path.resolve("components/MediaCard.js"), "utf8");
  const artJs = fs.readFileSync(path.resolve("components/Art.js"), "utf8");
  const skeletonCss = fs.readFileSync(path.resolve("components/Skeleton.module.css"), "utf8");

  // CSS media query contract: switches to 2:3 vertical poster cards on <= 768px
  assert.match(mediaCardCss, /@media\s*\(\s*max-width:\s*768px\s*\)/);
  assert.match(mediaCardCss, /aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(mediaCardCss, /\.tileTitleWrap\s*\{[^}]*display:\s*none\s*!important/);

  // MediaCard renders responsive variant for wide cards
  assert.match(mediaCardJs, /variant=\{wide \? "responsive" : "poster"\}/);

  // Art.js renders <picture> with (max-width: 768px) for poster and (min-width: 769px) for backdrop
  assert.match(artJs, /isResponsive/);
  assert.match(artJs, /media="\(max-width:\s*768px\)"/);
  assert.match(artJs, /media="\(min-width:\s*769px\)"/);

  // Skeleton aligns aspect ratio on small screens to prevent layout shift
  assert.match(skeletonCss, /@media\s*\(\s*max-width:\s*768px\s*\)/);
  assert.match(skeletonCss, /aspect-ratio:\s*2\s*\/\s*3/);
});

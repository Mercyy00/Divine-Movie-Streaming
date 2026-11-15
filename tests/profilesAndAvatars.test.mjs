import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PROFILE_AVATARS,
  DEFAULT_AVATAR,
  LEGACY_AVATAR_MAP,
  normalizeAvatarUrl,
} from "../lib/avatars.js";
import {
  PROFILE_SCOPED_BASE_KEYS,
  getProfileStorageKey,
} from "../lib/store.js";
import { mergeUserData, mergeProfileBucket } from "../lib/syncMerge.js";

test("all PROFILE_AVATARS assets exist on disk in public/avatars", () => {
  const root = process.cwd();
  assert.ok(PROFILE_AVATARS.length >= 13);
  const seenUrls = new Set();
  for (const av of PROFILE_AVATARS) {
    assert.ok(av.url.startsWith("/avatars/"));
    assert.equal(seenUrls.has(av.url), false, `Duplicate avatar url ${av.url}`);
    seenUrls.add(av.url);
    const fullPath = path.join(root, "public", av.url.replace(/^\//, ""));
    assert.equal(fs.existsSync(fullPath), true, `Missing avatar file ${fullPath}`);
  }
});

test("normalizeAvatarUrl migrates legacy paths and keeps external OAuth avatars", () => {
  assert.equal(normalizeAvatarUrl(""), DEFAULT_AVATAR);
  assert.equal(normalizeAvatarUrl(null), DEFAULT_AVATAR);
  assert.equal(normalizeAvatarUrl("/avatars/anime-luffy.png"), "/avatars/anime-pirate.jpg");
  assert.equal(normalizeAvatarUrl("/avatars/movie-batman.jpg"), "/avatars/movie-knight.jpg");
  assert.equal(normalizeAvatarUrl("/avatars/nonexistent-old.png"), DEFAULT_AVATAR);
  assert.equal(normalizeAvatarUrl("/avatars/series-survivor.jpg"), "/avatars/series-survivor.jpg");
  assert.equal(
    normalizeAvatarUrl("https://lh3.googleusercontent.com/a/photo"),
    "https://lh3.googleusercontent.com/a/photo"
  );

  // Every legacy target must resolve to a real current avatar
  for (const target of Object.values(LEGACY_AVATAR_MAP)) {
    assert.ok(PROFILE_AVATARS.some((a) => a.url === target), `Invalid legacy target ${target}`);
  }
});

test("getProfileStorageKey isolates every profile-scoped key cleanly", () => {
  assert.ok(PROFILE_SCOPED_BASE_KEYS.includes("viv:history"));
  assert.ok(PROFILE_SCOPED_BASE_KEYS.includes("viv:list"));
  assert.ok(PROFILE_SCOPED_BASE_KEYS.includes("viv:custom_lists"));

  for (const baseKey of PROFILE_SCOPED_BASE_KEYS) {
    assert.equal(getProfileStorageKey(baseKey, "guest"), baseKey);
    assert.equal(getProfileStorageKey(baseKey, ""), baseKey);
    assert.equal(getProfileStorageKey(baseKey, "prof_abc"), `${baseKey}::prof_abc`);
    assert.notEqual(
      getProfileStorageKey(baseKey, "prof_1"),
      getProfileStorageKey(baseKey, "prof_2")
    );
  }
});

test("mergeUserData keeps secondary profileBuckets completely isolated from guest/primary profile", () => {
  const server = {
    history: [{ id: "m1", progress: 0.5, at: 1000 }],
    watchlist: [{ id: "w1", title: { id: "w1", title: "Dune" } }],
    extras: {
      customLists: [{ id: "list_1", name: "Guest List", items: [{ id: "m1" }] }],
      profiles: [
        { id: "guest", name: "Guest", avatar: DEFAULT_AVATAR },
        { id: "prof_2", name: "Anime Kid", avatar: "/avatars/anime-sorcerer.jpg" },
      ],
      profileBuckets: {
        prof_2: {
          history: [{ id: "al-1", progress: 0.7, at: 2000 }],
          watchlist: [{ id: "al-2" }],
          customLists: [{ id: "list_p2", name: "Anime Only", items: [{ id: "al-1" }] }],
        },
      },
    },
  };

  const local = {
    history: [{ id: "m2", progress: 0.3, at: 1500 }],
    list: [],
    customLists: [],
    profiles: [
      { id: "guest", name: "Guest", avatar: DEFAULT_AVATAR },
      { id: "prof_2", name: "Anime Kid", avatar: "/avatars/anime-sorcerer.jpg" },
      { id: "prof_3", name: "Guest Two", avatar: "/avatars/movie-driver.jpg" },
    ],
    profileBuckets: {
      prof_2: {
        history: [{ id: "al-3", progress: 0.4, at: 2500 }],
        watchlist: [],
        customLists: [],
      },
      prof_3: {
        history: [],
        watchlist: [{ id: "m99" }],
        customLists: [],
      },
    },
  };

  const merged = mergeUserData(server, local);

  // Guest profile has only m1 and m2 — NO al-1 or al-3
  assert.deepEqual(
    merged.history.map((h) => h.id),
    ["m2", "m1"]
  );
  assert.equal(merged.extras.customLists.length, 1);
  assert.equal(merged.extras.customLists[0].id, "list_1");

  // Profile 2 has ONLY al-3 and al-1 — NO m1 or m2 or m99
  const p2 = merged.extras.profileBuckets.prof_2;
  assert.deepEqual(
    p2.history.map((h) => h.id),
    ["al-3", "al-1"]
  );
  assert.deepEqual(
    p2.watchlist.map((w) => w.id),
    ["al-2"]
  );
  assert.deepEqual(
    p2.customLists.map((c) => c.id),
    ["list_p2"]
  );

  // Profile 3 has ONLY m99 — completely clean history & customLists
  const p3 = merged.extras.profileBuckets.prof_3;
  assert.equal(p3.history.length, 0);
  assert.deepEqual(
    p3.watchlist.map((w) => w.id),
    ["m99"]
  );
  assert.equal(p3.customLists.length, 0);
});

test("mergeProfileBucket deduplicates schedule and custom lists cleanly", () => {
  const b = mergeProfileBucket(
    {
      schedule: ["tv1", { id: "tv2" }],
      customLists: [{ id: "l1", name: "Server", items: [] }],
    },
    {
      schedule: ["tv2", "tv3"],
      customLists: [{ id: "l1", name: "Local", items: ["x"] }, { id: "l2", name: "Two", items: [] }],
    }
  );
  assert.deepEqual(b.schedule, ["tv2", "tv3", "tv1"]);
  assert.equal(b.customLists.length, 2);
  assert.equal(b.customLists.find((l) => l.id === "l1")?.name, "Local");
});

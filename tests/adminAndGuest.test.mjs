import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  isConfiguredAdminEmail,
  resolveEffectiveUserRole,
  isSameOriginRequest,
  slugifyUsernameBase,
} from "../lib/adminAuth.js";
import { hashIp, extractCoarseCountry, isValidGuestId } from "../lib/privacy.js";
import { sanitizeCsvCell, buildCsv } from "../lib/csv.js";
import { guestSyncPayloadSchema, mergeGuestIntoUserWatchHistory } from "../lib/guestSync.js";
import {
  parseAdminListQuery,
  filterSortPaginatePeople,
  computeAdminStats,
  normalizeUserPerson,
  normalizeGuestPerson,
} from "../lib/adminData.js";

test("Single admin enforcement requires BOTH verified email AND ADMIN_EMAILS match and revokes immediately", () => {
  const prev = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "Admin.Owner@Example.com, other@test.dev";

  try {
    assert.equal(isConfiguredAdminEmail("admin.owner@example.com"), true);
    assert.equal(isConfiguredAdminEmail("someone@example.com"), false);

    // Verified admin -> ADMIN
    assert.equal(
      resolveEffectiveUserRole({
        email: "admin.owner@example.com",
        emailVerified: new Date(),
        bannedAt: null,
        role: "USER",
      }),
      "ADMIN"
    );

    // Unverified credentials signup with admin email -> USER (prevent takeover)
    assert.equal(
      resolveEffectiveUserRole({
        email: "admin.owner@example.com",
        emailVerified: null,
        bannedAt: null,
        role: "ADMIN",
      }),
      "USER"
    );

    // Banned admin -> USER
    assert.equal(
      resolveEffectiveUserRole({
        email: "admin.owner@example.com",
        emailVerified: new Date(),
        bannedAt: new Date(),
        role: "ADMIN",
      }),
      "USER"
    );

    // Verified non-admin even if DB role column was stale ADMIN -> USER
    assert.equal(
      resolveEffectiveUserRole({
        email: "normal@example.com",
        emailVerified: new Date(),
        bannedAt: null,
        role: "ADMIN",
      }),
      "USER"
    );

    // Removing email from ADMIN_EMAILS immediately revokes ADMIN
    process.env.ADMIN_EMAILS = "";
    assert.equal(
      resolveEffectiveUserRole({
        email: "admin.owner@example.com",
        emailVerified: new Date(),
        bannedAt: null,
        role: "ADMIN",
      }),
      "USER"
    );
  } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = prev;
  }
});

test("isSameOriginRequest blocks cross-site and mismatched origin requests", () => {
  assert.equal(
    isSameOriginRequest({ headers: { host: "divine.su", "sec-fetch-site": "cross-site" } }).ok,
    false
  );
  assert.equal(
    isSameOriginRequest({
      headers: { host: "divine.su", origin: "https://evil.example" },
    }).ok,
    false
  );
  assert.equal(
    isSameOriginRequest({
      headers: { host: "divine.su", origin: "https://divine.su", "sec-fetch-site": "same-origin" },
    }).ok,
    true
  );
});

test("Privacy helpers hash IP with salt and extract valid coarse country codes", () => {
  const h1 = hashIp("203.0.113.42");
  const h2 = hashIp("203.0.113.42");
  assert.ok(h1 && h1 === h2);
  assert.equal(h1.includes("203.0.113.42"), false);

  assert.equal(extractCoarseCountry({ headers: { "cf-ipcountry": "us" } }), "US");
  assert.equal(extractCoarseCountry({ headers: { "cf-ipcountry": "XX" } }), null);
  assert.equal(extractCoarseCountry({ headers: { "x-vercel-ip-country": "JP" } }), "JP");
  assert.equal(isValidGuestId("g_1234567890abcdef"), true);
  assert.equal(isValidGuestId("bad!"), false);
  assert.equal(slugifyUsernameBase("Jane Doe!"), "jane_doe");
});

test("CSV sanitizer neutralizes spreadsheet formula injection", () => {
  assert.equal(sanitizeCsvCell("=CMD('calc')"), `"'=CMD('calc')"`);
  assert.equal(sanitizeCsvCell("+1+2"), `"'+1+2"`);
  assert.equal(sanitizeCsvCell("-2+3"), `"'-2+3"`);
  assert.equal(sanitizeCsvCell("@SUM(A1)"), `"'@SUM(A1)"`);
  assert.equal(sanitizeCsvCell("Alice, Bob"), `"Alice, Bob"`);

  const csv = buildCsv(["Name", "Formula"], [["Safe", "=1+1"]]);
  assert.equal(csv.includes(`"'=1+1"`), true);
});

test("Guest sync Zod schema enforces strict fields and bounds", () => {
  const valid = guestSyncPayloadSchema.safeParse({
    guestId: "g_abcdef1234567890",
    history: [
      {
        id: "550",
        progress: 0.45,
        season: 0,
        episode: 0,
        timeLeft: "42m left",
        at: 1700000000000,
        title: { id: "550", title: "Fight Club", type: "movie" },
      },
    ],
  });
  assert.equal(valid.success, true);

  // Unknown field rejected by .strict()
  const unknownField = guestSyncPayloadSchema.safeParse({
    guestId: "g_abcdef1234567890",
    history: [],
    adminOverride: true,
  });
  assert.equal(unknownField.success, false);

  // Too many items (>200) rejected
  const tooMany = guestSyncPayloadSchema.safeParse({
    guestId: "g_abcdef1234567890",
    history: Array.from({ length: 201 }, (_, i) => ({ id: String(i), progress: 0.1 })),
  });
  assert.equal(tooMany.success, false);
});

test("mergeGuestIntoUserWatchHistory dedupes on (titleId, season, episode) keeping latest watchedAt", () => {
  const tOld = new Date("2026-01-01T10:00:00Z");
  const tNew = new Date("2026-01-05T10:00:00Z");

  const userRows = [
    { titleId: "100", season: 1, episode: 1, progress: 0.8, watchedAt: tNew },
    { titleId: "200", season: 0, episode: 0, progress: 0.2, watchedAt: tOld },
  ];
  const guestRows = [
    { titleId: "100", season: 1, episode: 1, progress: 0.3, watchedAt: tOld, titleData: { title: "Show" } },
    { titleId: "200", season: 0, episode: 0, progress: 0.9, watchedAt: tNew, titleData: { title: "Movie" } },
    { titleId: "300", season: 0, episode: 0, progress: 0.5, watchedAt: tNew, titleData: { title: "Anime" } },
  ];

  const upserts = mergeGuestIntoUserWatchHistory("user_1", guestRows, userRows);
  assert.deepEqual(
    upserts.map((r) => [r.titleId, r.progress]),
    [
      ["200", 0.9],
      ["300", 0.5],
    ]
  );
});

test("Admin pagination bounds, filtering, and real stats computation", () => {
  const parsed = parseAdminListQuery({ page: "-5", pageSize: "999", type: "guest" });
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 100);
  assert.equal(parsed.type, "guest");

  const now = new Date("2026-05-10T12:00:00Z").getTime();
  const users = [
    {
      id: "u1",
      name: "Alice",
      username: "alice",
      email: "alice@example.com",
      emailVerified: new Date(now - 86400000),
      passwordHash: false,
      accounts: [{ provider: "google" }],
      guests: [],
      watchHistory: [{ watchedAt: new Date(now - 3600000) }],
      createdAt: new Date(now - 2 * 86400000),
      updatedAt: new Date(now - 3600000),
      _count: { watchHistory: 3, watchlist: 1, customLists: 0 },
    },
  ];
  const guests = [
    {
      id: "g_abcd12345678",
      firstSeenAt: new Date(now - 10 * 86400000),
      lastSeenAt: new Date(now - 1800000),
      country: "US",
      userId: null,
      _count: { watchHistory: 2 },
    },
  ];

  const people = [normalizeUserPerson(users[0]), normalizeGuestPerson(guests[0])];
  const pagedGuests = filterSortPaginatePeople(people, { type: "guest", page: 1, pageSize: 25 }, now);
  assert.equal(pagedGuests.total, 1);
  assert.equal(pagedGuests.items[0].displayName, "Guest #5678");

  const stats = computeAdminStats(
    users.map((u) => ({ ...u, passwordHash: false })),
    guests,
    [{ userId: "u1", titleId: "550", titleData: { title: "Fight Club", type: "movie" }, watchedAt: new Date(now - 3600000) }],
    [{ guestId: "g_abcd12345678", titleId: "550", titleData: { title: "Fight Club", type: "movie" }, watchedAt: new Date(now - 1800000) }],
    now
  );
  assert.equal(stats.summary.totalPeople, 2);
  assert.equal(stats.summary.guests, 1);
  assert.equal(stats.topTitles7d[0].watches, 2);
  assert.equal(stats.guestBreakdown.returningGuests7d, 1);
});

test("Security & UI static contracts across register, auth pages, and admin routes", () => {
  const root = process.cwd();

  const regSrc = fs.readFileSync(path.join(root, "pages", "api", "auth", "register.js"), "utf8");
  assert.equal(regSrc.includes('role: "USER"'), true);
  assert.equal(regSrc.includes("emailVerified: null"), true);
  assert.equal(regSrc.includes('role: "ADMIN"'), false);

  const signinSrc = fs.readFileSync(path.join(root, "pages", "auth", "signin.js"), "utf8");
  const signupSrc = fs.readFileSync(path.join(root, "pages", "auth", "signup.js"), "utf8");
  assert.equal(signinSrc.includes("GoogleAuthButton"), true);
  assert.equal(signupSrc.includes("GoogleAuthButton"), true);

  const adminApis = [
    "pages/api/admin/people.js",
    "pages/api/admin/people/[id].js",
    "pages/api/admin/people/[id]/history.js",
    "pages/api/admin/stats.js",
    "pages/api/admin/export.js",
    "pages/api/admin/users/[id]/ban.js",
    "pages/api/admin/users.js",
    "pages/api/admin/featured.js",
  ];
  for (const rel of adminApis) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.equal(src.includes("requireAdmin"), true, `${rel} must call requireAdmin`);
    assert.equal(src.includes("applyApiGuard"), true, `${rel} must call applyApiGuard`);
  }

  const adminUsersPageSrc = fs.readFileSync(path.join(root, "pages", "admin", "users.js"), "utf8");
  assert.equal(adminUsersPageSrc.includes("Make Admin"), false);
  assert.equal(adminUsersPageSrc.includes("toggle-role"), false);
});

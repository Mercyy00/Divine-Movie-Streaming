import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatResumeTime,
  extractResumeSeconds,
  computeNextEpisode,
  pickNextAvailableServer,
  getSeasonEpisodeCount,
  buildTitleMetaParts,
  getServerOrigin,
  getAllowedServerOrigins,
  isTrustedIframeMessage,
  getSafeDownloadUrl,
} from "../lib/watchHelpers.js";

test("formatResumeTime formats seconds cleanly into M:SS and H:MM:SS", () => {
  assert.equal(formatResumeTime(0), "0:00");
  assert.equal(formatResumeTime(-15), "0:00");
  assert.equal(formatResumeTime(NaN), "0:00");
  assert.equal(formatResumeTime(65), "1:05");
  assert.equal(formatResumeTime(754), "12:34");
  assert.equal(formatResumeTime(3661), "1:01:01");
});

test("extractResumeSeconds resolves currentTime or progress proportionally and skips completed", () => {
  assert.equal(extractResumeSeconds(null), 0);
  assert.equal(extractResumeSeconds({ progress: 0.98, currentTime: 1800 }), 0);
  assert.equal(extractResumeSeconds({ progress: 0.4, currentTime: 425.8 }), 425);
  assert.equal(extractResumeSeconds({ progress: 0.5, duration: 2000 }), 1000);
  assert.equal(extractResumeSeconds({ progress: 0.25, secondsLeft: 900 }), 300);
  assert.equal(extractResumeSeconds({ progress: 0.5 }, 1800), 900);
});

test("computeNextEpisode increments episode and rolls over across seasons", () => {
  assert.equal(computeNextEpisode({ isSeries: false, currentSeason: 1, currentEpisode: 1, totalSeasons: 1, totalEpisodes: 1 }), null);

  assert.deepEqual(
    computeNextEpisode({ isSeries: true, currentSeason: 1, currentEpisode: 3, totalSeasons: 2, totalEpisodes: 10 }),
    { season: 1, episode: 4 }
  );

  // Last episode of Season 1 rolls over to Season 2 Episode 1
  assert.deepEqual(
    computeNextEpisode({ isSeries: true, currentSeason: 1, currentEpisode: 10, totalSeasons: 2, totalEpisodes: 10 }),
    { season: 2, episode: 1 }
  );

  // Last episode of final season returns null
  assert.equal(
    computeNextEpisode({ isSeries: true, currentSeason: 2, currentEpisode: 8, totalSeasons: 2, totalEpisodes: 8 }),
    null
  );
});

test("pickNextAvailableServer selects next online mirror skipping failed/current ids", () => {
  const servers = [
    { id: "poseidon", status: "online" },
    { id: "zeus", status: "offline" },
    { id: "hera", status: "online" },
    { id: "apollo", status: "online" },
  ];

  assert.equal(pickNextAvailableServer(servers, "poseidon")?.id, "hera");
  assert.equal(pickNextAvailableServer(servers, "poseidon", ["hera"])?.id, "apollo");
  assert.equal(pickNextAvailableServer(servers, "poseidon", ["hera", "apollo"]), null);
  assert.equal(pickNextAvailableServer([], "poseidon"), null);
});

test("getSeasonEpisodeCount returns real counts without fabricating 12", () => {
  const show = {
    episodes: [{ episodeNumber: 1 }, { episodeNumber: 2 }],
    seasonsList: [
      { seasonNumber: 1, episodeCount: 9 },
      { seasonNumber: 2, episodeCount: 7 },
    ],
  };

  assert.equal(getSeasonEpisodeCount(show, 1), 9);
  assert.equal(getSeasonEpisodeCount(show, 2), 7);
  assert.equal(getSeasonEpisodeCount(show, 3), 0);
  assert.equal(getSeasonEpisodeCount({ episodes: [{ episodeNumber: 1 }] }, 1), 1);
  assert.equal(getSeasonEpisodeCount({ episodes: [{ episodeNumber: 1 }] }, 2), 0);
});

test("buildTitleMetaParts omits missing fields and never invents HD quality", () => {
  const minimal = buildTitleMetaParts({ title: "Minimal", year: 2024 }, "");
  assert.deepEqual(
    minimal.map((p) => p.key),
    ["year"]
  );

  const rich = buildTitleMetaParts(
    { rating: 8.4, year: 2023, cert: "TV-MA", quality: "4K", anilistId: 12345 },
    "55 min"
  );
  assert.deepEqual(
    rich.map((p) => p.key),
    ["rating", "year", "runtime", "cert", "quality", "anilist"]
  );
});

test("postMessage origin & source verification helpers enforce exact origin and iframe.contentWindow", () => {
  const servers = [
    { id: "poseidon", url: "https://embed.vidrift.net/embed/tv/94605/1/1" },
    { id: "hera", origin: "https://vidqueen.st", url: "https://vidqueen.st/embed/tv/94605/1/1" },
    { id: "bad", url: "javascript:alert(1)" },
  ];
  assert.equal(getServerOrigin(servers[0]), "https://embed.vidrift.net");
  assert.equal(getServerOrigin(servers[2]), "");

  const allowed = getAllowedServerOrigins(servers);
  assert.equal(allowed.has("https://embed.vidrift.net"), true);
  assert.equal(allowed.has("https://vidqueen.st"), true);
  assert.equal(allowed.size, 2);

  const frameWin = { id: "iframe-win" };
  const otherWin = { id: "other-win" };

  assert.equal(
    isTrustedIframeMessage({ origin: "https://vidqueen.st", source: frameWin }, frameWin, allowed),
    true
  );
  assert.equal(
    isTrustedIframeMessage({ origin: "https://evil.example", source: frameWin }, frameWin, allowed),
    false
  );
  assert.equal(
    isTrustedIframeMessage({ origin: "https://vidqueen.st", source: otherWin }, frameWin, allowed),
    false
  );
  assert.equal(
    isTrustedIframeMessage({ origin: "null", source: frameWin }, frameWin, allowed),
    false
  );
});

test("getSafeDownloadUrl validates real HTTP(S) links and rejects blank/unsafe links", () => {
  assert.equal(getSafeDownloadUrl("https://cdn.example.com/movie.mp4"), "https://cdn.example.com/movie.mp4");
  assert.equal(getSafeDownloadUrl("javascript:alert(1)"), "");
  assert.equal(getSafeDownloadUrl(""), "");
  assert.equal(getSafeDownloadUrl(null), "");
});

test("Phase 4 static integrity: no hardcoded fake HD, fake subtitle list, or wildcard postMessage", () => {
  const root = process.cwd();
  const titleSrc = fs.readFileSync(path.join(root, "pages", "title", "[id].js"), "utf8");
  const playerSrc = fs.readFileSync(path.join(root, "components", "VideoPlayer.js"), "utf8");
  assert.equal(titleSrc.includes('t.quality || "HD"'), false);
  assert.equal(titleSrc.includes("Digital & Theatrical"), false);
  assert.equal(playerSrc.includes('["English", "Spanish", "French", "German", "Hindi"]'), false);
  assert.equal(/postMessage\([\s\S]*?,\s*["']\*["']\s*\)/.test(playerSrc), false);
  assert.equal(playerSrc.includes("isTrustedIframeMessage"), true);
  assert.equal(playerSrc.includes("12000"), true);
});

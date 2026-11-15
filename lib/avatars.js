// High-craft centered character portrait avatars across Anime, Series, and Movies
export const AVATAR_CATEGORIES = ["All", "Anime", "Series", "Movies"];

export const PROFILE_AVATARS = [
  // Anime
  { id: "pirate", name: "Straw Hat", category: "Anime", subtitle: "Grand Line", url: "/avatars/anime-pirate.jpg" },
  { id: "sorcerer", name: "White Sorcerer", category: "Anime", subtitle: "Cursed Arts", url: "/avatars/anime-sorcerer.jpg" },
  { id: "slayer", name: "Ember Swordsman", category: "Anime", subtitle: "Demon Corps", url: "/avatars/anime-slayer.jpg" },
  { id: "bounty", name: "Space Jazz", category: "Anime", subtitle: "Bebop Crew", url: "/avatars/anime-bounty.jpg" },
  { id: "sensei", name: "Silver Sensei", category: "Anime", subtitle: "Hidden Leaf", url: "/avatars/anime-sensei.jpg" },

  // Series
  { id: "rebel", name: "Neon Rebel", category: "Series", subtitle: "Zaun", url: "/avatars/series-rebel.jpg" },
  { id: "chemist", name: "Desert Chemist", category: "Series", subtitle: "Albuquerque", url: "/avatars/series-chemist.jpg" },
  { id: "northern", name: "Northern Wolf", category: "Series", subtitle: "Winterfell", url: "/avatars/series-northern.jpg" },
  { id: "survivor", name: "Forest Survivor", category: "Series", subtitle: "Frontier", url: "/avatars/series-survivor.jpg" },

  // Movies
  { id: "knight", name: "Obsidian Knight", category: "Movies", subtitle: "Gotham", url: "/avatars/movie-knight.jpg" },
  { id: "hacker", name: "Cyber Hacker", category: "Movies", subtitle: "The Matrix", url: "/avatars/movie-hacker.jpg" },
  { id: "driver", name: "Midnight Driver", category: "Movies", subtitle: "Neon Highway", url: "/avatars/movie-driver.jpg" },
  { id: "acrobat", name: "Web Acrobat", category: "Movies", subtitle: "Multiverse", url: "/avatars/movie-acrobat.jpg" },
];

export const DEFAULT_AVATAR = PROFILE_AVATARS[0].url;

const VALID_AVATAR_URLS = new Set(PROFILE_AVATARS.map((a) => a.url));

// Seamless migration from older cropped/movie-still avatar paths
export const LEGACY_AVATAR_MAP = {
  "/avatars/anime-luffy.png": "/avatars/anime-pirate.jpg",
  "/avatars/anime-zoro.png": "/avatars/anime-slayer.jpg",
  "/avatars/anime-gojo.png": "/avatars/anime-sorcerer.jpg",
  "/avatars/anime-levi.png": "/avatars/anime-sensei.jpg",
  "/avatars/anime-eren.jpg": "/avatars/anime-slayer.jpg",
  "/avatars/anime-kakashi.png": "/avatars/anime-sensei.jpg",
  "/avatars/anime-spike.png": "/avatars/anime-bounty.jpg",
  "/avatars/anime-tanjiro.png": "/avatars/anime-slayer.jpg",
  "/avatars/series-walter-white.jpg": "/avatars/series-chemist.jpg",
  "/avatars/series-tommy-shelby.jpg": "/avatars/series-northern.jpg",
  "/avatars/series-homelander.jpg": "/avatars/series-rebel.jpg",
  "/avatars/series-billy-butcher.jpg": "/avatars/series-chemist.jpg",
  "/avatars/series-eleven.jpg": "/avatars/series-rebel.jpg",
  "/avatars/series-jon-snow.jpg": "/avatars/series-northern.jpg",
  "/avatars/series-joel.jpg": "/avatars/series-survivor.jpg",
  "/avatars/series-jinx.jpg": "/avatars/series-rebel.jpg",
  "/avatars/movie-batman.jpg": "/avatars/movie-knight.jpg",
  "/avatars/movie-joker.jpg": "/avatars/movie-knight.jpg",
  "/avatars/movie-tyler-durden.jpg": "/avatars/movie-driver.jpg",
  "/avatars/movie-patrick-bateman.jpg": "/avatars/movie-knight.jpg",
  "/avatars/movie-neo.jpg": "/avatars/movie-hacker.jpg",
  "/avatars/movie-john-wick.jpg": "/avatars/movie-hacker.jpg",
  "/avatars/movie-driver.jpg": "/avatars/movie-driver.jpg",
  "/avatars/movie-spiderman.jpg": "/avatars/movie-acrobat.jpg",
};

export function normalizeAvatarUrl(url) {
  if (!url || typeof url !== "string") return DEFAULT_AVATAR;
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_AVATAR;
  if (Object.prototype.hasOwnProperty.call(LEGACY_AVATAR_MAP, trimmed)) {
    return LEGACY_AVATAR_MAP[trimmed];
  }
  if (trimmed.startsWith("/avatars/")) {
    return VALID_AVATAR_URLS.has(trimmed) ? trimmed : DEFAULT_AVATAR;
  }
  return trimmed;
}

// Fallback generated initials avatar
const PALETTES = [
  ["#6366f1", "#8b5cf6"], ["#0ea5e9", "#22d3ee"], ["#10b981", "#84cc16"], ["#f59e0b", "#ef4444"],
  ["#ec4899", "#f43f5e"], ["#14b8a6", "#3b82f6"], ["#a855f7", "#ec4899"], ["#64748b", "#334155"],
];

export function makeAvatar(name = "Guest", index = 0) {
  const p = PALETTES[Math.abs(index) % PALETTES.length];
  const letter = (String(name).trim()[0] || "G").toUpperCase().replace(/[<>&"']/g, "G");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><text x="60" y="78" font-family="Arial,sans-serif" font-size="56" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Default account avatar: an inline, self-contained user silhouette.
const DEFAULT_USER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#354657"/><stop offset="1" stop-color="#171d28"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#bg)"/><circle cx="60" cy="43" r="21" fill="#dbe3ed"/><path d="M20 108c3-24 18-38 40-38s37 14 40 38" fill="#dbe3ed"/></svg>`;
export const DEFAULT_SILHOUETTE = `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_USER_SVG)}`;

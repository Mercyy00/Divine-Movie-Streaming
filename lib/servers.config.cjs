const DEFAULT_SERVERS = [
  {
    id: "poseidon",
    name: "Poseidon",
    god: "Poseidon",
    title: "Poseidon (VidRift)",
    provider: "VidRift",
    origin: "https://embed.vidrift.net",
    type: "embed",
    enabled: true,
    isDefault: true,
    accentColor: "DC2626",
  },
  {
    id: "zeus",
    name: "Zeus",
    god: "Zeus",
    title: "Zeus (Vidy)",
    provider: "Vidy",
    origin: "https://vidy.st",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "DC2626",
  },
  {
    id: "hera",
    name: "Hera",
    god: "Hera",
    title: "Hera (VidQueen)",
    provider: "VidQueen",
    origin: "https://vidqueen.st",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "dc2626",
  },
  {
    id: "hades",
    name: "Hades",
    god: "Hades",
    title: "Hades (vidstuck)",
    provider: "vidstuck",
    origin: "https://vidstuck.cc",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "DC2626",
  },
  {
    id: "apollo",
    name: "Apollo",
    god: "Apollo",
    title: "Apollo (vidbolt)",
    provider: "vidbolt",
    origin: "https://vidbolt.xyz",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "dc2626",
  },
  {
    id: "hermes",
    name: "Hermes",
    god: "Hermes",
    title: "Hermes (Rivestream)",
    provider: "Rivestream",
    origin: "https://www.rivestream.app",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "dc2626",
  },
  {
    id: "ares",
    name: "Ares",
    god: "Ares",
    title: "Ares (Cinezo)",
    provider: "Cinezo",
    origin: "https://player.cinezo.live",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "dc2626",
  },
  {
    id: "atlas",
    name: "Atlas",
    god: "Atlas",
    title: "Atlas (atlantic)",
    provider: "Atlantic",
    origin: "https://atlantic.st",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "dc2626",
  },
  {
    id: "dionysus",
    name: "Dionysus",
    god: "Dionysus",
    title: "Dionysus (Play4U)",
    provider: "Play4U",
    origin: "https://play4u.org",
    type: "embed",
    enabled: true,
    isDefault: false,
    accentColor: "dc2626",
  },
];

const CUSTOM_SERVERS = [
  {
    id: "playdrive",
    name: "PlayDrive (HD)",
    god: "Helios",
    title: "PlayDrive (HD)",
    provider: "PlayDrive VIP",
    origin: "https://playdrive.vip",
    type: "embed",
    enabled: true,
    isDefault: true,
  },
];

function parseIdList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseBoolFlag(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const val = String(raw).trim().toLowerCase();
  if (["false", "0", "off", "no", "disabled"].includes(val)) return false;
  if (["true", "1", "on", "yes", "enabled"].includes(val)) return true;
  return null;
}

function getBaseServerConfig(serverId) {
  const cleanId = String(serverId || "").toLowerCase().trim();
  return (
    DEFAULT_SERVERS.find((s) => s.id === cleanId) ||
    CUSTOM_SERVERS.find((s) => s.id === cleanId) ||
    null
  );
}

function isServerEnabled(serverId, env = process.env) {
  const cleanId = String(serverId || "").toLowerCase().trim();
  if (!cleanId) return false;

  const base = getBaseServerConfig(cleanId);
  let enabled = base ? base.enabled !== false : true;

  const perServerFlag = parseBoolFlag(env?.[`SERVER_${cleanId.toUpperCase()}_ENABLED`]);
  if (perServerFlag !== null) {
    enabled = perServerFlag;
  }

  const enabledList = parseIdList(env?.ENABLED_SERVERS);
  if (enabledList.length > 0) {
    enabled = enabledList.includes(cleanId);
  }

  const disabledList = parseIdList(env?.DISABLED_SERVERS);
  if (disabledList.includes(cleanId)) {
    enabled = false;
  }

  return enabled;
}

function getPermittedServerOrigins(env = process.env) {
  const origins = new Set();
  for (const srv of [...DEFAULT_SERVERS, ...CUSTOM_SERVERS]) {
    if (isServerEnabled(srv.id, env) && srv.origin) {
      origins.add(srv.origin);
    }
  }
  return Array.from(origins);
}

function getStreamingEnvOrigins(env = process.env) {
  const keys = ["STREAM_BOREAS_ORIGIN", "STREAM_KRATOS_ORIGIN", "STREAM_ZEUS_ORIGIN"];
  const origins = new Set();
  for (const key of keys) {
    const raw = env?.[key]?.trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "https:" || (env?.NODE_ENV !== "production" && parsed.protocol === "http:")) {
        origins.add(parsed.origin);
      }
    } catch {
      // ignore invalid origin strings
    }
  }
  return Array.from(origins);
}

function buildCspDirectives(env = process.env) {
  const frameOrigins = getPermittedServerOrigins(env);
  const streamOrigins = getStreamingEnvOrigins(env);

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://image.tmdb.org",
    "https://img.youtube.com",
    "https://s4.anilist.co",
    "https://*.googleusercontent.com",
    "https://*.githubusercontent.com",
  ].join(" ");

  const frameSrc = [
    "'self'",
    "https://www.youtube-nocookie.com",
    "https://www.youtube.com",
    ...frameOrigins,
  ].join(" ");

  const connectSrc = [
    "'self'",
    "https://image.tmdb.org",
    "https://api.themoviedb.org",
    "https://graphql.anilist.co",
    "https://*.youtube.com",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    ...streamOrigins,
  ].join(" ");

  const mediaSrc = ["'self'", "blob:", ...streamOrigins].join(" ");

  return [
    "default-src 'self'",
    `img-src ${imgSrc}`,
    `frame-src ${frameSrc}`,
    `connect-src ${connectSrc}`,
    `media-src ${mediaSrc}`,
    "worker-src 'self' blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

module.exports = {
  DEFAULT_SERVERS,
  CUSTOM_SERVERS,
  isServerEnabled,
  getPermittedServerOrigins,
  getStreamingEnvOrigins,
  buildCspDirectives,
};

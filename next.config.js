/** @type {import('next').NextConfig} */
const { buildCspDirectives } = require("./lib/servers.config.cjs");

const csp = buildCspDirectives(process.env);

module.exports = {
  distDir: process.env.VIVARIUM_TEST_BUILD === "1" ? ".next-test" : ".next",
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.githubusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/my-list",
        destination: "/watchlist",
        permanent: true,
      },
      {
        source: "/downloads",
        destination: "/settings?tab=downloads",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/browse/movie",
        destination: "/movies",
      },
      {
        source: "/browse/tv",
        destination: "/series",
      },
    ];
  },
};

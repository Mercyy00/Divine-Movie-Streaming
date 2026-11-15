import {
  fetchDiscover,
  fetchTrending,
  fetchPopular,
  fetchTopRated,
  fetchNowPlaying,
  fetchUpcoming,
  fetchAiringToday,
  fetchOnTheAir,
} from "../../../lib/tmdb.js";
import { fetchAniListDiscover } from "../../../lib/anilist.js";
import { applyApiGuard, clampInt, handleApiError } from "../../../lib/api-guard.js";

import { getAllCardTitles } from "../../../lib/data.server.js";

function discoverFromCatalog({ validType, category, genre, service, studio, year, country, language, rating, sort_by, page }) {
  let pool = getAllCardTitles();
  if (validType === "movie") pool = pool.filter((t) => t.type === "movie");
  else if (validType === "tv") pool = pool.filter((t) => t.type === "series" || t.type === "anime");

  if (category === "upcoming") {
    const up = pool.filter((t) => t.status === "upcoming");
    if (up.length) pool = up;
  } else if (category === "airing_today" || category === "on_the_air") {
    const air = pool.filter((t) => t.status === "airing" || t.type === "series");
    if (air.length) pool = air;
  }

  if (genre && genre !== "all") {
    const gLower = String(genre).toLowerCase();
    pool = pool.filter((t) => (t.genres || []).some((g) => g.toLowerCase() === gLower));
  }
  if (service && service !== "all") {
    pool = pool.filter((t) => t.service === service);
  }
  if (studio && studio !== "all") {
    pool = pool.filter((t) => t.studio === studio);
  }
  if (language && language !== "all") {
    const lLower = String(language).toLowerCase();
    pool = pool.filter((t) => (t.language || "").toLowerCase() === lLower);
  }
  if (country && country !== "all") {
    const cUpper = String(country).toUpperCase();
    pool = pool.filter((t) => (t.country || "").toUpperCase() === cUpper);
  }
  if (year && year !== "all") {
    if (/^\d{4}$/.test(year)) pool = pool.filter((t) => String(t.year) === year);
    else if (year === "2020s") pool = pool.filter((t) => Number(t.year) >= 2020);
    else if (year === "2010s") pool = pool.filter((t) => Number(t.year) >= 2010 && Number(t.year) <= 2019);
    else if (year === "Earlier") pool = pool.filter((t) => Number(t.year) < 2010);
  }
  if (rating && rating !== "all") {
    const minR = Number(rating);
    if (!Number.isNaN(minR)) pool = pool.filter((t) => (Number(t.rating) || 0) >= minR);
  }

  if (category === "top" || sort_by === "vote_average.desc") {
    pool = [...pool].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  } else if (sort_by === "primary_release_date.desc") {
    pool = [...pool].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  }

  const perPage = 20;
  const start = (page - 1) * perPage;
  return pool.slice(start, start + perPage);
}

export default async function handler(req, res) {
  const guarded = await applyApiGuard(req, res, { cacheSeconds: 1800 });
  if (!guarded) {
    return;
  }

  const {
    category,
    type = "movie",
    genre,
    service,
    studio,
    network,
    company,
    keywords,
    year,
    country,
    region,
    language,
    rating,
    sort_by,
    page = 1,
  } = req.query;

  // Validate and clamp page to 1..500
  const validPage = clampInt(page, 1, 500, 1);
  const validType =
    type === "all" ? "all" : type === "tv" || type === "series" ? "tv" : type === "anime" ? "anime" : "movie";

  const hasCustomFilters =
    (genre && genre !== "all") ||
    (service && service !== "all") ||
    (studio && studio !== "all") ||
    (network && network !== "all") ||
    (company && company !== "all") ||
    (keywords && keywords !== "all") ||
    (year && year !== "all") ||
    (country && country !== "all") ||
    (language && language !== "all") ||
    (rating && rating !== "all");

  try {
    if (validType === "anime") {
      const anime = await fetchAniListDiscover({
        category,
        genre: typeof genre === "string" ? genre : undefined,
        tag: typeof keywords === "string" ? keywords : undefined,
        studio: typeof studio === "string" ? studio : undefined,
        year: typeof year === "string" ? year : undefined,
        rating: typeof rating === "string" ? rating : undefined,
        page: validPage,
      });
      return res.status(200).json(anime || []);
    }

    if (!process.env.TMDB_API_KEY) {
      const fallback = discoverFromCatalog({
        validType,
        category,
        genre,
        service,
        studio,
        year,
        country,
        language,
        rating,
        sort_by,
        page: validPage,
      });
      return res.status(200).json(fallback);
    }

    let items = [];

    if (!hasCustomFilters) {
      if (category === "trending") {
        const timeWindow = req.query.time_window === "week" ? "week" : "day";
        items = await fetchTrending(validType, timeWindow, validPage);
      } else if (category === "popular") {
        items = await fetchPopular(validType, validPage);
      } else if (category === "top") {
        items = await fetchTopRated(validType, validPage);
      } else if (category === "now_playing") {
        items = await fetchNowPlaying(validPage);
      } else if (category === "upcoming") {
        items = await fetchUpcoming(validType, validPage);
      } else if (category === "airing_today") {
        items = await fetchAiringToday(validPage);
      } else if (category === "on_the_air") {
        items = await fetchOnTheAir(validPage);
      }
    }

    // If items were not populated by direct category endpoint (or custom filters applied)
    if (!items || items.length === 0) {
      let discoverSort = sort_by || "popularity.desc";
      if (category === "top") {
        discoverSort = "vote_average.desc";
      }

      items = await fetchDiscover({
        type: validType,
        genre: typeof genre === "string" ? genre.slice(0, 50) : undefined,
        service: typeof service === "string" ? service.slice(0, 50) : undefined,
        studio: typeof studio === "string" ? studio.slice(0, 50) : undefined,
        network: typeof network === "string" ? network.slice(0, 50) : undefined,
        company: typeof company === "string" ? company.slice(0, 50) : undefined,
        keywords: typeof keywords === "string" ? keywords.slice(0, 50) : undefined,
        year: year ? clampInt(year, 1900, 2100, undefined) : undefined,
        country: typeof country === "string" ? country.slice(0, 10) : undefined,
        language: typeof language === "string" ? language.slice(0, 10) : undefined,
        rating: rating ? clampInt(rating, 0, 10, undefined) : category === "top" ? 7 : undefined,
        sort_by: discoverSort,
        page: validPage,
      });
    }

    return res.status(200).json(items || []);
  } catch (err) {
    return handleApiError(res, err, "Failed to discover titles");
  }
}

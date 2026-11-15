import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Search, Clock, X, User } from "lucide-react";
import Art from "./Art";
import { TYPE_LABEL } from "../lib/constants";
import { useSearches } from "../lib/store";
import { buildGroupedSearchSections } from "../lib/searchHelpers";
import styles from "./SearchPalette.module.css";

export default function SearchPalette({ autoFocus = false, wide = false, onNavigate = null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searches, setSearches] = useSearches();
  const [liveResults, setLiveResults] = useState([]);
  const [peopleResults, setPeopleResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [didYouMean, setDidYouMean] = useState(null);
  const [loading, setLoading] = useState(false);
  const wrap = useRef(null);
  const input = useRef(null);

  // Sync search input with URL query when on /search page
  useEffect(() => {
    if (router.isReady && router.pathname === "/search" && typeof router.query.q === "string") {
      setQ(router.query.q);
    }
  }, [router.isReady, router.pathname, router.query.q]);

  // Fetch top trending titles for default suggestions when input is empty
  useEffect(() => {
    let mounted = true;
    fetch("/api/tmdb/discover?category=trending&type=movie&time_window=week")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (mounted && Array.isArray(data) && data.length > 0) {
          setTrending(data.slice(0, 6));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let activeReq = true;
    const query = q.trim();
    if (!query) {
      setLiveResults([]);
      setPeopleResults([]);
      setDidYouMean(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const tmdbReq = fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&limit=8`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!activeReq || controller.signal.aborted) return { items: [], suggestion: null };
          const suggestion = r.headers.get("X-Did-You-Mean");
          const data = r.ok ? await r.json() : [];
          const items = Array.isArray(data) ? data : data?.results || [];
          return { items, suggestion: suggestion || data?.didYouMean || null };
        })
        .catch(() => ({ items: [], suggestion: null }));

      const animeReq =
        query.length >= 2
          ? fetch(`/api/anilist/search?q=${encodeURIComponent(query)}&limit=4`, {
              signal: controller.signal,
            })
              .then((r) => (r.ok ? r.json() : []))
              .catch(() => [])
          : Promise.resolve([]);

      const peopleReq =
        query.length >= 2
          ? fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=person&limit=4`, {
              signal: controller.signal,
            })
              .then((r) => (r.ok ? r.json() : []))
              .catch(() => [])
          : Promise.resolve([]);

      Promise.all([tmdbReq, animeReq, peopleReq])
        .then(([tmdbRes, animeData, peopleData]) => {
          if (!activeReq || controller.signal.aborted) return;
          const cleanTmdb = Array.isArray(tmdbRes.items)
            ? tmdbRes.items.filter((item) => item.type !== "anime")
            : [];
          const cleanAnime = Array.isArray(animeData) ? animeData : [];
          setLiveResults([...cleanTmdb, ...cleanAnime]);
          setPeopleResults(Array.isArray(peopleData) ? peopleData : []);
          setDidYouMean(tmdbRes.suggestion || null);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError" && activeReq) {
            setLoading(false);
          }
        });
    }, 200);

    return () => {
      activeReq = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const recents = useMemo(() => (searches || []).slice(0, 5), [searches]);

  const { sections, flatRows: rows } = useMemo(
    () =>
      buildGroupedSearchSections({
        query: q,
        results: liveResults,
        people: peopleResults,
        recents,
        trending,
        maxPerGroup: 4,
      }),
    [q, liveResults, peopleResults, recents, trending]
  );

  useEffect(() => {
    setActive(-1);
  }, [q, open]);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => {
        input.current?.focus();
        setOpen(true);
      }, 0);
    }
  }, [autoFocus]);

  useEffect(() => {
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      const typing = /input|textarea/i.test(document.activeElement?.tagName || "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        // Only hijack focus when this search input is visible in the layout
        if (input.current && input.current.offsetParent !== null) {
          e.preventDefault();
          input.current.focus();
          setOpen(true);
        }
      } else if (e.key === "/" && !typing) {
        if (input.current && input.current.offsetParent !== null) {
          e.preventDefault();
          input.current.focus();
          setOpen(true);
        }
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const remember = (text) => {
    const v = String(text || "").trim();
    if (!v) return;
    setSearches((s) => [v, ...(s || []).filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 10));
  };

  const go = (row) => {
    setOpen(false);
    input.current?.blur();
    onNavigate?.();
    if (row.kind === "title") {
      remember(row.t.title);
      setQ("");
      router.push(`/title/${row.t.id}`);
    } else if (row.kind === "person") {
      const personName = row.t.name || row.t.title || "";
      remember(personName);
      setQ(personName);
      router.push(`/search?q=${encodeURIComponent(personName)}&tab=people`);
    } else {
      setQ(row.text);
      router.push(`/search?q=${encodeURIComponent(row.text)}`);
    }
  };

  const submit = () => {
    if (active >= 0 && rows[active]) return go(rows[active]);
    if (!q.trim()) return;
    remember(q);
    setOpen(false);
    input.current?.blur();
    onNavigate?.();
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (rows.length ? (a + 1) % rows.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a <= 0 ? rows.length - 1 : a - 1) : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    }
  };

  return (
    <div className={`${styles.dock} ${wide ? styles.wide : ""}`} ref={wrap}>
      <div className={styles.dockField} onClick={() => input.current?.focus()}>
        <input
          ref={input}
          id={wide ? "spotlight-search" : "site-search"}
          className={styles.input}
          type="search"
          placeholder="Search movies, series, anime, people…"
          value={q}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          role="combobox"
          aria-expanded={open}
          aria-controls={wide ? "spotlight-search-listbox" : "search-listbox"}
          aria-activedescendant={active >= 0 ? `sr-${active}` : undefined}
          aria-label="Search"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {q && (
          <button
            type="button"
            className={styles.wipe}
            onClick={(e) => {
              e.stopPropagation();
              setQ("");
              if (router.pathname === "/search") {
                router.replace({ pathname: "/search" }, undefined, { shallow: true });
              }
              input.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        )}
        <div className={styles.searchDivider} />
        <button
          type="button"
          className={styles.searchSubmitBtn}
          onClick={(e) => {
            e.stopPropagation();
            submit();
          }}
          aria-label="Search"
          title="Search"
        >
          <Search size={17} strokeWidth={2.2} />
        </button>
      </div>

      {open && (
        <div
          className={styles.drop}
          id={wide ? "spotlight-search-listbox" : "search-listbox"}
          role="listbox"
        >
          {didYouMean && (
            <div className={styles.didYouMean}>
              <span>Showing results for</span>
              <button
                type="button"
                className={styles.didYouMeanBtn}
                onClick={() => setQ(didYouMean)}
              >
                {didYouMean}
              </button>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <p className={styles.none}>Searching…</p>
          ) : rows.length === 0 && q.trim() ? (
            <p className={styles.none}>No titles match “{q.trim()}”. Try a genre or a year.</p>
          ) : (
            <div className={styles.sectionsScroll}>
              {sections.map((section) => (
                  <div key={section.id} className={styles.section}>
                    <div className={styles.sectionHeader}>{section.label}</div>
                    <ul className={styles.list}>
                      {section.items.map((row) => {
                        const globalIdx = row.flatIndex;
                        const isSelected = globalIdx === active;
                        return (
                          <li
                            key={row.key}
                            id={`sr-${globalIdx}`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <button
                              type="button"
                              className={`${styles.row} ${isSelected ? styles.rowOn : ""}`}
                              onMouseEnter={() => setActive(globalIdx)}
                              onClick={() => go(row)}
                            >
                              {row.kind === "recent" ? (
                                <>
                                  <span className={styles.lead}>
                                    <Clock size={16} />
                                  </span>
                                  <span className={styles.label}>{row.text}</span>
                                </>
                              ) : row.kind === "person" ? (
                                <div className={styles.resultItem}>
                                  <span className={styles.lead}>
                                    <User size={16} strokeWidth={2} />
                                  </span>
                                  <div className={styles.resultContent}>
                                    <span className={styles.resultTitle}>{row.t.name || row.t.title}</span>
                                    <span className={styles.resultMeta}>
                                      {row.t.department || "Person"}
                                    </span>
                                  </div>
                                  {row.t.profile && (
                                    <div className={styles.resultAvatar}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={row.t.profile} alt="" loading="lazy" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className={styles.resultItem}>
                                  <span className={styles.lead}>
                                    <Search size={16} strokeWidth={2} />
                                  </span>
                                  <div className={styles.resultContent}>
                                    <span className={styles.resultTitle}>{row.t.title}</span>
                                    <span className={styles.resultMeta}>
                                      {row.t.year ? `${row.t.year} · ` : ""}
                                      {TYPE_LABEL[row.t.type] || (row.t.type === "tv" ? "Series" : "Movie")}
                                    </span>
                                  </div>
                                  <div className={styles.resultPoster}>
                                    <Art title={row.t} variant="poster" showTitle={false} />
                                  </div>
                                </div>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
              ))}
            </div>
          )}

          {!q.trim() && recents.length > 0 && (
            <button type="button" className={styles.clear} onClick={() => setSearches([])}>
              Clear search history
            </button>
          )}
        </div>
      )}
    </div>
  );
}

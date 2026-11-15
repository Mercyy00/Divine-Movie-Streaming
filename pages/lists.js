import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Layout from "../components/Layout";
import { Empty } from "../components/Page";
import { getCardMap } from "../lib/data.server";
import { useToast } from "../lib/useToast";
import { DEFAULT_AVATAR } from "../lib/avatars";
import { formatRelativeUpdated } from "../lib/accountHelpers";

export async function getStaticProps() {
  const data = getCardMap();
  return {
    props: {
      ...data,
    },
    revalidate: 1800,
  };
}

import {
  useList,
  useHistory,
  useCustomLists,
  useReactions,
  useProfiles,
  useActiveProfileId,
  createCustomList,
  updateCustomList,
  reorderCustomListItems,
  deleteCustomList,
  clearCustomList,
  toggleCustomListItem,
  entryCard,
  entryId,
  toggleListEntry,
  inList,
} from "../lib/store";
import {
  Plus,
  Compass,
  Menu,
  ChevronLeft,
  XCircle,
  Trash2,
  Folder,
  Play,
  Info,
  Check,
  ThumbsDown,
  ThumbsUp,
  Heart,
  X,
  Share2,
  Pencil,
  ArrowUp,
  ArrowDown,
  Lock,
  Globe,
  GripVertical,
} from "lucide-react";
import styles from "../styles/Lists.module.css";

const DEFAULT_LIKED = [];

export default function Lists({ cardMap = {} }) {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [watchlist, setWatchlist] = useList();
  const [history] = useHistory();
  const [customLists, setCustomLists] = useCustomLists();
  const [reactions, setReactions] = useReactions();
  const [profiles] = useProfiles();
  const [activeProfileId] = useActiveProfileId();
  const [resolvedRemoteCards, setResolvedRemoteCards] = useState({});
  const fetchingIdsRef = useRef(new Set());

  const fallbackCardMap = useMemo(() => {
    const map = { ...resolvedRemoteCards };
    const collect = (entry) => {
      const card = entryCard(entry);
      const id = entryId(entry) || card?.id;
      if (id && card && (card.title || card.poster || card.backdrop)) {
        map[String(id).toLowerCase()] = card;
      }
    };
    (watchlist || []).forEach(collect);
    (history || []).forEach(collect);
    return map;
  }, [watchlist, history, resolvedRemoteCards]);

  const userLikedIds = useMemo(() => {
    const list = Object.entries(reactions || {})
      .filter(([_, r]) => r === "like" || r === "love")
      .map(([id]) => id);
    return list.length > 0 ? list : DEFAULT_LIKED;
  }, [reactions]);

  // Resolve any legacy bare-string IDs in custom lists, watchlist, or liked lists
  useEffect(() => {
    const allEntries = [
      ...(watchlist || []),
      ...userLikedIds,
      ...(customLists || []).flatMap((l) => l.items || []),
    ];

    const missing = [];
    for (const entry of allEntries) {
      const direct = entryCard(entry);
      if (direct && (direct.title || direct.poster || direct.backdrop)) continue;
      const tid = entryId(entry);
      if (tid === null || tid === undefined || tid === "") continue;
      const key = String(tid).toLowerCase();
      if (cardMap[key] || fallbackCardMap[key] || fetchingIdsRef.current.has(key)) continue;
      fetchingIdsRef.current.add(key);
      missing.push({
        id: String(tid),
        key,
        type: typeof entry === "object" ? entry?.type : null,
      });
    }

    if (missing.length === 0) return;

    let cancelled = false;
    missing.slice(0, 12).forEach(async ({ id, key, type }) => {
      try {
        let fetched = null;
        if (id.startsWith("al-")) {
          const alRes = await fetch(`/api/anilist/details?id=${encodeURIComponent(id.slice(3))}`);
          if (alRes.ok) fetched = await alRes.json();
        } else {
          const hint = type === "series" || type === "tv" ? "&type=tv" : type === "movie" ? "&type=movie" : "";
          const tmdbRes = await fetch(`/api/tmdb/details?id=${encodeURIComponent(id)}${hint}`);
          if (tmdbRes.ok) fetched = await tmdbRes.json();
        }
        if (!cancelled && fetched && (fetched.title || fetched.name || fetched.poster)) {
          setResolvedRemoteCards((prev) => ({
            ...prev,
            [key]: { ...fetched, id: fetched.id || id },
          }));
        }
      } catch {}
    });

    return () => {
      cancelled = true;
    };
  }, [customLists, watchlist, userLikedIds, cardMap, fallbackCardMap]);

  const resolveTitle = (id) => {
    if (!id) return null;
    let card = null;
    const tid = entryId(id);
    if (typeof id === "object" && id.id) {
      card = entryCard(id) || cardMap[String(tid).toLowerCase()] || fallbackCardMap[String(tid).toLowerCase()] || null;
    } else {
      const key = String(id).toLowerCase();
      card = cardMap[key] || fallbackCardMap[key] || null;
    }
    if (!card) {
      if (tid === null || tid === undefined || tid === "") return null;
      return {
        id: String(tid),
        title: `Title #${tid}`,
        type: typeof id === "object" && id.type ? id.type : "movie",
        poster: "",
        backdrop: "",
      };
    }
    const titleStr =
      typeof card.title === "string"
        ? card.title
        : typeof card.name === "string"
        ? card.name
        : typeof card.title?.title === "string"
        ? card.title.title
        : String(card.id || tid || "");
    return { ...card, id: card.id || tid, title: titleStr };
  };

  // Active profile info
  const activeProfile = useMemo(() => {
    return (
      (profiles || []).find((p) => p.id === activeProfileId) ||
      profiles?.[0] || {
        name: "Guest",
        avatar: DEFAULT_AVATAR,
      }
    );
  }, [profiles, activeProfileId]);

  const [selectedListId, setSelectedListId] = useState(null);
  const [listModalMode, setListModalMode] = useState(null); // "create" | "edit" | null
  const [listFormName, setListFormName] = useState("");
  const [listFormDesc, setListFormDesc] = useState("");
  const [listFormPublic, setListFormPublic] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all"); // "all" | "movie" | "series" | "anime"
  const [dragIndex, setDragIndex] = useState(null);

  // Sync selectedListId from router query (?id=liked or ?tab=liked or ?list=liked)
  useEffect(() => {
    if (router.isReady) {
      const q = router.query.id || router.query.list || router.query.tab;
      if (q) setSelectedListId(String(q).toLowerCase());
    }
  }, [router.isReady, router.query]);

  // Close modal on Escape
  useEffect(() => {
    if (!listModalMode) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setListModalMode(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listModalMode]);

  const [contextMenu, setContextMenu] = useState(null);
  const [toast, showToast] = useToast(2400);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClose = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", handleClose);
    window.addEventListener("scroll", handleClose, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClose);
      window.removeEventListener("scroll", handleClose);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const syncRemoteList = async (method, payload) => {
    if (authStatus !== "authenticated") return false;
    try {
      const res = await fetch("/api/user/list", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 404 && method === "PUT") {
        const postRes = await fetch("/api/user/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return postRes.ok;
      }
      return res.ok;
    } catch {
      return false;
    }
  };

  const openCreateModal = () => {
    setListFormName("");
    setListFormDesc("");
    setListFormPublic(true);
    setListModalMode("create");
  };

  const openEditModal = (collection) => {
    setListFormName(collection.title || "");
    setListFormDesc(collection.description || "");
    setListFormPublic(collection.isPublic !== false);
    setListModalMode("edit");
  };

  const handleSaveListModal = (e) => {
    e.preventDefault();
    const trimmed = (listFormName || "").trim();
    if (!trimmed) return;

    if (listModalMode === "create") {
      const created = createCustomList(setCustomLists, trimmed, null, {
        description: listFormDesc,
        isPublic: listFormPublic,
      });
      setListModalMode(null);
      if (created?.id) {
        setSelectedListId(created.id);
        syncRemoteList("POST", created);
        showToast(`Created "${created.name}"`);
      }
    } else if (listModalMode === "edit" && selectedListId) {
      updateCustomList(setCustomLists, selectedListId, {
        name: trimmed,
        description: listFormDesc,
        isPublic: listFormPublic,
      });
      syncRemoteList("PUT", {
        id: selectedListId,
        name: trimmed,
        description: listFormDesc,
        isPublic: listFormPublic,
      });
      setListModalMode(null);
      showToast("List updated");
    }
  };

  const activeCollection = useMemo(() => {
    if (!selectedListId) return null;
    if (selectedListId === "watchlist") {
      const items = (watchlist || []).map(resolveTitle).filter(Boolean);
      return {
        id: "watchlist",
        title: "Watchlist",
        description: "Titles saved with the plus button.",
        isPublic: false,
        items,
        isCustom: false,
        onClear: () => setWatchlist([]),
      };
    }
    if (selectedListId === "liked") {
      const items = userLikedIds.map(resolveTitle).filter(Boolean);
      return {
        id: "liked",
        title: "Liked",
        description: "Titles you liked or loved.",
        isPublic: false,
        items,
        isCustom: false,
        onClear: () => {
          setReactions((prev) => {
            const next = { ...(prev || {}) };
            for (const id of userLikedIds) {
              if (next[id] === "like" || next[id] === "love") delete next[id];
            }
            return next;
          });
        },
      };
    }
    const custom = (customLists || []).find((l) => l.id === selectedListId);
    if (custom) {
      const items = (custom.items || []).map(resolveTitle).filter(Boolean);
      return {
        id: custom.id,
        title: custom.name,
        description: custom.description || "",
        isPublic: custom.isPublic !== false,
        updatedAt: custom.updatedAt || custom.createdAt || null,
        rawItems: custom.items || [],
        items,
        isCustom: true,
        onClear: () => {
          clearCustomList(setCustomLists, custom.id);
          syncRemoteList("PUT", { id: custom.id, items: [] });
        },
        onDelete: () => {
          deleteCustomList(setCustomLists, custom.id);
          syncRemoteList("DELETE", { id: custom.id });
          setSelectedListId(null);
          showToast(`Deleted "${custom.name}"`);
        },
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId, watchlist, userLikedIds, customLists, resolvedRemoteCards, setWatchlist, setCustomLists, setReactions]);

  const filteredCollectionItems = useMemo(() => {
    if (!activeCollection?.items) return [];
    if (typeFilter === "all") return activeCollection.items;
    if (typeFilter === "movie") return activeCollection.items.filter((i) => i.type === "movie");
    if (typeFilter === "series") return activeCollection.items.filter((i) => i.type === "series" || i.type === "tv");
    if (typeFilter === "anime") return activeCollection.items.filter((i) => i.type === "anime");
    return activeCollection.items;
  }, [activeCollection?.items, typeFilter]);

  const canReorder = Boolean(activeCollection?.isCustom && typeFilter === "all" && filteredCollectionItems.length > 1);

  const handleReorder = (fromIdx, toIdx) => {
    if (!activeCollection?.isCustom || fromIdx === toIdx) return;
    if (toIdx < 0 || toIdx >= activeCollection.items.length) return;
    reorderCustomListItems(setCustomLists, activeCollection.id, fromIdx, toIdx);
    const reorderedIds = [...(activeCollection.rawItems || [])];
    if (fromIdx < reorderedIds.length && toIdx < reorderedIds.length) {
      const [moved] = reorderedIds.splice(fromIdx, 1);
      reorderedIds.splice(toIdx, 0, moved);
      syncRemoteList("PUT", {
        id: activeCollection.id,
        items: reorderedIds.map((it) => resolveTitle(it) || it),
      });
    }
  };

  const getPreviewImage = (ids) => {
    if (!ids || ids.length === 0) return null;
    for (const id of ids) {
      const t = resolveTitle(id);
      if (t?.backdrop) return t.backdrop;
      if (t?.poster) return t.poster;
    }
    return null;
  };

  const handleItemContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 360;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 16);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 16);
    setContextMenu({ item, x: Math.max(10, x), y: Math.max(10, y) });
  };

  const handleResume = (item) => {
    setContextMenu(null);
    router.push(`/watch/${item.id}`);
  };

  const handleDetails = (item) => {
    setContextMenu(null);
    router.push(`/title/${item.id}`);
  };

  const handleToggleWatchlist = (item) => {
    setContextMenu(null);
    toggleListEntry(setWatchlist, item.id, item);
    showToast(inList(watchlist, item.id) ? "Removed from Watchlist" : "Added to Watchlist");
  };

  const handleToggleCustomList = (item, list) => {
    setContextMenu(null);
    const exists = inList(list.items, item.id);
    toggleCustomListItem(setCustomLists, list.id, item.id, item);
    showToast(exists ? `Removed from "${list.name}"` : `Added to "${list.name}"`);
  };

  const handleReaction = (item, type) => {
    setContextMenu(null);
    setReactions((prev) => {
      const current = prev?.[item.id];
      const next = current === type ? null : type;
      return { ...(prev || {}), [item.id]: next };
    });
    showToast(
      type === "like" ? "Added to Liked" : type === "love" ? "Loved this" : "Disliked"
    );
  };

  const handleRemoveFromList = (item) => {
    setContextMenu(null);
    if (activeCollection?.id === "watchlist") {
      setWatchlist((l) => (l || []).filter((x) => entryId(x) !== item.id && String(entryId(x)) !== String(item.id)));
      showToast("Removed from Watchlist");
    } else if (activeCollection?.isCustom) {
      toggleCustomListItem(setCustomLists, activeCollection.id, item.id, item);
      const remaining = (activeCollection.rawItems || []).filter((it) => String(entryId(it)) !== String(item.id));
      syncRemoteList("PUT", {
        id: activeCollection.id,
        items: remaining.map((it) => resolveTitle(it) || it),
      });
      showToast(`Removed from "${activeCollection.title}"`);
    } else if (activeCollection?.id === "liked") {
      setReactions((r) => ({ ...(r || {}), [item.id]: null }));
      showToast("Removed from Liked");
    }
  };

  const handleShare = (item) => {
    setContextMenu(null);
    const url = `${window.location.origin}/title/${item.id}`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
    }
    showToast("Link copied to clipboard");
  };

  const shareCustomList = async (listId) => {
    const listObj = (customLists || []).find((l) => l.id === listId);
    if (listObj && authStatus === "authenticated") {
      await syncRemoteList("PUT", {
        id: listObj.id,
        name: listObj.name,
        description: listObj.description || "",
        isPublic: listObj.isPublic !== false,
        items: (listObj.items || []).map((it) => resolveTitle(it) || it),
      });
    }
    const url = `${window.location.origin}/lists/${listId}`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
    }
    showToast("List link copied to clipboard");
  };

  return (
    <Layout
      title={activeCollection ? activeCollection.title : "Lists"}
      description="Your personal watchlists and custom collections."
    >
      <div className={`pageInner ${styles.pageWrap}`}>
        {activeCollection ? (
          <div>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => {
                setSelectedListId(null);
                setTypeFilter("all");
              }}
            >
              <ChevronLeft size={16} />
              <span>Lists</span>
            </button>

            <div className={styles.splitWrap}>
              {/* Left Side: Collection Card Banner */}
              <div className={styles.sideCard}>
                <div className={styles.sideImgWrap}>
                  {activeCollection.items.length > 0 && (activeCollection.items[0]?.backdrop || activeCollection.items[0]?.poster) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeCollection.items[0].backdrop || activeCollection.items[0].poster}
                      alt={activeCollection.title}
                      className={styles.sideImg}
                    />
                  ) : (
                    <div className={styles.frontEmpty}>
                      <Folder size={36} opacity={0.3} />
                    </div>
                  )}
                </div>

                <h2 className={styles.sideTitle}>{activeCollection.title}</h2>

                {activeCollection.description && (
                  <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 13.5, margin: "6px 0 12px", lineHeight: 1.45 }}>
                    {activeCollection.description}
                  </p>
                )}

                <div className={styles.profileBadge}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeProfile.avatar || DEFAULT_AVATAR}
                    alt={activeProfile.name || "Guest"}
                    className={styles.profileAvatar}
                  />
                  <span className={styles.profileName}>{activeProfile.name || "Guest"}</span>
                </div>

                <p className={styles.sideSub}>
                  {activeCollection.items.length}{" "}
                  {activeCollection.items.length === 1 ? "title" : "titles"}
                  {activeCollection.updatedAt ? ` · ${formatRelativeUpdated(activeCollection.updatedAt)}` : ""}
                </p>

                {activeCollection.isCustom && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(255,255,255,0.5)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {activeCollection.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                    <span>{activeCollection.isPublic ? "Public link enabled" : "Private list"}</span>
                  </p>
                )}

                {/* List Actions */}
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {activeCollection.isCustom && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => openEditModal(activeCollection)}
                      title="Edit list details"
                    >
                      <Pencil size={13} />
                      <span>Edit</span>
                    </button>
                  )}

                  {activeCollection.onClear && activeCollection.items.length > 0 && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={activeCollection.onClear}
                      title="Clear items from this list"
                    >
                      <XCircle size={13} />
                      <span>Clear</span>
                    </button>
                  )}

                  {activeCollection.isCustom && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => shareCustomList(activeCollection.id)}
                      title="Share this list"
                    >
                      <Share2 size={13} />
                      <span>Share</span>
                    </button>
                  )}

                  {activeCollection.isCustom && (
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={activeCollection.onDelete}
                      title="Delete this list"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Side: Numbered Tracklist of Items */}
              <div className={styles.listTrackList}>
                <div className={styles.watchlistFilters}>
                  {[
                    { value: "all", label: "All" },
                    { value: "movie", label: "Movies" },
                    { value: "series", label: "Series" },
                    { value: "anime", label: "Anime" },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setTypeFilter(tab.value)}
                      className={`${styles.filterPill} ${typeFilter === tab.value ? styles.filterPillActive : ""}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {filteredCollectionItems.length > 0 ? (
                  filteredCollectionItems.map((item, index) => {
                    const typeLabel =
                      item.type === "anime"
                        ? "Anime"
                        : item.type === "series" || item.type === "tv"
                        ? "Series"
                        : "Movie";

                    return (
                      <div
                        key={item.id}
                        className={styles.itemRow}
                        draggable={canReorder}
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => {
                          if (canReorder) e.preventDefault();
                        }}
                        onDrop={() => {
                          if (canReorder && dragIndex !== null) {
                            handleReorder(dragIndex, index);
                          }
                          setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        onContextMenu={(e) => handleItemContextMenu(e, item)}
                      >
                        {canReorder && (
                          <span
                            style={{ color: "rgba(255,255,255,0.32)", cursor: "grab", display: "inline-flex" }}
                            aria-hidden="true"
                          >
                            <GripVertical size={14} />
                          </span>
                        )}

                        <span className={styles.itemRank}>{index + 1}</span>

                        <Link
                          href={`/title/${item.id}`}
                          style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
                        >
                          <div className={styles.itemThumb}>
                            {item.backdrop || item.poster ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.backdrop || item.poster}
                                alt={item.title}
                                className={styles.itemThumbImg}
                              />
                            ) : (
                              <div className={styles.frontEmpty}>
                                <Folder size={18} opacity={0.35} />
                              </div>
                            )}
                          </div>

                          <div className={styles.itemInfo}>
                            <h4 className={styles.itemTitle}>{item.title}</h4>
                            <p className={styles.itemSub}>
                              {item.year ? `${typeLabel} · ${item.year}` : typeLabel}
                            </p>
                          </div>
                        </Link>

                        {canReorder && (
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              style={{ width: 38, padding: 0, justifyContent: "center" }}
                              disabled={index === 0}
                              onClick={() => handleReorder(index, index - 1)}
                              aria-label={`Move ${item.title} up`}
                              title="Move up"
                            >
                              <ArrowUp size={14} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              style={{ width: 38, padding: 0, justifyContent: "center" }}
                              disabled={index === filteredCollectionItems.length - 1}
                              onClick={() => handleReorder(index, index + 1)}
                              aria-label={`Move ${item.title} down`}
                              title="Move down"
                            >
                              <ArrowDown size={14} strokeWidth={1.75} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Empty
                    title={`"${activeCollection.title}" is empty`}
                    text="Tap the + button on any movie or series to save titles to this list."
                    href="/discover"
                    cta="Find something to watch"
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.topRow}>
              <div>
                <h1 className={styles.pageTitle}>My list</h1>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: "6px 0 0" }}>
                  Save anything with the plus button
                </p>
              </div>

              <div className={styles.topActions}>
                <button
                  type="button"
                  className={styles.topBtn}
                  onClick={openCreateModal}
                >
                  <Plus size={16} />
                  <span>New list</span>
                </button>

                <Link href="/discover" className={styles.topBtn}>
                  <Compass size={16} />
                  <span>Discover</span>
                </Link>
              </div>
            </div>

            <div className={styles.folderGrid}>
              {/* 1. Watchlist Folder Card */}
              <button
                type="button"
                className={styles.folderCard}
                onClick={() => setSelectedListId("watchlist")}
              >
                <div className={styles.folderStack}>
                  <div className={styles.stackLayer2} />
                  <div className={styles.stackLayer1} />
                  <div className={styles.frontCard}>
                    {getPreviewImage(watchlist) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPreviewImage(watchlist)}
                        alt="Watchlist preview"
                        className={styles.frontImg}
                      />
                    ) : (
                      <div className={styles.frontEmpty}>
                        <Folder size={32} opacity={0.3} />
                      </div>
                    )}
                    <div className={styles.frontShade} />
                    <div className={styles.countBadge}>
                      <Menu size={12} strokeWidth={1.75} />
                      <span>{(watchlist || []).length}</span>
                    </div>
                  </div>
                </div>
                <div className={styles.folderMeta}>
                  <h3 className={styles.folderTitle}>Watchlist</h3>
                  <p className={styles.folderSub}>
                    {(watchlist || []).length}{" "}
                    {(watchlist || []).length === 1 ? "title" : "titles"}
                  </p>
                </div>
              </button>

              {/* 2. Liked Folder Card */}
              <button
                type="button"
                className={styles.folderCard}
                onClick={() => setSelectedListId("liked")}
              >
                <div className={styles.folderStack}>
                  <div className={styles.stackLayer2} />
                  <div className={styles.stackLayer1} />
                  <div className={styles.frontCard}>
                    {getPreviewImage(userLikedIds) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPreviewImage(userLikedIds)}
                        alt="Liked preview"
                        className={styles.frontImg}
                      />
                    ) : (
                      <div className={styles.frontEmpty}>
                        <Folder size={32} opacity={0.3} />
                      </div>
                    )}
                    <div className={styles.frontShade} />
                    <div className={styles.countBadge}>
                      <Menu size={12} strokeWidth={1.75} />
                      <span>{userLikedIds.length}</span>
                    </div>
                  </div>
                </div>
                <div className={styles.folderMeta}>
                  <h3 className={styles.folderTitle}>Liked</h3>
                  <p className={styles.folderSub}>
                    {userLikedIds.length}{" "}
                    {userLikedIds.length === 1 ? "title" : "titles"}
                  </p>
                </div>
              </button>

              {/* 3. Custom Lists Folders */}
              {(customLists || []).map((list) => {
                const count = (list.items || []).length;
                const preview = getPreviewImage(list.items);
                const updatedLabel = formatRelativeUpdated(list.updatedAt || list.createdAt);
                return (
                  <div key={list.id} className={styles.folderCard} style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedListId(list.id)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        color: "inherit",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      <div className={styles.folderStack}>
                        <div className={styles.stackLayer2} />
                        <div className={styles.stackLayer1} />
                        <div className={styles.frontCard}>
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview}
                              alt={`${list.name} preview`}
                              className={styles.frontImg}
                            />
                          ) : (
                            <div className={styles.frontEmpty}>
                              <Folder size={32} opacity={0.3} />
                            </div>
                          )}
                          <div className={styles.frontShade} />
                          <div className={styles.countBadge}>
                            <Menu size={12} strokeWidth={1.75} />
                            <span>{count}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                    <div className={styles.folderMeta}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedListId(list.id)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            textAlign: "left",
                            color: "inherit",
                            cursor: "pointer",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <h3 className={styles.folderTitle}>{list.name}</h3>
                        </button>
                        <button
                          type="button"
                          onClick={() => shareCustomList(list.id)}
                          title={`Share ${list.name}`}
                          aria-label={`Share ${list.name}`}
                          className={styles.listShareBtn}
                        >
                          <Share2 size={15} strokeWidth={1.75} />
                        </button>
                      </div>
                      <p className={styles.folderSub}>
                        {count} {count === 1 ? "title" : "titles"}
                        {updatedLabel ? ` · ${updatedLabel}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Right-Click Context Menu */}
        {contextMenu && (
          <div
            ref={menuRef}
            className={styles.contextMenu}
            role="menu"
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleResume(contextMenu.item)}
            >
              <Play size={14} fill="none" strokeWidth={1.75} />
              <span>Resume</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleDetails(contextMenu.item)}
            >
              <Info size={14} />
              <span>Details</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleToggleWatchlist(contextMenu.item)}
            >
              {inList(watchlist, contextMenu.item.id) ? (
                <>
                  <Check size={14} />
                  <span>In watchlist</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Add to watchlist</span>
                </>
              )}
            </button>

            {(customLists || []).map((cl) => {
              const inCustom = inList(cl.items, contextMenu.item.id);
              return (
                <button
                  key={cl.id}
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${inCustom ? styles.menuItemActive : ""}`}
                  onClick={() => handleToggleCustomList(contextMenu.item, cl)}
                >
                  <Menu size={14} />
                  <span>{cl.name}</span>
                  {inCustom && <Check size={12} style={{ marginLeft: "auto" }} />}
                </button>
              );
            })}

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleReaction(contextMenu.item, "dislike")}
            >
              <ThumbsDown
                size={14}
                fill={reactions?.[contextMenu.item.id] === "dislike" ? "currentColor" : "none"}
              />
              <span>Dislike</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleReaction(contextMenu.item, "like")}
            >
              <ThumbsUp
                size={14}
                fill={reactions?.[contextMenu.item.id] === "like" ? "currentColor" : "none"}
              />
              <span>I like this</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleReaction(contextMenu.item, "love")}
            >
              <Heart
                size={14}
                fill={reactions?.[contextMenu.item.id] === "love" ? "currentColor" : "none"}
              />
              <span>Love this</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleRemoveFromList(contextMenu.item)}
            >
              <X size={14} />
              <span>
                {activeCollection?.id === "watchlist"
                  ? "Remove from watchlist"
                  : activeCollection?.id === "liked"
                  ? "Remove from liked"
                  : `Remove from ${activeCollection?.title || "list"}`}
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => handleShare(contextMenu.item)}
            >
              <Share2 size={14} />
              <span>Share</span>
            </button>
          </div>
        )}

        {/* Create / Edit List Modal */}
        {listModalMode && (
          <div className={styles.modalBackdrop} onClick={() => setListModalMode(null)}>
            <div
              className={styles.modalBox}
              role="dialog"
              aria-modal="true"
              aria-labelledby="list-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="list-modal-title" className={styles.modalTitle}>
                {listModalMode === "edit" ? "Edit List" : "Create New List"}
              </h2>
              <form onSubmit={handleSaveListModal}>
                <div className={styles.inputGroup}>
                  <label htmlFor="list-name" className={styles.label}>
                    List Name
                  </label>
                  <input
                    id="list-name"
                    type="text"
                    placeholder="e.g. Weekend Watch, Anime Binge"
                    value={listFormName}
                    onChange={(e) => setListFormName(e.target.value)}
                    className={styles.input}
                    autoFocus
                    maxLength={48}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="list-desc" className={styles.label}>
                    Description (optional)
                  </label>
                  <textarea
                    id="list-desc"
                    rows={3}
                    placeholder="What brings these titles together?"
                    value={listFormDesc}
                    onChange={(e) => setListFormDesc(e.target.value.slice(0, 200))}
                    className={styles.input}
                    style={{ height: "auto", padding: "10px 12px", resize: "none", fontFamily: "inherit" }}
                    maxLength={200}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, fontSize: 13.5, color: "rgba(255,255,255,0.8)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={listFormPublic}
                    onChange={(e) => setListFormPublic(e.target.checked)}
                    style={{ accentColor: "#ffffff" }}
                  />
                  <span>Allow sharing via public link</span>
                </label>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setListModalMode(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveBtn}
                    disabled={!listFormName.trim()}
                  >
                    {listModalMode === "edit" ? "Save" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </Layout>
  );
}

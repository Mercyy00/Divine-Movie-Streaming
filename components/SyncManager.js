import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  useHistory,
  useList,
  useSettings,
  useReactions,
  useCustomLists,
  useUserRatings,
  useWatchedEpisodes,
  useWatchLog,
} from "../lib/store";
import { mergeUserData, cleanSettingsForSync } from "../lib/syncMerge";

// Keeps localStorage and the database in step for signed-in users.
// Signed-out users are untouched (localStorage only).
export default function SyncManager() {
  const { status } = useSession();
  const [history, setHistory] = useHistory();
  const [list, setList] = useList();
  const [settings, setSettings] = useSettings();
  const [reactions, setReactions] = useReactions();
  const [customLists, setCustomLists] = useCustomLists();
  const [ratings, setRatings] = useUserRatings();
  const [watched, setWatched] = useWatchedEpisodes();
  const [watchLog, setWatchLog] = useWatchLog();

  const ready = useRef(false);
  const dirty = useRef(false);
  const timer = useRef(null);
  const latest = useRef({ history, list, settings, reactions, customLists, ratings, watched, watchLog });

  // Update ref in effect, avoiding render-time assignment
  useEffect(() => {
    latest.current = { history, list, settings, reactions, customLists, ratings, watched, watchLog };
  }, [history, list, settings, reactions, customLists, ratings, watched, watchLog]);

  const buildSyncPayload = (snapshot) => ({
    schemaVersion: 1,
    history: snapshot.history,
    watchlist: snapshot.list,
    extras: {
      settings: cleanSettingsForSync(snapshot.settings || {}),
      reactions: snapshot.reactions,
      ratings: snapshot.ratings,
      watched: snapshot.watched,
      customLists: snapshot.customLists,
      watchLog: snapshot.watchLog,
    },
  });

  // 1. On login: pull server data, merge with localStorage, and persist merged guest progress back to DB.
  useEffect(() => {
    if (status !== "authenticated") {
      ready.current = false;
      dirty.current = false;
      return;
    }
    let cancelled = false;

    fetch("/api/user/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((srv) => {
        if (cancelled || !srv) return;
        const local = latest.current;
        const hadLocalData =
          (local.history?.length || 0) > 0 ||
          (local.list?.length || 0) > 0 ||
          Object.keys(local.reactions || {}).length > 0 ||
          Object.keys(local.ratings || {}).length > 0 ||
          Object.keys(local.watched || {}).length > 0 ||
          (local.customLists?.length || 0) > 0;
        const merged = mergeUserData(srv, local);

        setHistory(merged.history);
        setList(merged.watchlist);
        setReactions(merged.extras.reactions);
        setRatings(merged.extras.ratings);
        setWatched(merged.extras.watched);
        setCustomLists(merged.extras.customLists);
        setWatchLog(merged.extras.watchLog || []);
        setSettings((s) => ({ ...s, ...merged.extras.settings }));

        ready.current = true;
        if (hadLocalData) {
          fetch("/api/user/sync", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              schemaVersion: 1,
              history: merged.history,
              watchlist: merged.watchlist,
              extras: merged.extras,
            }),
          }).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 2. Debounced push on any change (including watch progress updates).
  useEffect(() => {
    if (status !== "authenticated" || !ready.current) return;
    dirty.current = true;
    clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      dirty.current = false;
      fetch("/api/user/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSyncPayload(latest.current)),
      }).catch(() => {});
    }, 1500);

    return () => clearTimeout(timer.current);
  }, [status, history, list, settings, reactions, customLists, ratings, watched, watchLog]);

  // 3. Flush unsaved progress when navigating away or closing tab while signed in.
  useEffect(() => {
    if (status !== "authenticated") return;
    const flush = () => {
      if (!ready.current || !dirty.current) return;
      dirty.current = false;
      clearTimeout(timer.current);
      fetch("/api/user/sync", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSyncPayload(latest.current)),
      }).catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status]);

  return null;
}

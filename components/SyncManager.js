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
  useProfiles,
  useActiveProfileId,
  readProfileBucket,
  readAllProfileBuckets,
  writeProfileBucket,
  getGuestId,
  getOrCreateGuestId,
} from "../lib/store";
import { mergeUserData, cleanSettingsForSync } from "../lib/syncMerge";

// Keeps localStorage and the database in step for both signed-in users and guests,
// preserving full isolation across profiles.
export default function SyncManager() {
  const { status } = useSession();
  const [history] = useHistory();
  const [list] = useList();
  const [settings, setSettings] = useSettings();
  const [reactions] = useReactions();
  const [customLists] = useCustomLists();
  const [ratings] = useUserRatings();
  const [watched] = useWatchedEpisodes();
  const [watchLog] = useWatchLog();
  const [profiles, setProfiles] = useProfiles();
  const [activeProfileId] = useActiveProfileId();

  const ready = useRef(false);
  const dirty = useRef(false);
  const timer = useRef(null);
  const guestDirty = useRef(false);
  const guestTimer = useRef(null);
  const lastGuestSyncAt = useRef(0);
  const latest = useRef({
    history,
    list,
    settings,
    reactions,
    customLists,
    ratings,
    watched,
    watchLog,
    profiles,
    activeProfileId,
  });

  useEffect(() => {
    latest.current = {
      history,
      list,
      settings,
      reactions,
      customLists,
      ratings,
      watched,
      watchLog,
      profiles,
      activeProfileId,
    };
  }, [history, list, settings, reactions, customLists, ratings, watched, watchLog, profiles, activeProfileId]);

  const buildSyncPayload = (snapshot) => {
    const allBuckets = readAllProfileBuckets(snapshot.profiles);
    const guestBucket = allBuckets.guest || readProfileBucket("guest");
    const secondaryBuckets = {};
    for (const [pid, bucket] of Object.entries(allBuckets)) {
      if (pid && pid !== "guest") {
        secondaryBuckets[pid] = bucket;
      }
    }

    return {
      schemaVersion: 1,
      history: guestBucket.history,
      watchlist: guestBucket.watchlist,
      extras: {
        settings: cleanSettingsForSync(snapshot.settings || {}),
        reactions: guestBucket.reactions,
        ratings: guestBucket.ratings,
        watched: guestBucket.watched,
        customLists: guestBucket.customLists,
        watchLog: guestBucket.watchLog,
        profiles: snapshot.profiles || [],
        profileBuckets: secondaryBuckets,
      },
    };
  };

  // 1. Authenticated login: claim guest record, pull server data, merge isolated per-profile buckets, push merged state.
  useEffect(() => {
    if (status !== "authenticated") {
      ready.current = false;
      dirty.current = false;
      return;
    }
    let cancelled = false;

    const runInitialAuthSync = async () => {
      try {
        const guestId = getGuestId();
        if (guestId) {
          await fetch("/api/user/claim-guest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestId }),
          }).catch(() => {});
        }

        const r = await fetch("/api/user/sync");
        const srv = r.ok ? await r.json() : null;
        if (cancelled || !srv) return;

        const allLocalBuckets = readAllProfileBuckets(latest.current.profiles);
        const guestLocal = allLocalBuckets.guest || readProfileBucket("guest");
        const secondaryLocalBuckets = {};
        for (const [pid, bucket] of Object.entries(allLocalBuckets)) {
          if (pid && pid !== "guest") secondaryLocalBuckets[pid] = bucket;
        }

        const localForMerge = {
          history: guestLocal.history,
          list: guestLocal.watchlist,
          settings: latest.current.settings,
          reactions: guestLocal.reactions,
          customLists: guestLocal.customLists,
          ratings: guestLocal.ratings,
          watched: guestLocal.watched,
          watchLog: guestLocal.watchLog,
          profiles: latest.current.profiles,
          profileBuckets: secondaryLocalBuckets,
        };

        const hadLocalData = Object.values(allLocalBuckets).some(
          (b) =>
            (b.history?.length || 0) > 0 ||
            (b.watchlist?.length || 0) > 0 ||
            Object.keys(b.reactions || {}).length > 0 ||
            Object.keys(b.ratings || {}).length > 0 ||
            Object.keys(b.watched || {}).length > 0 ||
            (b.customLists?.length || 0) > 0
        );

        const merged = mergeUserData(srv, localForMerge);

        // Write secondary profile buckets first quietly
        const mergedSecondary = merged.extras.profileBuckets || {};
        for (const [pid, bucket] of Object.entries(mergedSecondary)) {
          writeProfileBucket(pid, bucket, false);
        }

        // Write primary "guest" bucket and notify listeners
        writeProfileBucket(
          "guest",
          {
            history: merged.history,
            watchlist: merged.watchlist,
            customLists: merged.extras.customLists,
            reactions: merged.extras.reactions,
            ratings: merged.extras.ratings,
            watched: merged.extras.watched,
            watchLog: merged.extras.watchLog || [],
          },
          true
        );

        if (Array.isArray(merged.extras.profiles) && merged.extras.profiles.length > 0) {
          setProfiles(merged.extras.profiles);
        }
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
      } catch {}
    };

    runInitialAuthSync();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 2. Authenticated debounced push on any change across active profile or profile list.
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
  }, [status, history, list, settings, reactions, customLists, ratings, watched, watchLog, profiles, activeProfileId]);

  // 3. Guest debounced / throttled (~30s progress) watch-history sync when signed out.
  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (settings?.shareGuestHistory === false || settings?.incognito) return;
    if (!Array.isArray(history) || history.length === 0) return;

    const guestId = getOrCreateGuestId();
    if (!guestId) return;

    guestDirty.current = true;
    clearTimeout(guestTimer.current);

    const elapsed = Date.now() - lastGuestSyncAt.current;
    const delay = elapsed > 30000 ? 1500 : Math.max(1500, 30000 - elapsed);

    guestTimer.current = setTimeout(() => {
      guestDirty.current = false;
      lastGuestSyncAt.current = Date.now();
      fetch("/api/guest/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId,
          history: (latest.current.history || []).slice(0, 200),
        }),
      }).catch(() => {});
    }, delay);

    return () => clearTimeout(guestTimer.current);
  }, [status, history, settings?.shareGuestHistory, settings?.incognito]);

  // 4. Flush unsaved progress when navigating away or closing tab (signed-in or guest).
  useEffect(() => {
    if (status === "loading") return;

    const flush = () => {
      if (status === "authenticated") {
        if (!ready.current || !dirty.current) return;
        dirty.current = false;
        clearTimeout(timer.current);
        fetch("/api/user/sync", {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSyncPayload(latest.current)),
        }).catch(() => {});
        return;
      }

      if (status === "unauthenticated") {
        const currentSettings = latest.current.settings || {};
        if (currentSettings.shareGuestHistory === false || currentSettings.incognito) return;
        if (!guestDirty.current || !Array.isArray(latest.current.history) || latest.current.history.length === 0) {
          return;
        }
        const guestId = getGuestId();
        if (!guestId) return;
        guestDirty.current = false;
        clearTimeout(guestTimer.current);
        lastGuestSyncAt.current = Date.now();
        fetch("/api/guest/sync", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestId,
            history: latest.current.history.slice(0, 200),
          }),
        }).catch(() => {});
      }
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

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyBundle,
  assessSync,
  buildBundle,
  discoverOrCreateGist,
  isLocalDirty,
  readGistFile,
  summarizeBundle,
  updateGistFile,
  validateBundle,
  type DataSummary,
  type SyncBundle,
} from "../domain/gist";
import { saveState } from "../domain/storage";
import { loadState } from "../domain/storage";
import type { AppSettings, AppState } from "../types";

type Action =
  | { type: "mutate"; fn: (state: AppState) => AppState }
  | { type: "replace"; state: AppState }
  | { type: "patch-settings"; settings: Partial<AppSettings>; bump?: boolean };

function reducer(state: AppState, action: Action): AppState {
  if (action.type === "replace") return action.state;
  if (action.type === "patch-settings") {
    const settings = { ...state.settings, ...action.settings };
    if (action.bump) {
      settings.localRevision = state.settings.localRevision + 1;
      settings.dataUpdatedAt = new Date().toISOString();
    }
    return { ...state, settings };
  }
  const next = action.fn(state);
  return {
    ...next,
    settings: {
      ...next.settings,
      localRevision: state.settings.localRevision + 1,
      dataUpdatedAt: new Date().toISOString(),
    },
  };
}

export interface ConflictInfo {
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localSummary: DataSummary;
  remoteSummary: DataSummary;
  remoteBundle: SyncBundle;
  remoteRevision: string;
}

export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error" | "conflict";

export interface SyncController {
  status: SyncStatus;
  detail: string;
  conflict: ConflictInfo | null;
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
  syncNow: () => Promise<void>;
  keepLocal: () => Promise<void>;
  keepCloud: () => void;
}

interface StoreValue {
  state: AppState;
  update: (action: Action) => void;
  mutate: (fn: (state: AppState) => AppState) => void;
  patchSettings: (settings: Partial<AppSettings>, bump?: boolean) => void;
  sync: SyncController;
  saveError: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

function offlineMessage(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|network request failed|offline/i.test(message);
}

function useCloudSync(
  stateRef: { current: AppState },
  update: (action: Action) => void,
  watch: { localRevision: number; gistId: string | null; token: string },
): SyncController {
  const [status, setStatus] = useState<SyncStatus>("local");
  const [detail, setDetail] = useState("Saved on this device");
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [booted, setBooted] = useState(false);
  const conflictRef = useRef<ConflictInfo | null>(null);
  const lastPull = useRef(0);
  const queue = useRef(Promise.resolve());
  const performRef = useRef<(reason: "startup" | "manual" | "edit" | "focus") => Promise<void>>(async () => undefined);

  const enqueue = useCallback((fn: () => Promise<void>) => {
    queue.current = queue.current.then(fn, fn);
    return queue.current;
  }, []);

  performRef.current = async (reason) => {
    const current = stateRef.current;
    const token = current.settings.githubToken.trim();
    if (!token) {
      setStatus("local");
      setDetail("Saved on this device");
      return;
    }
    if (conflictRef.current && reason !== "manual") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline");
      setDetail("Offline. Your bench data is still saved in this browser.");
      return;
    }
    setStatus("syncing");
    setDetail(reason === "edit" ? "Saving to your private Gist…" : "Checking your private Gist…");
    try {
      let gistId = current.settings.gistId;
      const revisionAtStart = current.settings.localRevision;
      if (!gistId) {
        const discovered = await discoverOrCreateGist(token, JSON.stringify(buildBundle(stateRef.current), null, 2), fetch);
        gistId = discovered.id;
        update({ type: "patch-settings", settings: { gistId } });
        if (discovered.created) {
          update({
            type: "patch-settings",
            settings: {
              gistId,
              lastSyncedRevision: discovered.revision ?? null,
              lastSyncedAt: new Date().toISOString(),
              syncedLocalRevision: revisionAtStart,
            },
          });
          setConflict(null);
          conflictRef.current = null;
          setStatus("synced");
          setDetail("Private Gist created");
          lastPull.current = Date.now();
          return;
        }
      }
      const remote = await readGistFile(token, gistId, fetch);
      const latest = stateRef.current;
      const action = assessSync({
        localDirty: isLocalDirty(latest.settings),
        lastSyncedRevision: latest.settings.lastSyncedRevision,
        remoteRevision: remote.revision,
      });
      if (action === "conflict") {
        const parsed = validateBundle(JSON.parse(remote.content));
        if (!parsed.ok) throw new Error(parsed.error);
        const nextConflict = {
          localUpdatedAt: latest.settings.dataUpdatedAt,
          remoteUpdatedAt: remote.updatedAt,
          localSummary: summarizeBundle(buildBundle(latest)),
          remoteSummary: summarizeBundle(parsed.bundle),
          remoteBundle: parsed.bundle,
          remoteRevision: remote.revision,
        };
        conflictRef.current = nextConflict;
        setConflict(nextConflict);
        setStatus("conflict");
        setDetail("This device and the Gist both changed.");
        return;
      }
      if (action === "pull") {
        const parsed = validateBundle(JSON.parse(remote.content));
        if (!parsed.ok) throw new Error(parsed.error);
        const next = applyBundle(stateRef.current, parsed.bundle);
        next.settings.githubToken = stateRef.current.settings.githubToken;
        next.settings.gistId = gistId;
        next.settings.lastSyncedRevision = remote.revision;
        next.settings.lastSyncedAt = new Date().toISOString();
        next.settings.syncedLocalRevision = next.settings.localRevision;
        update({ type: "replace", state: next });
        setStatus("synced");
        setDetail("Pulled the latest Gist");
        lastPull.current = Date.now();
        return;
      }
      if (action === "push") {
        const payloadState = stateRef.current;
        const pushedRevision = payloadState.settings.localRevision;
        const updated = await updateGistFile(token, gistId, JSON.stringify(buildBundle(payloadState), null, 2), fetch);
        update({
          type: "patch-settings",
          settings: {
            gistId,
            lastSyncedRevision: updated.revision,
            lastSyncedAt: new Date().toISOString(),
            syncedLocalRevision: pushedRevision,
          },
        });
        setStatus("synced");
        setDetail("Saved to your private Gist");
        lastPull.current = Date.now();
        return;
      }
      setStatus("synced");
      setDetail(current.settings.lastSyncedAt ? "Gist matches this device" : "Connected");
      lastPull.current = Date.now();
    } catch (error) {
      if (offlineMessage(error)) {
        setStatus("offline");
        setDetail("Offline. Your bench data is still saved in this browser.");
        return;
      }
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "Sync failed");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void enqueue(() => performRef.current("startup")).finally(() => {
        if (!cancelled) setBooted(true);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enqueue]);

  useEffect(() => {
    if (!booted) return;
    const current = stateRef.current;
    if (!current.settings.githubToken.trim() || !current.settings.gistId) return;
    if (!isLocalDirty(current.settings) || conflictRef.current) return;
    const timer = window.setTimeout(() => {
      void enqueue(() => performRef.current("edit"));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [booted, enqueue, watch.gistId, watch.localRevision, watch.token]);

  useEffect(() => {
    const onVisible = () => {
      if (!booted || document.visibilityState === "hidden") return;
      if (Date.now() - lastPull.current < 15_000) return;
      lastPull.current = Date.now();
      void enqueue(() => performRef.current("focus"));
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [booted, enqueue]);

  const connect = useCallback(
    async (token: string) => {
      update({
        type: "patch-settings",
        settings: { githubToken: token.trim(), gistId: null, lastSyncedRevision: null },
      });
      await enqueue(() => performRef.current("manual"));
    },
    [enqueue, update],
  );

  const disconnect = useCallback(() => {
    update({
      type: "patch-settings",
      settings: { githubToken: "", gistId: null, lastSyncedRevision: null, lastSyncedAt: null },
    });
    conflictRef.current = null;
    setConflict(null);
    setStatus("local");
    setDetail("Saved on this device");
  }, [update]);

  const syncNow = useCallback(async () => {
    lastPull.current = 0;
    await enqueue(() => performRef.current("manual"));
  }, [enqueue]);

  const keepLocal = useCallback(async () => {
    const latest = stateRef.current;
    const token = latest.settings.githubToken.trim();
    const gistId = latest.settings.gistId;
    if (!token || !gistId) return;
    setStatus("syncing");
    try {
      const updated = await updateGistFile(token, gistId, JSON.stringify(buildBundle(latest), null, 2), fetch);
      update({
        type: "patch-settings",
        settings: {
          lastSyncedRevision: updated.revision,
          lastSyncedAt: new Date().toISOString(),
          syncedLocalRevision: latest.settings.localRevision,
        },
      });
      conflictRef.current = null;
      setConflict(null);
      setStatus("synced");
      setDetail("Kept this device and updated the Gist");
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "Could not keep the local copy");
    }
  }, [stateRef, update]);

  const keepCloud = useCallback(() => {
    const current = conflictRef.current;
    if (!current) return;
    const latest = stateRef.current;
    const next = applyBundle(latest, current.remoteBundle);
    next.settings.githubToken = latest.settings.githubToken;
    next.settings.gistId = latest.settings.gistId;
    next.settings.lastSyncedRevision = current.remoteRevision;
    next.settings.lastSyncedAt = new Date().toISOString();
    next.settings.syncedLocalRevision = latest.settings.localRevision;
    update({ type: "replace", state: next });
    conflictRef.current = null;
    setConflict(null);
    setStatus("synced");
    setDetail("Replaced this device with the Gist");
  }, [stateRef, update]);

  return { status, detail, conflict, connect, disconnect, syncNow, keepLocal, keepCloud };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [saveError, setSaveError] = useState<string | null>(null);

  const update = useCallback((action: Action) => {
    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
  }, []);

  const sync = useCloudSync(stateRef, update, {
    localRevision: state.settings.localRevision,
    gistId: state.settings.gistId,
    token: state.settings.githubToken,
  });

  useEffect(() => {
    stateRef.current = state;
    const saved = saveState(state);
    setSaveError(saved.ok ? null : saved.error);
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state]);

  const mutate = useCallback((fn: (current: AppState) => AppState) => update({ type: "mutate", fn }), [update]);
  const patchSettings = useCallback(
    (settings: Partial<AppSettings>, bump = false) => update({ type: "patch-settings", settings, bump }),
    [update],
  );

  return <StoreContext.Provider value={{ state, update, mutate, patchSettings, sync, saveError }}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}

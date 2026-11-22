"use client";

import { useEffect } from "react";
import { fetchAuthState } from "@/lib/auth-client";
import {
  AUTH_EVENT,
  SYNC_FORCE_EVENT,
  SYNC_STATUS_EVENT,
  applySnapshot,
  clearLocalData,
  decodePayload,
  encodePayload,
  hashSnapshot,
  hasData,
  isSnapshot,
  readSnapshot,
  registerChangeHooks,
  supportsCompression,
} from "@/lib/cloud-sync";

const PUSH_DELAY = 5_000;
const MAX_WAIT = 60_000;
const PULL_COOLDOWN = 60_000;
const ACCOUNT_KEY = "pennywise.cloud.account";

type Status = "idle" | "pending" | "saving" | "saved" | "error";

const state = {
  email: null as string | null,
  dirty: false,
  firstDirtyAt: 0,
  timer: null as ReturnType<typeof setTimeout> | null,
  maxTimer: null as ReturnType<typeof setTimeout> | null,
  lastPullAt: 0,
  lastHash: null as string | null,
  pushing: false,
};

function setStatus(status: Status, detail?: string) {
  window.dispatchEvent(
    new CustomEvent(SYNC_STATUS_EVENT, { detail: { status, detail } }),
  );
}

function timeKey(email: string) {
  return `pennywise.cloud.time.${email}`;
}

function readTime(email: string) {
  const value = Number(window.localStorage.getItem(timeKey(email)));
  return Number.isFinite(value) ? value : 0;
}

function writeTime(email: string, value: number) {
  window.localStorage.setItem(timeKey(email), String(value));
}

function readHash(email: string) {
  return window.localStorage.getItem(`pennywise.cloud.hash.${email}`);
}

function writeHash(email: string, value: string) {
  window.localStorage.setItem(`pennywise.cloud.hash.${email}`, value);
}

function clearTimers() {
  if (state.timer) clearTimeout(state.timer);
  if (state.maxTimer) clearTimeout(state.maxTimer);
  state.timer = null;
  state.maxTimer = null;
}

let activePush: Promise<void> | null = null;

function push() {
  if (activePush) return activePush;
  activePush = runPush().finally(() => {
    activePush = null;
  });
  return activePush;
}

export async function flushCloudSave() {
  if (activePush) await activePush.catch(() => {});
  if (state.email && state.dirty) await push();
}

async function runPush() {
  const email = state.email;
  if (!email || state.pushing || !state.dirty) return;

  clearTimers();
  state.dirty = false;
  state.firstDirtyAt = 0;
  state.pushing = true;
  setStatus("saving");

  try {
    const payload = await readSnapshot();
    const hash = await hashSnapshot(payload);
    if (hash === state.lastHash) {
      setStatus("saved", "Already up to date");
      return;
    }
    const updatedAt = Date.now();
    const body = JSON.stringify({ ...(await encodePayload(payload)), updatedAt });
    const response = await fetch("/api/sync", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(supportsCompression() ? { "X-Sync-Gzip": "1" } : {}),
      },
      body,
      keepalive: body.length < 60_000,
    });
    if (!response.ok) throw new Error("Cloud save failed");
    const result = (await response.json()) as {
      ok?: boolean;
      payload?: unknown;
      compressed?: string;
      updatedAt?: number;
    };

    if (result.ok === false) {
      const remote = await decodePayload(result);
      if (!isSnapshot(remote)) throw new Error("Invalid cloud snapshot");
      await applySnapshot(remote);
      writeTime(email, Number(result.updatedAt) || Date.now());
      state.lastHash = await hashSnapshot(remote);
      writeHash(email, state.lastHash);
      setStatus("saved", "Updated from cloud");
    } else {
      writeTime(email, Number(result.updatedAt) || updatedAt);
      state.lastHash = hash;
      writeHash(email, hash);
      setStatus("saved");
    }
  } catch {
    state.dirty = true;
    setStatus("error", "Cloud save failed");
  } finally {
    state.pushing = false;
    if (state.dirty && state.email) {
      state.timer = setTimeout(() => void push(), PUSH_DELAY);
    }
  }
}

function schedulePush() {
  if (!state.dirty) state.firstDirtyAt = Date.now();
  state.dirty = true;
  if (!state.email) {
    setStatus("pending");
    return;
  }
  writeTime(state.email, Date.now());
  setStatus("pending");

  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => void push(), PUSH_DELAY);

  if (!state.maxTimer) {
    const wait = Math.max(0, MAX_WAIT - (Date.now() - state.firstDirtyAt));
    state.maxTimer = setTimeout(() => void push(), wait);
  }
}

async function pull(force = false) {
  const email = state.email;
  if (!email || state.pushing) return;
  if (!force && Date.now() - state.lastPullAt < PULL_COOLDOWN) return;
  state.lastPullAt = Date.now();

  try {
    const response = await fetch("/api/sync", {
      cache: "no-store",
      headers: supportsCompression() ? { "X-Sync-Gzip": "1" } : {},
    });
    if (!response.ok) throw new Error("Cloud load failed");
    const result = (await response.json()) as {
      payload?: unknown;
      compressed?: string;
      updatedAt?: number;
    };
    const remote = await decodePayload(result);
    const remoteAt = Number(result.updatedAt) || 0;
    const localAt = readTime(email);
    const localSnapshot = await readSnapshot();
    const localEmpty = !hasData(localSnapshot);

    if (state.dirty) return;

    if (isSnapshot(remote) && (remoteAt > localAt || localEmpty)) {
      await applySnapshot(remote);
      writeTime(email, remoteAt);
      state.lastHash = await hashSnapshot(remote);
      writeHash(email, state.lastHash);
      setStatus("saved", "Restored from cloud");
    } else if (!remote && localAt === 0 && hasData(localSnapshot)) {
      state.dirty = true;
      await push();
    } else if (remoteAt < localAt && hasData(localSnapshot)) {
      state.dirty = true;
      await push();
    }
  } catch {
    setStatus("error", "Cloud load failed");
  }
}

async function setup(email: string | null) {
  const keepDirty = state.dirty;
  if (state.email && state.email !== email) {
    if (activePush) await activePush.catch(() => {});
    if (state.dirty && state.email) await push();
  }
  clearTimers();
  const previous = window.localStorage.getItem(ACCOUNT_KEY);
  if (previous && previous !== email) {
    await clearLocalData();
  }
  if (!email) {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } else {
    window.localStorage.setItem(ACCOUNT_KEY, email);
  }
  state.email = email;
  state.dirty = keepDirty && !state.pushing;
  state.firstDirtyAt = state.dirty ? Date.now() : 0;
  state.lastPullAt = 0;
  state.lastHash = email ? readHash(email) : null;
  state.pushing = false;

  if (!email) {
    setStatus("idle");
    return;
  }
  if (state.dirty) await push();
  else await pull(true);
}

const CloudSync = () => {
  useEffect(() => {
    let mounted = true;
    registerChangeHooks(schedulePush);

    const onAuth = (event: Event) => {
      const email = (event as CustomEvent<{ email?: string | null }>).detail?.email ?? null;
      void setup(email);
    };
    const onVisibility = () => {
      if (!state.email) return;
      if (document.visibilityState === "hidden") {
        if (state.dirty) void push();
      } else {
        void pull();
      }
    };
    const onPageHide = () => {
      if (state.dirty) void push();
    };
    const onForcePush = () => {
      if (!state.email) return;
      state.dirty = true;
      void push();
    };

    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener(SYNC_FORCE_EVENT, onForcePush);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    void fetchAuthState()
      .then((data) => {
        if (mounted) void setup(data.email);
      })
      .catch(() => setStatus("error", "Cloud unavailable"));

    return () => {
      mounted = false;
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener(SYNC_FORCE_EVENT, onForcePush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearTimers();
    };
  }, []);

  return null;
};

export default CloudSync;

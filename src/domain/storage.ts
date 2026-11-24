import type { AppState } from "../types";
import { createSeedState, SCHEMA_VERSION, STORAGE_KEY } from "./seed";

export function loadState(storage: Pick<Storage, "getItem"> = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.ingredients) || !parsed.settings) {
      return createSeedState();
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveState(state: AppState, storage: Pick<Storage, "setItem"> = localStorage): { ok: true } | { ok: false; error: string } {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save in this browser." };
  }
}

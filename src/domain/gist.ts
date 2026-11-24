import type { AppState, CompletedBatch, Container, ContainerLot, Formula, Ingredient, IngredientLot, ThemeMode, WaterInciName, WeightUnit } from "../types";

export const GIST_FILENAME = "balmbench-data.json";
const API = "https://api.github.com";

export interface GistFile {
  filename?: string;
  raw_url?: string;
  content?: string;
  truncated?: boolean;
}

export interface GistSummary {
  id: string;
  description: string | null;
  updated_at: string;
  files: Record<string, GistFile | undefined>;
}

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export interface SyncBundle {
  schemaVersion: number;
  app: "BalmBench";
  exportedAt: string;
  dataUpdatedAt: string;
  ingredients: Ingredient[];
  containers: Container[];
  formulas: Formula[];
  ingredientLots: IngredientLot[];
  containerLots: ContainerLot[];
  batches: CompletedBatch[];
  caveats: string[];
  preferences: {
    theme: ThemeMode;
    weightUnit: WeightUnit;
    waterInciName: WaterInciName;
    showCommonNames: boolean;
  };
}

export interface DataSummary {
  ingredients: number;
  containers: number;
  formulas: number;
  versions: number;
  ingredientLots: number;
  containerLots: number;
  batches: number;
}

export type SyncAction = "pull" | "push" | "noop" | "conflict";

export function gistFilenameHit(gist: GistSummary): boolean {
  return Object.keys(gist.files ?? {}).some((name) => name.toLowerCase() === GIST_FILENAME);
}

export function gistMatches(gist: GistSummary): boolean {
  if (gistFilenameHit(gist)) return true;
  return (gist.description ?? "").toLowerCase().includes("balmbench");
}

export function pickGist(gists: GistSummary[]): GistSummary | null {
  const matches = gists.filter(gistMatches);
  const fileHits = matches.filter(gistFilenameHit);
  const pool = (fileHits.length ? fileHits : matches).slice();
  pool.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return pool[0] ?? null;
}

export function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i);
    if (match) return match[1];
  }
  return null;
}

export function assessSync(input: { localDirty: boolean; lastSyncedRevision: string | null; remoteRevision: string | null }): SyncAction {
  if (!input.remoteRevision) return "push";
  if (!input.lastSyncedRevision) return input.localDirty ? "conflict" : "pull";
  if (input.remoteRevision === input.lastSyncedRevision) return input.localDirty ? "push" : "noop";
  return input.localDirty ? "conflict" : "pull";
}

export function isLocalDirty(settings: Pick<AppState["settings"], "localRevision" | "syncedLocalRevision">): boolean {
  return settings.localRevision !== settings.syncedLocalRevision;
}

export function githubHeaders(token: string, extra?: Record<string, string>): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BalmBench",
    ...extra,
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (response.status === 401) return "GitHub rejected this token. Use a classic personal access token with the gist scope.";
    return body.message || `GitHub request failed (${response.status}).`;
  } catch {
    return `GitHub request failed (${response.status}).`;
  }
}

export async function listAllGists(token: string, fetchImpl: FetchLike): Promise<GistSummary[]> {
  const all: GistSummary[] = [];
  let url: string | null = `${API}/gists?per_page=100`;
  for (let page = 0; url && page < 20; page += 1) {
    const response = await fetchImpl(url, { headers: githubHeaders(token) });
    if (!response.ok) throw new Error(await readError(response));
    const batch = (await response.json()) as GistSummary[];
    all.push(...batch);
    url = nextLink(response.headers.get("Link"));
  }
  return all;
}

export async function discoverGist(token: string, fetchImpl: FetchLike): Promise<GistSummary | null> {
  return pickGist(await listAllGists(token, fetchImpl));
}

export async function createPrivateGist(
  token: string,
  content: string,
  fetchImpl: FetchLike,
): Promise<{ id: string; revision: string; updatedAt: string }> {
  const response = await fetchImpl(`${API}/gists`, {
    method: "POST",
    headers: githubHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      description: "BalmBench",
      public: false,
      files: { [GIST_FILENAME]: { content } },
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const gist = (await response.json()) as GistSummary;
  return { id: gist.id, revision: response.headers.get("etag") || gist.updated_at, updatedAt: gist.updated_at };
}

export async function discoverOrCreateGist(
  token: string,
  content: string,
  fetchImpl: FetchLike,
): Promise<{ id: string; created: boolean; revision?: string; updatedAt?: string }> {
  const existing = await discoverGist(token, fetchImpl);
  if (existing) return { id: existing.id, created: false };
  const created = await createPrivateGist(token, content, fetchImpl);
  return { id: created.id, created: true, revision: created.revision, updatedAt: created.updatedAt };
}

export async function readGistFile(
  token: string,
  gistId: string,
  fetchImpl: FetchLike,
): Promise<{ revision: string; updatedAt: string; content: string }> {
  const response = await fetchImpl(`${API}/gists/${gistId}`, { headers: githubHeaders(token) });
  if (!response.ok) throw new Error(await readError(response));
  const gist = (await response.json()) as GistSummary;
  const file =
    gist.files?.[GIST_FILENAME] ??
    Object.values(gist.files ?? {}).find((item) => item?.filename?.toLowerCase() === GIST_FILENAME);
  if (!file) throw new Error("The Gist does not contain balmbench-data.json.");
  let content = file.content ?? "";
  if ((!content || file.truncated) && file.raw_url) {
    const raw = await fetchImpl(file.raw_url, { headers: githubHeaders(token) });
    if (!raw.ok) throw new Error(await readError(raw));
    content = await raw.text();
  }
  return { revision: response.headers.get("etag") || gist.updated_at, updatedAt: gist.updated_at, content };
}

export async function updateGistFile(
  token: string,
  gistId: string,
  content: string,
  fetchImpl: FetchLike,
): Promise<{ revision: string; updatedAt: string }> {
  const response = await fetchImpl(`${API}/gists/${gistId}`, {
    method: "PATCH",
    headers: githubHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      description: "BalmBench",
      files: { [GIST_FILENAME]: { content } },
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const gist = (await response.json()) as GistSummary;
  return { revision: response.headers.get("etag") || gist.updated_at, updatedAt: gist.updated_at };
}

export function buildBundle(state: AppState, exportedAt = new Date().toISOString()): SyncBundle {
  return {
    schemaVersion: state.schemaVersion,
    app: "BalmBench",
    exportedAt,
    dataUpdatedAt: state.settings.dataUpdatedAt,
    ingredients: state.ingredients,
    containers: state.containers,
    formulas: state.formulas,
    ingredientLots: state.ingredientLots,
    containerLots: state.containerLots,
    batches: state.batches,
    caveats: state.caveats,
    preferences: {
      theme: state.settings.theme,
      weightUnit: state.settings.weightUnit,
      waterInciName: state.settings.waterInciName,
      showCommonNames: state.settings.showCommonNames,
    },
  };
}

export function summarizeBundle(bundle: Pick<SyncBundle, "ingredients" | "containers" | "formulas" | "ingredientLots" | "containerLots" | "batches">): DataSummary {
  return {
    ingredients: bundle.ingredients.length,
    containers: bundle.containers.length,
    formulas: bundle.formulas.length,
    versions: bundle.formulas.reduce((sum, formula) => sum + formula.versions.length, 0),
    ingredientLots: bundle.ingredientLots.length,
    containerLots: bundle.containerLots.length,
    batches: bundle.batches.length,
  };
}

export function validateBundle(value: unknown): { ok: true; bundle: SyncBundle } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Backup is not a JSON object." };
  const record = value as Partial<SyncBundle>;
  if (record.app !== "BalmBench") return { ok: false, error: "This file is not a BalmBench backup." };
  if (record.schemaVersion !== 1) return { ok: false, error: "Unsupported backup version." };
  const keys = ["ingredients", "containers", "formulas", "ingredientLots", "containerLots", "batches", "caveats"] as const;
  for (const key of keys) {
    if (!Array.isArray(record[key])) return { ok: false, error: `Backup is missing ${key}.` };
  }
  if (!record.preferences || typeof record.preferences !== "object") return { ok: false, error: "Backup is missing preferences." };
  return { ok: true, bundle: record as SyncBundle };
}

export function applyBundle(state: AppState, bundle: SyncBundle): AppState {
  return {
    ...state,
    schemaVersion: 1,
    ingredients: bundle.ingredients,
    containers: bundle.containers,
    formulas: bundle.formulas,
    ingredientLots: bundle.ingredientLots,
    containerLots: bundle.containerLots,
    batches: bundle.batches,
    caveats: bundle.caveats,
    settings: {
      ...state.settings,
      theme: bundle.preferences.theme === "dark" ? "dark" : "light",
      weightUnit: bundle.preferences.weightUnit === "oz" ? "oz" : "g",
      waterInciName: bundle.preferences.waterInciName === "Water (Aqua)" ? "Water (Aqua)" : "Aqua",
      showCommonNames: Boolean(bundle.preferences.showCommonNames),
      dataUpdatedAt: bundle.dataUpdatedAt || state.settings.dataUpdatedAt,
    },
  };
}

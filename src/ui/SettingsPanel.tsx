import { useState } from "react";
import { buildBundle, summarizeBundle, validateBundle } from "../domain/gist";
import { formatWhen, todayISO } from "../domain/format";
import { bundledSeed, createSeedState } from "../domain/seed";
import { useStore } from "../state/Store";
import { Badge, downloadJson, Field, Modal } from "./bits";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { state, update, patchSettings, sync, saveError } = useStore();
  const [token, setToken] = useState(state.settings.githubToken);
  const [message, setMessage] = useState("");
  const [pendingReset, setPendingReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof validateBundle> | null>(null);
  const rules = bundledSeed().guardrailRules;

  return (
    <Modal title="Settings" onClose={onClose} wide testId="settings-panel">
      <div className="stack">
        {saveError ? <p className="banner danger">This browser could not save locally: {saveError}</p> : null}
        <section className="card">
          <h3>Bench preferences</h3>
          <div className="fields cols-2">
            <Field label="Theme">
              <select
                value={state.settings.theme}
                onChange={(event) => patchSettings({ theme: event.target.value as "light" | "dark" }, true)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
            <Field label="Default weight unit">
              <select
                value={state.settings.weightUnit}
                onChange={(event) => patchSettings({ weightUnit: event.target.value as "g" | "oz" }, true)}
              >
                <option value="g">Grams</option>
                <option value="oz">Ounces</option>
              </select>
            </Field>
            <Field label="Water on labels">
              <select
                value={state.settings.waterInciName}
                onChange={(event) => patchSettings({ waterInciName: event.target.value as "Aqua" | "Water (Aqua)" }, true)}
              >
                <option value="Aqua">Aqua</option>
                <option value="Water (Aqua)">Water (Aqua)</option>
              </select>
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={state.settings.showCommonNames}
                onChange={(event) => patchSettings({ showCommonNames: event.target.checked }, true)}
              />
              <span>Show common names on INCI labels by default</span>
            </label>
          </div>
        </section>

        <section className="card" id="cloud-sync">
          <div className="split">
            <h3>Cloud sync</h3>
            <Badge tone={sync.status === "synced" ? "sage" : sync.status === "conflict" ? "amber" : "ink"}>{sync.status}</Badge>
          </div>
          <p className="muted">
            A classic GitHub personal access token with the <strong>gist</strong> scope is required. Fine-grained tokens do not support Gists.
            Create one at GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token, and tick only
            <strong> gist</strong>. The token stays in this browser and is sent only to https://api.github.com.
          </p>
          <Field label="GitHub token" hint={sync.detail}>
            <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
          </Field>
          <div className="cluster">
            <button className="btn primary" type="button" onClick={() => void sync.connect(token)}>
              Connect
            </button>
            <button className="btn" type="button" onClick={() => void sync.syncNow()}>
              Sync now
            </button>
            <button className="btn ghost" type="button" onClick={sync.disconnect}>
              Disconnect
            </button>
          </div>
          <p className="muted">
            Gist {state.settings.gistId ? <a href={`https://gist.github.com/${state.settings.gistId}`} target="_blank" rel="noopener noreferrer">{state.settings.gistId}</a> : "not connected"}
            {" · "}Last synced {formatWhen(state.settings.lastSyncedAt)}
          </p>
        </section>

        <section className="card">
          <h3>Backup</h3>
          <div className="cluster">
            <button
              className="btn"
              type="button"
              onClick={() => downloadJson(`balmbench-backup-${todayISO()}.json`, buildBundle(state))}
            >
              Export JSON
            </button>
            <label className="btn ghost">
              Import JSON
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    const parsed = validateBundle(JSON.parse(await file.text()));
                    if (!parsed.ok) setMessage(parsed.error);
                    else setPendingImport(parsed);
                  } catch {
                    setMessage("Could not read that JSON file.");
                  }
                }}
              />
            </label>
            <button className="btn danger" type="button" onClick={() => setPendingReset(true)}>
              Reset to starter seed
            </button>
          </div>
          {message ? <p className="banner danger">{message}</p> : null}
        </section>

        <section className="card">
          <h3>Sourcing caveats</h3>
          <ul className="caveat">
            {state.caveats.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>Guardrail library</h3>
          <div className="list">
            {rules.map((rule) => (
              <article key={rule.id} className="quote">
                <div className="split">
                  <strong>{rule.id}</strong>
                  <Badge tone={rule.severity === "error" ? "clay" : rule.severity === "warning" ? "amber" : "blue"}>{rule.severity}</Badge>
                </div>
                <p>{rule.message}</p>
              </article>
            ))}
          </div>
        </section>

        {pendingReset ? (
          <div className="banner">
            <p>Replace recipes, inventory, batches, and catalog edits with the 2026-11-23 starter seed? The GitHub token stays on this device.</p>
            <div className="cluster">
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  const seed = createSeedState();
                  update({
                    type: "replace",
                    state: {
                      ...seed,
                      settings: {
                        ...seed.settings,
                        theme: state.settings.theme,
                        githubToken: state.settings.githubToken,
                        gistId: state.settings.gistId,
                        lastSyncedAt: state.settings.lastSyncedAt,
                        lastSyncedRevision: state.settings.lastSyncedRevision,
                        localRevision: state.settings.localRevision + 1,
                        syncedLocalRevision: state.settings.syncedLocalRevision,
                        dataUpdatedAt: new Date().toISOString(),
                      },
                    },
                  });
                  setPendingReset(false);
                }}
              >
                Reset data
              </button>
              <button className="btn ghost" type="button" onClick={() => setPendingReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {pendingImport && pendingImport.ok ? (
          <div className="banner">
            <p>
              Replace local data with this backup ({summarizeBundle(pendingImport.bundle).formulas} formulas, {summarizeBundle(pendingImport.bundle).batches} batches, {summarizeBundle(pendingImport.bundle).ingredientLots} raw lots)?
            </p>
            <div className="cluster">
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  if (!pendingImport.ok) return;
                  const next = {
                    ...state,
                    ingredients: pendingImport.bundle.ingredients,
                    containers: pendingImport.bundle.containers,
                    formulas: pendingImport.bundle.formulas,
                    ingredientLots: pendingImport.bundle.ingredientLots,
                    containerLots: pendingImport.bundle.containerLots,
                    batches: pendingImport.bundle.batches,
                    caveats: pendingImport.bundle.caveats,
                    settings: {
                      ...state.settings,
                      theme: pendingImport.bundle.preferences.theme,
                      weightUnit: pendingImport.bundle.preferences.weightUnit,
                      waterInciName: pendingImport.bundle.preferences.waterInciName,
                      showCommonNames: pendingImport.bundle.preferences.showCommonNames,
                      localRevision: state.settings.localRevision + 1,
                      dataUpdatedAt: new Date().toISOString(),
                    },
                  };
                  update({ type: "replace", state: next });
                  setPendingImport(null);
                }}
              >
                Replace local data
              </button>
              <button className="btn ghost" type="button" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

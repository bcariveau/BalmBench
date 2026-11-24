import { useEffect, useState } from "react";
import { effectiveCostPerG } from "../domain/catalog";
import { diffIsEmpty, diffVersions } from "../domain/diff";
import { formatTempRange, formatWeight, money, phaseLabel, productLabel, uid } from "../domain/format";
import { gramsForPct } from "../domain/scale";
import { evaluateGuardrails, guardrailCounts } from "../domain/guardrails";
import { blankVersion, createSeedState } from "../domain/seed";
import { cloneFormula, commitDraft, latestVersion, nextVersionLabel, restoreAsNewVersion, startDraft } from "../domain/versions";
import { useStore } from "../state/Store";
import { Badge } from "../ui/bits";
import { InciDialog } from "../ui/InciDialog";
import { navigate } from "../ui/router";
import type { FormulaVersion, Phase, PhWindow, ProductType } from "../types";

const PHASES: Phase[] = ["water", "oil", "cool_down"];
const TEMP_KEYS = [
  ["melt", "Melt"],
  ["waterHeat", "Water heat"],
  ["oilHeat", "Oil heat"],
  ["coolDownAdd", "Cool-down"],
  ["pour", "Pour"],
] as const;

export function RecipesView({ formulaId }: { formulaId?: string }) {
  const { state, mutate } = useStore();
  const formula = state.formulas.find((item) => item.id === formulaId) ?? state.formulas[0];
  const [versionId, setVersionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState(false);
  const [inciOpen, setInciOpen] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  useEffect(() => {
    setVersionId(formula?.versions.at(-1)?.id ?? null);
    setEditing(Boolean(formula && formula.versions.length === 0 && formula.draft));
    setNote("");
    setHistory(false);
  }, [formula?.id, formula?.versions.length]);

  function createFormula() {
    const id = uid("formula");
    mutate((current) => ({
      ...current,
      formulas: [...current.formulas, { id, createdAt: new Date().toISOString(), versions: [], draft: blankVersion() }],
    }));
    navigate(`/recipes/${id}`);
  }

  if (!formula) {
    return (
      <section>
        <div className="page-head">
          <h1>Recipes</h1>
          <p className="lede">No formulas yet.</p>
        </div>
        <button className="btn primary" type="button" onClick={createFormula}>
          New formula
        </button>
      </section>
    );
  }

  const selected = formula.versions.find((version) => version.id === versionId) ?? latestVersion(formula);
  const shown = editing && formula.draft ? formula.draft : selected;
  const findings = shown ? evaluateGuardrails(shown, state.ingredients) : [];
  const counts = guardrailCounts(findings);
  const used = selected ? state.batches.some((batch) => batch.formulaId === formula.id && batch.versionId === selected.id) : false;

  function patchDraft(partial: Partial<FormulaVersion>) {
    mutate((current) => ({
      ...current,
      formulas: current.formulas.map((item) =>
        item.id === formula.id && item.draft ? { ...item, draft: { ...item.draft, ...partial } } : item,
      ),
    }));
  }

  function beginEdit() {
    if (!selected && !formula.draft) return;
    mutate((current) => ({
      ...current,
      formulas: current.formulas.map((item) =>
        item.id === formula.id ? { ...item, draft: item.draft ?? (selected ? startDraft(selected) : blankVersion()) } : item,
      ),
    }));
    setEditing(true);
  }

  return (
    <section>
      <div className="page-head">
        <div className="split">
          <div>
            <h1>Recipes</h1>
            <p className="lede">Formulas, version history, and live safety checks.</p>
          </div>
          <button className="btn primary" type="button" onClick={createFormula}>
            New formula
          </button>
        </div>
      </div>
      <div className="recipe-layout">
        <div className="list">
          {state.formulas.map((item) => {
            const version = latestVersion(item);
            const preview = item.draft ?? version;
            const itemFindings = preview ? evaluateGuardrails(preview, state.ingredients) : [];
            return (
              <button
                key={item.id}
                type="button"
                className="choice"
                aria-current={item.id === formula.id}
                onClick={() => navigate(`/recipes/${item.id}`)}
              >
                <strong>{preview?.name ?? item.id}</strong>
                <span className="cluster">
                  <Badge tone={preview?.productType === "lip" ? "clay" : "sage"}>{preview ? productLabel(preview.productType) : "Draft"}</Badge>
                  <Badge>{version?.versionLabel ?? "draft"}</Badge>
                  {guardrailCounts(itemFindings).error > 0 ? <Badge tone="clay">Blocked</Badge> : null}
                </span>
              </button>
            );
          })}
        </div>
        {shown ? (
          <div className="stack">
            <article className="card stack">
              <div className="split">
                <div>
                  <h2 data-testid="recipe-title">{shown.name}</h2>
                  <p className="muted">
                    {productLabel(shown.productType)} · {editing ? "Draft" : shown.versionLabel}
                    {used ? " · locked by a completed batch" : ""}
                  </p>
                </div>
                <div className="cluster">
                  <button className="btn" type="button" onClick={() => setInciOpen(true)}>
                    INCI label
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setHistory((open) => !open)}>
                    History
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      const id = uid("formula");
                      const sourceId = selected?.id ?? formula.versions.at(-1)?.id ?? "v1.0";
                      mutate((current) => ({ ...current, formulas: [...current.formulas, cloneFormula(formula, sourceId, id)] }));
                      navigate(`/recipes/${id}`);
                    }}
                  >
                    Clone
                  </button>
                </div>
              </div>
              {formula.draft && !editing ? (
                <div className="banner">
                  A draft is in progress.
                  <div className="cluster">
                    <button className="btn" type="button" onClick={() => setEditing(true)}>
                      Resume draft
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => {
                        if (!window.confirm("Discard this draft?")) return;
                        mutate((current) => ({
                          ...current,
                          formulas: current.formulas.map((item) => (item.id === formula.id ? { ...item, draft: null } : item)),
                        }));
                      }}
                    >
                      Discard draft
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="cluster">
                <Badge tone={counts.error ? "clay" : "sage"}>{counts.error} blocking</Badge>
                <Badge tone={counts.warning ? "amber" : "ink"}>{counts.warning} warnings</Badge>
                <Badge tone="blue">{counts.info} notes</Badge>
              </div>
              <div data-testid="guardrail-list" className="stack">
                {findings.length === 0 ? <p className="muted">No guardrail notes.</p> : null}
                <ul className="findings">
                  {findings.map((finding, index) => (
                    <li key={`${finding.ruleId}-${index}`} className={`finding ${finding.severity}`}>
                      <strong>{finding.severity === "error" ? "Blocking" : finding.severity === "warning" ? "Warning" : "Note"}</strong>
                      <span>{finding.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            {editing && formula.draft ? (
              <Editor draft={formula.draft} note={note} setNote={setNote} patchDraft={patchDraft} containers={state.containers} ingredients={state.ingredients} />
            ) : selected ? (
              <RecipeRead version={selected} ingredients={state.ingredients} containers={state.containers} />
            ) : null}

            <div className="cluster">
              {!editing ? (
                <button className="btn primary" type="button" onClick={beginEdit}>
                  Edit draft
                </button>
              ) : (
                <>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => {
                      if (!note.trim()) return;
                      const label = nextVersionLabel(formula.versions);
                      mutate((current) => ({
                        ...current,
                        formulas: current.formulas.map((item) => (item.id === formula.id && item.draft ? commitDraft(item, item.draft, note) : item)),
                      }));
                      setVersionId(label);
                      setEditing(false);
                      setNote("");
                    }}
                  >
                    Save new version
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setEditing(false)}>
                    Close editor
                  </button>
                </>
              )}
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  if (state.batches.some((batch) => batch.formulaId === formula.id)) {
                    window.alert("Completed batches still point at this formula, so it stays in the book.");
                    return;
                  }
                  if (!window.confirm("Delete this formula?")) return;
                  mutate((current) => ({ ...current, formulas: current.formulas.filter((item) => item.id !== formula.id) }));
                  navigate("/recipes");
                }}
              >
                Delete
              </button>
            </div>

            {history ? (
              <article className="card stack">
                <h3>Version history</h3>
                <div className="cluster">
                  {formula.versions.map((version) => (
                    <button
                      key={version.id}
                      className="btn ghost"
                      type="button"
                      aria-pressed={version.id === selected?.id}
                      onClick={() => {
                        setVersionId(version.id);
                        setEditing(false);
                      }}
                    >
                      {version.versionLabel}
                    </button>
                  ))}
                </div>
                <div className="list">
                  {formula.versions.map((version) => (
                    <div key={version.id} className="quote">
                      <div className="split">
                        <strong>{version.versionLabel}</strong>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => {
                            const label = nextVersionLabel(formula.versions);
                            mutate((current) => ({
                              ...current,
                              formulas: current.formulas.map((item) =>
                                item.id === formula.id ? restoreAsNewVersion(item, version.id, `Restored from ${version.versionLabel}.`) : item,
                              ),
                            }));
                            setVersionId(label);
                          }}
                        >
                          Restore as new version
                        </button>
                      </div>
                      <p className="muted">
                        {new Date(version.createdAt).toLocaleString()} · {version.changeNote || "No note"}
                      </p>
                    </div>
                  ))}
                </div>
                {formula.versions.length > 1 ? (
                  <div className="stack">
                    <h3>Compare</h3>
                    <div className="fields cols-2">
                      <label className="field">
                        <span>From</span>
                        <select value={compareA} onChange={(event) => setCompareA(event.target.value)}>
                          <option value="">Choose</option>
                          {formula.versions.map((version) => (
                            <option key={version.id} value={version.id}>
                              {version.versionLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>To</span>
                        <select value={compareB} onChange={(event) => setCompareB(event.target.value)}>
                          <option value="">Choose</option>
                          {formula.versions.map((version) => (
                            <option key={version.id} value={version.id}>
                              {version.versionLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <DiffPanel formulaVersions={formula.versions} fromId={compareA} toId={compareB} ingredients={state.ingredients} />
                  </div>
                ) : null}
              </article>
            ) : null}
          </div>
        ) : null}
      </div>
      {inciOpen && shown ? (
        <InciDialog
          version={shown}
          catalog={state.ingredients}
          waterName={state.settings.waterInciName}
          showCommonNames={state.settings.showCommonNames}
          netGrams={state.containers.find((item) => item.id === shown.defaultContainerId)?.approxFillG}
          onClose={() => setInciOpen(false)}
          onOrderChange={
            editing && formula.draft
              ? (order) => patchDraft({ inciMinorOrder: order })
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

function RecipeRead({
  version,
  ingredients,
  containers,
}: {
  version: FormulaVersion;
  ingredients: ReturnType<typeof createSeedState>["ingredients"];
  containers: ReturnType<typeof createSeedState>["containers"];
}) {
  return (
    <article className="card stack">
      <div className="grid-3">
        <Meta label="Default batch" value={`${version.batchSizeDefaultG} g`} />
        <Meta label="Shelf life" value={`${version.estimatedShelfLifeMonths} months`} />
        <Meta label="Target pH" value={version.targetPhRange ? `${version.targetPhRange.min}–${version.targetPhRange.max}` : "—"} />
        <Meta label="System" value={version.isAnhydrous ? "Anhydrous" : "Emulsion / aqueous"} />
        <Meta label="Containers" value={version.recommendedContainerIds.map((id) => containers.find((item) => item.id === id)?.name ?? id).join(", ") || "—"} />
      </div>
      <div className="cluster">
        {TEMP_KEYS.map(([key, label]) => (
          <Badge key={key}>
            {label}: {formatTempRange(version.phaseTempsC[key])}
          </Badge>
        ))}
      </div>
      <div className="list">
        {version.ingredients.map((line) => {
          const ingredient = ingredients.find((item) => item.id === line.ingredientId);
          const cost = ingredient ? effectiveCostPerG(ingredient) : null;
          const grams = gramsForPct(version.batchSizeDefaultG, line.pct);
          return (
            <div key={`${line.ingredientId}-${line.phase}`} className="split">
              <div>
                <strong>{ingredient?.name ?? line.ingredientId}</strong>
                <div className="muted">
                  {line.pct}% · {phaseLabel(line.phase)} · {formatWeight(grams, "g")}
                </div>
              </div>
              <span>{cost == null ? "No cost" : money(grams * cost, 2)}</span>
            </div>
          );
        })}
      </div>
      <ol>
        {version.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {version.notes ? <p>{version.notes}</p> : null}
    </article>
  );
}

function Editor({
  draft,
  note,
  setNote,
  patchDraft,
  ingredients,
  containers,
}: {
  draft: FormulaVersion;
  note: string;
  setNote: (value: string) => void;
  patchDraft: (partial: Partial<FormulaVersion>) => void;
  ingredients: ReturnType<typeof createSeedState>["ingredients"];
  containers: ReturnType<typeof createSeedState>["containers"];
}) {
  const total = draft.ingredients.reduce((sum, line) => sum + line.pct, 0);
  return (
    <article className="card stack">
      <div className="fields cols-2">
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
        </label>
        <label className="field">
          <span>Product</span>
          <select
            value={draft.productType}
            onChange={(event) => {
              const productType = event.target.value as ProductType;
              patchDraft({
                productType,
                isAnhydrous: productType === "lip",
                phaseTempsC: {
                  ...draft.phaseTempsC,
                  coolDownAdd: { ...(draft.phaseTempsC.coolDownAdd ?? {}), max: productType === "lip" ? 65 : 45 },
                },
              });
            }}
          >
            <option value="lip">Lip</option>
            <option value="bodyLotion">Body lotion</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.isAnhydrous} onChange={(event) => patchDraft({ isAnhydrous: event.target.checked })} />
          <span>Anhydrous</span>
        </label>
        <label className="field">
          <span>Default batch (g)</span>
          <input type="number" min={0} value={draft.batchSizeDefaultG} onChange={(event) => patchDraft({ batchSizeDefaultG: Number(event.target.value) || 0 })} />
        </label>
        <label className="field">
          <span>Shelf life (months)</span>
          <input
            type="number"
            min={0}
            value={draft.estimatedShelfLifeMonths}
            onChange={(event) => patchDraft({ estimatedShelfLifeMonths: Number(event.target.value) || 0 })}
          />
        </label>
        <label className="field">
          <span>Target pH min</span>
          <input value={draft.targetPhRange?.min ?? ""} onChange={(event) => patchDraft({ targetPhRange: phRange(draft.targetPhRange, "min", event.target.value) })} />
        </label>
        <label className="field">
          <span>Target pH max</span>
          <input value={draft.targetPhRange?.max ?? ""} onChange={(event) => patchDraft({ targetPhRange: phRange(draft.targetPhRange, "max", event.target.value) })} />
        </label>
      </div>
      <div className="fields cols-2">
        {TEMP_KEYS.map(([key, label]) => (
          <div key={key} className="fields cols-2">
            <label className="field">
              <span>{label} min °C</span>
              <input
                value={draft.phaseTempsC[key]?.min ?? ""}
                onChange={(event) => patchDraft({ phaseTempsC: tempPatch(draft, key, "min", event.target.value) })}
              />
            </label>
            <label className="field">
              <span>{label} max °C</span>
              <input
                value={draft.phaseTempsC[key]?.max ?? ""}
                onChange={(event) => patchDraft({ phaseTempsC: tempPatch(draft, key, "max", event.target.value) })}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="split">
        <h3>Ingredients</h3>
        <strong className={Math.abs(total - 100) > 0.01 ? "banner danger" : "banner ok"}>Total {total.toFixed(2)}%</strong>
      </div>
      {draft.ingredients.map((line, index) => (
        <div key={`${line.ingredientId}-${index}`} className="fields cols-3">
          <select
            value={line.ingredientId}
            onChange={(event) => {
              const ingredient = ingredients.find((item) => item.id === event.target.value);
              const next = draft.ingredients.slice();
              next[index] = { ...line, ingredientId: event.target.value, phase: ingredient?.defaultPhase ?? line.phase };
              patchDraft({ ingredients: next });
            }}
          >
            {ingredients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.1"
            value={line.pct}
            aria-label="Percent"
            onChange={(event) => {
              const next = draft.ingredients.slice();
              next[index] = { ...line, pct: Number(event.target.value) || 0 };
              patchDraft({ ingredients: next });
            }}
          />
          <div className="cluster">
            <select
              value={line.phase}
              aria-label="Phase"
              onChange={(event) => {
                const next = draft.ingredients.slice();
                next[index] = { ...line, phase: event.target.value as Phase };
                patchDraft({ ingredients: next });
              }}
            >
              {PHASES.map((phase) => (
                <option key={phase} value={phase}>
                  {phaseLabel(phase)}
                </option>
              ))}
            </select>
            <button
              className="btn ghost"
              type="button"
              onClick={() => patchDraft({ ingredients: draft.ingredients.filter((_, item) => item !== index) })}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        className="btn"
        type="button"
        onClick={() => {
          const ingredient = ingredients[0];
          if (!ingredient) return;
          patchDraft({ ingredients: [...draft.ingredients, { ingredientId: ingredient.id, pct: 0, phase: ingredient.defaultPhase }] });
        }}
      >
        Add ingredient
      </button>
      <h3>Recommended containers</h3>
      <div className="list">
        {containers.map((container) => (
          <label key={container.id} className="check">
            <input
              type="checkbox"
              checked={draft.recommendedContainerIds.includes(container.id)}
              onChange={(event) => {
                const ids = event.target.checked
                  ? [...draft.recommendedContainerIds, container.id]
                  : draft.recommendedContainerIds.filter((id) => id !== container.id);
                patchDraft({
                  recommendedContainerIds: ids,
                  defaultContainerId: ids.includes(draft.defaultContainerId ?? "") ? draft.defaultContainerId : ids[0] ?? null,
                });
              }}
            />
            <span>
              {container.name} · {container.approxFillG} g
            </span>
          </label>
        ))}
      </div>
      <h3>Steps</h3>
      {draft.steps.map((step, index) => (
        <div key={index} className="cluster">
          <textarea
            value={step}
            aria-label={`Step ${index + 1}`}
            onChange={(event) => {
              const steps = draft.steps.slice();
              steps[index] = event.target.value;
              patchDraft({ steps });
            }}
          />
          <button className="btn ghost" type="button" onClick={() => patchDraft({ steps: draft.steps.filter((_, item) => item !== index) })}>
            Remove
          </button>
        </div>
      ))}
      <button className="btn" type="button" onClick={() => patchDraft({ steps: [...draft.steps, ""] })}>
        Add step
      </button>
      <label className="field">
        <span>Notes</span>
        <textarea value={draft.notes} onChange={(event) => patchDraft({ notes: event.target.value })} />
      </label>
      <label className="field">
        <span>Change note for the next version</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed?" />
      </label>
    </article>
  );
}

function DiffPanel({
  formulaVersions,
  fromId,
  toId,
  ingredients,
}: {
  formulaVersions: FormulaVersion[];
  fromId: string;
  toId: string;
  ingredients: ReturnType<typeof createSeedState>["ingredients"];
}) {
  const from = formulaVersions.find((version) => version.id === fromId);
  const to = formulaVersions.find((version) => version.id === toId);
  if (!from || !to) return <p className="muted">Choose two versions.</p>;
  const diff = diffVersions(from, to, ingredients);
  if (diffIsEmpty(diff)) return <p className="muted">No differences.</p>;
  return (
    <div className="stack">
      {diff.ingredients.map((row) => (
        <p key={row.ingredientId}>
          {row.name}: {row.from == null ? "added" : `${row.from}%`} → {row.to == null ? "removed" : `${row.to}%`}
          {row.phaseFrom !== row.phaseTo ? ` (${row.phaseFrom ?? "—"} → ${row.phaseTo ?? "—"})` : ""}
        </p>
      ))}
      {diff.ph ? (
        <p>
          pH {diff.ph.from} → {diff.ph.to}
        </p>
      ) : null}
      {diff.temps.map((row) => (
        <p key={row.key}>
          {row.key}: {row.from} → {row.to}
        </p>
      ))}
      {diff.fields.map((row) => (
        <p key={row.label}>
          {row.label}: {row.from} → {row.to}
        </p>
      ))}
      {diff.stepsAdded.map((step) => (
        <p key={step}>Step added: {step}</p>
      ))}
      {diff.stepsRemoved.map((step) => (
        <p key={step}>Step removed: {step}</p>
      ))}
      {diff.stepsReordered ? <p>Step order changed.</p> : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="muted">{label}</span>
      <b>{value}</b>
    </div>
  );
}

function phRange(current: PhWindow | null, side: "min" | "max", value: string): PhWindow | null {
  const next = { min: current?.min ?? 0, max: current?.max ?? 0, [side]: value === "" ? Number.NaN : Number(value) };
  if (!Number.isFinite(next.min) && !Number.isFinite(next.max)) return null;
  if (!Number.isFinite(next.min) || !Number.isFinite(next.max)) return current;
  return { min: next.min, max: next.max };
}

function tempPatch(draft: FormulaVersion, key: (typeof TEMP_KEYS)[number][0], side: "min" | "max", value: string) {
  const current = { ...(draft.phaseTempsC[key] ?? {}) };
  if (value === "") delete current[side];
  else current[side] = Number(value);
  const next = { ...draft.phaseTempsC };
  if (current.min == null && current.max == null) delete next[key];
  else next[key] = current;
  return next;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { applyBatch, buildBatchPlan, nextBatchLotCode } from "../domain/batch";
import { formatTempRange, formatWeight, money, phaseLabel, round, todayISO, uid } from "../domain/format";
import { evaluateGuardrails, guardrailCounts } from "../domain/guardrails";
import { scaleFormula, type ScaleInput } from "../domain/scale";
import { useStore } from "../state/Store";
import { Badge, Modal } from "../ui/bits";
import { navigate } from "../ui/router";
import type { Phase } from "../types";

const PHASES: Phase[] = ["water", "oil", "cool_down"];

export function BatchView() {
  const { state, mutate } = useStore();
  const formula = state.formulas.find((item) => item.versions.length > 0) ?? state.formulas[0];
  const [formulaId, setFormulaId] = useState(formula?.id ?? "");
  const selectedFormula = state.formulas.find((item) => item.id === formulaId) ?? formula;
  const [versionId, setVersionId] = useState(selectedFormula?.versions.at(-1)?.id ?? "");
  const version = selectedFormula?.versions.find((item) => item.id === versionId) ?? selectedFormula?.versions.at(-1);
  const [containerId, setContainerId] = useState(version?.defaultContainerId ?? state.containers[0]?.id ?? "");
  const container = state.containers.find((item) => item.id === containerId);
  const [mode, setMode] = useState<"weight" | "count">("weight");
  const [weight, setWeight] = useState(version?.batchSizeDefaultG ?? 100);
  const [unit, setUnit] = useState(state.settings.weightUnit);
  const [count, setCount] = useState(12);
  const [fill, setFill] = useState(container?.approxFillG ?? 0);
  const [overage, setOverage] = useState(5);
  const [unitsTouched, setUnitsTouched] = useState(false);
  const [unitsValue, setUnitsValue] = useState(0);
  const [labelMisc, setLabelMisc] = useState(0);
  const [lotCode, setLotCode] = useState("");
  const [lotTouched, setLotTouched] = useState(false);
  const [madeDate, setMadeDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [rd, setRd] = useState(false);
  const [workshop, setWorkshop] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmShort, setConfirmShort] = useState(false);

  useEffect(() => {
    if (!version) return;
    setContainerId(version.defaultContainerId ?? state.containers[0]?.id ?? "");
    setWeight(version.batchSizeDefaultG);
    setUnitsTouched(false);
    setLotTouched(false);
  }, [version?.id, state.containers]);

  useEffect(() => {
    const next = state.containers.find((item) => item.id === containerId);
    if (next) setFill(next.approxFillG);
  }, [containerId, state.containers]);

  useEffect(() => {
    if (!version || lotTouched) return;
    setLotCode(nextBatchLotCode(state.batches, version.productType, new Date(`${madeDate}T12:00:00`)));
  }, [lotTouched, madeDate, state.batches, version]);

  const scale: ScaleInput = {
    mode,
    weightValue: weight,
    weightUnit: unit,
    containerCount: count,
    fillG: fill,
    overagePct: mode === "count" ? overage : 0,
  };
  const previewUnits = version ? scaleFormula(version.ingredients, scale).units : 0;
  const units = mode === "count" ? previewUnits : unitsTouched ? unitsValue : previewUnits;
  const plan = useMemo(() => {
    if (!version || !selectedFormula) return null;
    return buildBatchPlan({
      formulaId: selectedFormula.id,
      version,
      ingredients: state.ingredients,
      containers: state.containers,
      ingredientLots: state.ingredientLots,
      containerLots: state.containerLots,
      containerId,
      scale,
      unitsOverride: units,
      labelMisc,
      lotCode,
      madeDate,
      notes,
      rdOverride: rd,
    });
  }, [containerId, labelMisc, lotCode, madeDate, notes, rd, scale, selectedFormula, state.containerLots, state.containers, state.ingredientLots, state.ingredients, units, version]);

  if (!selectedFormula || !version || !plan) {
    return (
      <section className="page-head">
        <h1>Batch maker</h1>
        <p className="lede">Save a formula version before making a batch.</p>
      </section>
    );
  }

  const activeVersion = version;
  const activeFormula = selectedFormula;
  const findings = evaluateGuardrails(activeVersion, state.ingredients);
  const counts = guardrailCounts(findings);
  const blocking = counts.error > 0;

  function complete(allowShort: boolean) {
    if (!lotCode.trim()) {
      setMessage("Add a batch lot code.");
      return;
    }
    if (state.batches.some((batch) => batch.lotCode === lotCode.trim())) {
      setMessage("That lot code is already used.");
      return;
    }
    if (plan && plan.batchG <= 0) {
      setMessage("Enter a batch weight or a container count.");
      return;
    }
    if (blocking && !rd) {
      setMessage("Blocking safety errors stop this batch unless you check the personal R&D override.");
      return;
    }
    if (plan && plan.shortages.length > 0 && !allowShort) {
      setConfirmShort(true);
      return;
    }
    const id = uid("batch");
    mutate((current) => {
      const applied = applyBatch({
        id,
        formulaId: activeFormula.id,
        version: activeVersion,
        ingredients: current.ingredients,
        containers: current.containers,
        ingredientLots: current.ingredientLots,
        containerLots: current.containerLots,
        containerId,
        scale,
        unitsOverride: units,
        labelMisc,
        lotCode,
        madeDate,
        notes,
        rdOverride: rd && blocking,
      });
      return { ...current, ingredientLots: applied.ingredientLots, containerLots: applied.containerLots, batches: [applied.batch, ...current.batches] };
    });
    setConfirmShort(false);
    setWorkshop(false);
    navigate(`/trace/batch/${encodeURIComponent(id)}`);
  }

  return (
    <section>
      <div className="page-head">
        <div className="split">
          <div>
            <h1>Batch maker</h1>
            <p className="lede">Scale a saved version, check stock, then run it on the bench.</p>
          </div>
          <button className="btn primary" type="button" onClick={() => setWorkshop(true)}>
            Workshop mode
          </button>
        </div>
      </div>
      {message ? <p className="banner danger">{message}</p> : null}
      <div className="grid-2">
        <article className="card stack">
          <div className="fields cols-2">
            <label className="field">
              <span>Formula</span>
              <select
                value={selectedFormula.id}
                onChange={(event) => {
                  const next = state.formulas.find((item) => item.id === event.target.value);
                  setFormulaId(event.target.value);
                  setVersionId(next?.versions.at(-1)?.id ?? "");
                  setLotTouched(false);
                }}
              >
                {state.formulas.filter((item) => item.versions.length > 0).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.versions.at(-1)?.name ?? item.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Version</span>
              <select value={version.id} onChange={(event) => setVersionId(event.target.value)}>
                {selectedFormula.versions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.versionLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Container</span>
              <select value={containerId} onChange={(event) => setContainerId(event.target.value)}>
                {state.containers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Lot code</span>
              <input
                value={lotCode}
                onChange={(event) => {
                  setLotTouched(true);
                  setLotCode(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>Made date</span>
              <input type="date" value={madeDate} onChange={(event) => setMadeDate(event.target.value)} />
            </label>
            <label className="field">
              <span>Label / misc cost</span>
              <input type="number" min={0} step="0.01" value={labelMisc} onChange={(event) => setLabelMisc(Number(event.target.value) || 0)} />
            </label>
          </div>
          <div className="segment">
            <button type="button" className="btn" aria-pressed={mode === "weight"} onClick={() => setMode("weight")}>
              Total weight
            </button>
            <button type="button" className="btn" aria-pressed={mode === "count"} onClick={() => setMode("count")}>
              Container count
            </button>
          </div>
          {mode === "weight" ? (
            <div className="fields cols-2">
              <label className="field">
                <span>Batch weight</span>
                <input type="number" min={0} step="0.1" value={weight} onChange={(event) => setWeight(Number(event.target.value) || 0)} />
              </label>
              <label className="field">
                <span>Unit</span>
                <select value={unit} onChange={(event) => setUnit(event.target.value as "g" | "oz")}>
                  <option value="g">g</option>
                  <option value="oz">oz</option>
                </select>
              </label>
              <label className="field">
                <span>Containers to deduct</span>
                <input
                  type="number"
                  min={0}
                  value={units}
                  onChange={(event) => {
                    setUnitsTouched(true);
                    setUnitsValue(Number(event.target.value) || 0);
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="fields cols-3">
              <label className="field">
                <span>Containers</span>
                <input type="number" min={0} value={count} onChange={(event) => setCount(Number(event.target.value) || 0)} />
              </label>
              <label className="field">
                <span>Fill weight (g)</span>
                <input type="number" min={0} step="0.1" value={fill} onChange={(event) => setFill(Number(event.target.value) || 0)} />
              </label>
              <label className="field">
                <span>Pouring overage %</span>
                <input type="number" min={0} step="0.5" value={overage} onChange={(event) => setOverage(Number(event.target.value) || 0)} />
              </label>
            </div>
          )}
          <p className="muted">
            Batch {round(plan.batchG, 2)} g · {plan.units} units · fill {round(plan.fillG, 2)} g
            {mode === "count" ? ` · ${overage}% overage` : ""}
          </p>
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {blocking ? (
            <label className="check">
              <input type="checkbox" checked={rd} onChange={(event) => setRd(event.target.checked)} />
              <span>Personal R&D test batch. Complete even though blocking safety errors are present.</span>
            </label>
          ) : null}
          <button className="btn primary" type="button" onClick={() => complete(false)}>
            Complete batch
          </button>
        </article>
        <div className="stack">
          <article className="card stack">
            <h3>Guardrails</h3>
            <div className="cluster">
              <Badge tone={counts.error ? "clay" : "sage"}>{counts.error} blocking</Badge>
              <Badge tone={counts.warning ? "amber" : "ink"}>{counts.warning} warnings</Badge>
            </div>
            <ul className="findings">
              {findings.map((finding, index) => (
                <li key={`${finding.ruleId}-${index}`} className={`finding ${finding.severity}`}>
                  <strong>{finding.severity}</strong>
                  <span>{finding.message}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="card stack">
            <h3>COGS preview</h3>
            <div className="grid-3">
              <div className="kpi">
                <span className="muted">Catalog batch</span>
                <b>{money(plan.estimated.batch)}</b>
              </div>
              <div className="kpi">
                <span className="muted">Catalog / unit</span>
                <b>{money(plan.estimated.unit)}</b>
              </div>
              <div className="kpi">
                <span className="muted">Lots on hand</span>
                <b>{money(plan.actual.batch)}</b>
              </div>
            </div>
            <p className="muted">
              Ingredients {money(plan.estimated.ingredient)} · containers {money(plan.estimated.container)} · label/misc {money(plan.estimated.labelMisc)}.
              The lot preview only prices grams and containers that are actually in stock.
            </p>
          </article>
          <article className="card stack">
            <h3>FEFO stock</h3>
            {plan.lines.map((line) => (
              <div key={line.ingredientId} className={line.shortG > 0 ? "quote short" : "quote"}>
                <div className="split">
                  <strong>{line.name}</strong>
                  {line.shortG > 0 ? <Badge tone="clay">Short {round(line.shortG, 2)} g</Badge> : <Badge tone="sage">In stock</Badge>}
                </div>
                <span className="muted">
                  Need {round(line.grams, 2)} g · on hand {round(line.availableG, 2)} g
                  {line.deductions.length ? ` · ${line.deductions.map((item) => `${item.lotCode} ${round(item.grams, 2)} g`).join(", ")}` : ""}
                </span>
              </div>
            ))}
            <div className={plan.containerShort > 0 ? "quote short" : "quote"}>
              <div className="split">
                <strong>{container?.name ?? "Container"}</strong>
                {plan.containerShort > 0 ? <Badge tone="clay">Short {plan.containerShort}</Badge> : <Badge tone="sage">In stock</Badge>}
              </div>
              <span className="muted">
                Need {plan.containerNeeded} · on hand {plan.containerAvailable}
              </span>
            </div>
          </article>
        </div>
      </div>
      {workshop ? (
        <Workshop
          name={version.name}
          lotCode={lotCode}
          plan={plan}
          version={version}
          unit={unit}
          message={message}
          blocking={blocking}
          rd={rd}
          onRd={setRd}
          onClose={() => setWorkshop(false)}
          onComplete={() => complete(false)}
        />
      ) : null}
      {confirmShort ? (
        <Modal title="Short stock" onClose={() => setConfirmShort(false)} testId="shortage-modal">
          <div className="stack">
            <p>These lots cannot cover the batch. Cancel to restock, or complete anyway. Depleted lots stop at zero and the shortage is written on the batch.</p>
            <ul>
              {plan.shortages.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  {item.name}: need {item.needed} {item.unit}, have {item.available} {item.unit}, short {round(item.needed - item.available, 3)} {item.unit}
                </li>
              ))}
            </ul>
            <div className="cluster">
              <button className="btn" type="button" onClick={() => setConfirmShort(false)}>
                Cancel and restock
              </button>
              <button className="btn danger" type="button" onClick={() => complete(true)}>
                Complete anyway
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function Workshop({
  name,
  lotCode,
  plan,
  version,
  unit,
  message,
  blocking,
  rd,
  onRd,
  onClose,
  onComplete,
}: {
  name: string;
  lotCode: string;
  plan: NonNullable<ReturnType<typeof buildBatchPlan>>;
  version: { phaseTempsC: { melt?: { min?: number; max?: number }; waterHeat?: { min?: number; max?: number }; oilHeat?: { min?: number; max?: number }; coolDownAdd?: { min?: number; max?: number }; pour?: { min?: number; max?: number } }; steps: string[]; isAnhydrous: boolean };
  unit: "g" | "oz";
  message: string;
  blocking: boolean;
  rd: boolean;
  onRd: (value: boolean) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const wake = useWakeLock();
  const [displayUnit, setDisplayUnit] = useState(unit);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const tempFor = (phase: Phase) => {
    if (phase === "water") return version.phaseTempsC.waterHeat ?? version.phaseTempsC.melt;
    if (phase === "oil") return version.phaseTempsC.oilHeat ?? version.phaseTempsC.melt;
    return version.phaseTempsC.coolDownAdd;
  };
  return (
    <div className="workshop" data-testid="workshop">
      <div className="split">
        <div>
          <h1>{name}</h1>
          <p className="muted">{lotCode}</p>
        </div>
        <div className="cluster">
          <button className="btn" type="button" onClick={() => setDisplayUnit((current) => (current === "g" ? "oz" : "g"))}>
            {displayUnit === "g" ? "Show oz" : "Show g"}
          </button>
          <button className="btn" type="button" onClick={wake.toggle} disabled={!wake.supported}>
            {wake.supported ? (wake.on ? "Screen awake" : "Keep screen awake") : "Wake lock unavailable"}
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {!wake.supported ? (
        <p className="muted">Screen wake lock is unavailable here. On Android Chrome, open the installed BalmBench app or the site directly.</p>
      ) : null}
      {message ? <p className="banner danger">{message}</p> : null}
      {blocking ? (
        <label className="check">
          <input type="checkbox" checked={rd} onChange={(event) => onRd(event.target.checked)} />
          <span>Personal R&D test batch. Complete even though blocking safety errors are present.</span>
        </label>
      ) : null}
      {PHASES.map((phase) => {
        const lines = plan.lines.filter((line) => line.phase === phase);
        if (!lines.length) return null;
        return (
          <section key={phase}>
            <div className="split">
              <h2>{phaseLabel(phase)}</h2>
              <strong>{formatTempRange(tempFor(phase))}</strong>
            </div>
            {lines.map((line) => (
              <label key={line.ingredientId} className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(checked[line.ingredientId])}
                  onChange={(event) => setChecked((current) => ({ ...current, [line.ingredientId]: event.target.checked }))}
                />
                <span>{line.name}</span>
                <span className="grams">{formatWeight(line.grams, displayUnit)}</span>
              </label>
            ))}
          </section>
        );
      })}
      <h2>Pour {formatTempRange(version.phaseTempsC.pour)}</h2>
      <ol>
        {version.steps.map((step, index) => (
          <li key={step} className="check-row">
            <input
              type="checkbox"
              checked={Boolean(checked[`step-${index}`])}
              onChange={(event) => setChecked((current) => ({ ...current, [`step-${index}`]: event.target.checked }))}
            />
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="workshop-bar">
        <button className="btn primary" type="button" onClick={onComplete}>
          Complete batch
        </button>
      </div>
    </div>
  );
}

function useWakeLock() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(typeof navigator !== "undefined" && "wakeLock" in navigator);
  const wanted = useRef(false);
  const sentinel = useRef<WakeLockSentinel | null>(null);

  async function request() {
    if (!("wakeLock" in navigator)) {
      setSupported(false);
      return;
    }
    try {
      const lock = await navigator.wakeLock.request("screen");
      sentinel.current = lock;
      setOn(true);
      lock.addEventListener("release", () => {
        setOn(false);
        if (wanted.current && document.visibilityState === "visible") void request();
      });
    } catch {
      setSupported(false);
      setOn(false);
    }
  }

  useEffect(() => {
    const onVisible = () => {
      if (wanted.current && document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      wanted.current = false;
      void sentinel.current?.release();
    };
  }, []);

  function toggle() {
    if (!supported) return;
    if (wanted.current) {
      wanted.current = false;
      void sentinel.current?.release();
      setOn(false);
    } else {
      wanted.current = true;
      void request();
    }
  }

  return { on, supported, toggle };
}

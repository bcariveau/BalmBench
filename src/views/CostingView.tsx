import { useMemo, useState } from "react";
import { buildBatchPlan } from "../domain/batch";
import { effectiveUnitCost } from "../domain/catalog";
import { marginFromPrice, priceFromMargin } from "../domain/cogs";
import { money, round } from "../domain/format";
import { latestVersion } from "../domain/versions";
import { useStore } from "../state/Store";

export function CostingView() {
  const { state } = useStore();
  const recipes = state.formulas
    .map((formula) => ({ formula, version: latestVersion(formula) }))
    .filter((item): item is { formula: (typeof state.formulas)[number]; version: NonNullable<ReturnType<typeof latestVersion>> } => Boolean(item.version));
  const [source, setSource] = useState(recipes[0] ? `recipe:${recipes[0].formula.id}` : state.batches[0] ? `batch:${state.batches[0].id}` : "");
  const [mode, setMode] = useState<"margin" | "price">("margin");
  const [retailMargin, setRetailMargin] = useState(60);
  const [wholesaleMargin, setWholesaleMargin] = useState(40);
  const [retailPrice, setRetailPrice] = useState(8);
  const [wholesalePrice, setWholesalePrice] = useState(4);

  const selected = useMemo(() => {
    if (source.startsWith("batch:")) {
      const batch = state.batches.find((item) => item.id === source.slice(6));
      if (!batch) return null;
      return {
        title: `${batch.versionSnapshot.name} ${batch.lotCode}`,
        units: batch.unitsProduced,
        batch: batch.batchCogs,
        unit: batch.unitCogs,
        ingredient: batch.ingredientCogs,
        container: batch.containerCogs,
        label: batch.labelMiscCost,
        kind: "Actual lot cost",
      };
    }
    const formula = recipes.find((item) => `recipe:${item.formula.id}` === source) ?? recipes[0];
    if (!formula) return null;
    const container = state.containers.find((item) => item.id === formula.version.defaultContainerId) ?? state.containers[0];
    const plan = buildBatchPlan({
      formulaId: formula.formula.id,
      version: formula.version,
      ingredients: state.ingredients,
      containers: state.containers,
      ingredientLots: [],
      containerLots: [],
      containerId: container?.id ?? "",
      scale: {
        mode: "weight",
        weightValue: formula.version.batchSizeDefaultG,
        weightUnit: "g",
        containerCount: 0,
        fillG: container?.approxFillG ?? 0,
        overagePct: 0,
      },
      lotCode: "estimate",
      madeDate: "2026-11-24",
      notes: "",
      rdOverride: false,
    });
    return {
      title: `${formula.version.name} ${formula.version.versionLabel}`,
      units: plan.units,
      batch: plan.estimated.batch,
      unit: plan.estimated.unit,
      ingredient: plan.estimated.ingredient,
      container: plan.estimated.container,
      label: plan.estimated.labelMisc,
      kind: `Estimate at ${formula.version.batchSizeDefaultG} g${container ? ` in ${container.name}` : ""}`,
    };
  }, [recipes, source, state.batches, state.containers, state.ingredients]);

  if (!selected) {
    return (
      <section className="page-head">
        <h1>Costing</h1>
        <p className="lede">Save a formula to estimate a price.</p>
      </section>
    );
  }

  const retail = mode === "margin" ? priceFromMargin(selected.unit, retailMargin) : retailPrice;
  const wholesale = mode === "margin" ? priceFromMargin(selected.unit, wholesaleMargin) : wholesalePrice;
  const retailMarginPct = mode === "price" ? marginFromPrice(selected.unit, retail) : retailMargin;
  const wholesaleMarginPct = mode === "price" ? marginFromPrice(selected.unit, wholesale) : wholesaleMargin;

  return (
    <section>
      <div className="page-head">
        <h1>Costing</h1>
        <p className="lede">Catalog estimates and the real cost of finished batches.</p>
      </div>
      <div className="grid-2">
        <article className="card stack">
          <label className="field">
            <span>Price this</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              {recipes.map((item) => (
                <option key={item.formula.id} value={`recipe:${item.formula.id}`}>
                  {item.version.name} estimate
                </option>
              ))}
              {state.batches.map((batch) => (
                <option key={batch.id} value={`batch:${batch.id}`}>
                  {batch.lotCode} actual
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{selected.kind}</p>
          <div className="grid-3">
            <Kpi label="Batch COGS" value={money(selected.batch)} />
            <Kpi label="Unit COGS" value={money(selected.unit)} />
            <Kpi label="Units" value={String(selected.units)} />
          </div>
          <p className="muted">
            Ingredients {money(selected.ingredient)} · containers {money(selected.container)}
            {selected.label ? ` · label/misc ${money(selected.label)}` : ""}
            {state.containers[0] ? ` · container cost basis ${money(effectiveUnitCost(state.containers[0]) ?? 0)}` : ""}
          </p>
          <div className="segment">
            <button type="button" className="btn" aria-pressed={mode === "margin"} onClick={() => setMode("margin")}>
              Set margin
            </button>
            <button type="button" className="btn" aria-pressed={mode === "price"} onClick={() => setMode("price")}>
              Set price
            </button>
          </div>
          <div className="fields cols-2">
            {mode === "margin" ? (
              <>
                <NumberField label="Retail margin %" value={retailMargin} onChange={setRetailMargin} />
                <NumberField label="Wholesale margin %" value={wholesaleMargin} onChange={setWholesaleMargin} />
              </>
            ) : (
              <>
                <NumberField label="Retail price" value={retailPrice} onChange={setRetailPrice} />
                <NumberField label="Wholesale price" value={wholesalePrice} onChange={setWholesalePrice} />
              </>
            )}
          </div>
        </article>
        <div className="stack">
          <PriceCard title="Retail" price={retail} margin={retailMarginPct} unitCost={selected.unit} units={selected.units} />
          <PriceCard title="Wholesale" price={wholesale} margin={wholesaleMarginPct} unitCost={selected.unit} units={selected.units} />
        </div>
      </div>
      {state.batches.length ? (
        <article className="card stack">
          <h3>Recent batches</h3>
          {state.batches.slice(0, 8).map((batch) => (
            <div key={batch.id} className="split">
              <span>
                {batch.lotCode} · {batch.versionSnapshot.name}
              </span>
              <span>
                {money(batch.batchCogs)} batch · {money(batch.unitCogs)} / unit
              </span>
            </div>
          ))}
        </article>
      ) : null}
    </section>
  );
}

function PriceCard({ title, price, margin, unitCost, units }: { title: string; price: number; margin: number; unitCost: number; units: number }) {
  const profit = price - unitCost;
  return (
    <article className="card stack">
      <h3>{title}</h3>
      <div className="grid-3">
        <Kpi label="Price" value={money(price)} />
        <Kpi label="Gross margin" value={`${round(margin, 1)}%`} />
        <Kpi label="Profit / unit" value={money(profit)} />
      </div>
      <p>Profit / batch {money(profit * units)}</p>
    </article>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="muted">{label}</span>
      <b>{value}</b>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

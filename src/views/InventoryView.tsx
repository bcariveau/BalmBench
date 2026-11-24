import { useState } from "react";
import { containerOnHand, effectiveCostPerG, effectiveUnitCost, ingredientOnHand, recomputeContainerQuote, recomputeIngredientQuote } from "../domain/catalog";
import { addMonths, categoryLabel, daysUntil, money, todayISO, uid } from "../domain/format";
import { useStore } from "../state/Store";
import { Badge } from "../ui/bits";
import { InciDialog } from "../ui/InciDialog";
import type { InventorySegment } from "../ui/router";
import { navigate } from "../ui/router";
import type { CompletedBatch, Container, ContainerQuote, Ingredient, IngredientQuote, Phase } from "../types";

const CATEGORIES = ["wax", "butter", "carrier_oil", "emulsifier", "preservative", "water", "antioxidant", "essential_oil", "hydrosol", "additive"];

export function InventoryView({ segment }: { segment: InventorySegment }) {
  const segments: { id: InventorySegment; label: string }[] = [
    { id: "raw", label: "Raw" },
    { id: "containers", label: "Containers" },
    { id: "finished", label: "Finished" },
    { id: "catalog", label: "Catalog" },
  ];
  return (
    <section>
      <div className="page-head">
        <h1>Inventory</h1>
        <p className="lede">Lots, finished jars and tubes, and the supplier catalog.</p>
      </div>
      <div className="segment inventory-tabs" role="tablist">
        {segments.map((item) => (
          <button key={item.id} type="button" className="btn" aria-pressed={segment === item.id} onClick={() => navigate(`/inventory/${item.id}`)}>
            {item.label}
          </button>
        ))}
      </div>
      {segment === "raw" ? <RawMaterials /> : null}
      {segment === "containers" ? <ContainerStock /> : null}
      {segment === "finished" ? <FinishedGoods /> : null}
      {segment === "catalog" ? <Catalog /> : null}
    </section>
  );
}

function RawMaterials() {
  const { state, mutate } = useStore();
  const [open, setOpen] = useState(false);
  const [ingredientId, setIngredientId] = useState(state.ingredients[0]?.id ?? "");
  const [form, setForm] = useState(() => blankLot(state.ingredients[0]));

  return (
    <div className="stack">
      <button className="btn primary" type="button" onClick={() => setOpen((value) => !value)}>
        Add restock lot
      </button>
      {open ? (
        <form
          className="card fields cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const ingredient = state.ingredients.find((item) => item.id === ingredientId);
            if (!ingredient || form.qty <= 0 || !form.lotCode.trim()) return;
            mutate((current) => ({
              ...current,
              ingredientLots: [
                {
                  id: uid("lot"),
                  ingredientId,
                  lotCode: form.lotCode.trim(),
                  supplier: form.supplier,
                  qtyRemainingG: form.qty,
                  qtyOriginalG: form.qty,
                  unitCostPerG: form.cost,
                  purchaseDate: form.purchase,
                  expirationDate: form.expiration || addMonths(form.purchase, ingredient.shelfLifeMonths),
                  notes: form.notes,
                },
                ...current.ingredientLots,
              ],
            }));
            setOpen(false);
          }}
        >
          <label className="field">
            <span>Ingredient</span>
            <select
              value={ingredientId}
              onChange={(event) => {
                const ingredient = state.ingredients.find((item) => item.id === event.target.value);
                setIngredientId(event.target.value);
                setForm(blankLot(ingredient));
              }}
            >
              {state.ingredients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Lot code</span>
            <input value={form.lotCode} onChange={(event) => setForm({ ...form, lotCode: event.target.value })} required />
          </label>
          <label className="field">
            <span>Supplier</span>
            <input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
          </label>
          <label className="field">
            <span>Quantity (g)</span>
            <input type="number" min={0} step="0.1" value={form.qty} onChange={(event) => setForm({ ...form, qty: Number(event.target.value) || 0 })} />
          </label>
          <label className="field">
            <span>Cost / g</span>
            <input type="number" min={0} step="0.0001" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) || 0 })} />
          </label>
          <label className="field">
            <span>Purchased</span>
            <input type="date" value={form.purchase} onChange={(event) => setForm({ ...form, purchase: event.target.value })} />
          </label>
          <label className="field">
            <span>Expires</span>
            <input type="date" value={form.expiration} onChange={(event) => setForm({ ...form, expiration: event.target.value })} />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <button className="btn primary" type="submit">
            Save lot
          </button>
        </form>
      ) : null}
      {state.ingredients.map((ingredient) => {
        const lots = state.ingredientLots.filter((lot) => lot.ingredientId === ingredient.id);
        const onHand = ingredientOnHand(lots, ingredient.id);
        const low = ingredient.reorderThresholdG > 0 && onHand <= ingredient.reorderThresholdG;
        const expiring = lots.some((lot) => lot.qtyRemainingG > 0 && daysUntil(lot.expirationDate) <= 60 && daysUntil(lot.expirationDate) >= 0);
        const expired = lots.some((lot) => lot.qtyRemainingG > 0 && daysUntil(lot.expirationDate) < 0);
        const cost = effectiveCostPerG(ingredient);
        return (
          <article key={ingredient.id} className="card stack">
            <div className="split">
              <div>
                <h3>{ingredient.name}</h3>
                <p className="muted">
                  {roundish(onHand)} g on hand · {cost == null ? "no active cost" : `${money(cost, 4)} / g`}
                </p>
              </div>
              <div className="cluster">
                {low ? <Badge tone="amber">Low stock</Badge> : null}
                {expiring ? <Badge tone="amber">Expiring soon</Badge> : null}
                {expired ? <Badge tone="clay">Expired</Badge> : null}
              </div>
            </div>
            <label className="field">
              <span>Reorder at (g)</span>
              <input
                type="number"
                min={0}
                value={ingredient.reorderThresholdG}
                onChange={(event) => {
                  const reorderThresholdG = Number(event.target.value) || 0;
                  mutate((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((item) => (item.id === ingredient.id ? { ...item, reorderThresholdG } : item)),
                  }));
                }}
              />
            </label>
            {lots.map((lot) => (
              <div key={lot.id} className="lot">
                <div className="split">
                  <strong>{lot.lotCode}</strong>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Delete this lot?")) return;
                      mutate((current) => ({ ...current, ingredientLots: current.ingredientLots.filter((item) => item.id !== lot.id) }));
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="fields cols-3">
                  <FieldEdit label="Remaining g" value={lot.qtyRemainingG} onChange={(qtyRemainingG) => updateLot(mutate, lot.id, { qtyRemainingG: Math.max(0, qtyRemainingG) })} />
                  <FieldEdit label="Cost / g" value={lot.unitCostPerG} onChange={(unitCostPerG) => updateLot(mutate, lot.id, { unitCostPerG })} />
                  <label className="field">
                    <span>Supplier</span>
                    <input value={lot.supplier} onChange={(event) => updateLot(mutate, lot.id, { supplier: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Purchased</span>
                    <input type="date" value={lot.purchaseDate} onChange={(event) => updateLot(mutate, lot.id, { purchaseDate: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Expires</span>
                    <input type="date" value={lot.expirationDate} onChange={(event) => updateLot(mutate, lot.id, { expirationDate: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <input value={lot.notes} onChange={(event) => updateLot(mutate, lot.id, { notes: event.target.value })} />
                  </label>
                </div>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}

function ContainerStock() {
  const { state, mutate } = useStore();
  const [open, setOpen] = useState(false);
  const [containerId, setContainerId] = useState(state.containers[0]?.id ?? "");
  const [form, setForm] = useState({ lotCode: "", supplier: "", qty: 0, cost: 0, purchase: todayISO(), expiration: "", notes: "" });
  return (
    <div className="stack">
      <button className="btn primary" type="button" onClick={() => setOpen((value) => !value)}>
        Add restock lot
      </button>
      {open ? (
        <form
          className="card fields cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!containerId || form.qty <= 0 || !form.lotCode.trim()) return;
            mutate((current) => ({
              ...current,
              containerLots: [
                {
                  id: uid("clot"),
                  containerId,
                  lotCode: form.lotCode.trim(),
                  supplier: form.supplier,
                  qtyRemaining: form.qty,
                  qtyOriginal: form.qty,
                  unitCostUsd: form.cost,
                  purchaseDate: form.purchase,
                  expirationDate: form.expiration,
                  notes: form.notes,
                },
                ...current.containerLots,
              ],
            }));
            setOpen(false);
          }}
        >
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
            <input value={form.lotCode} onChange={(event) => setForm({ ...form, lotCode: event.target.value })} />
          </label>
          <label className="field">
            <span>Supplier</span>
            <input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
          </label>
          <label className="field">
            <span>Units</span>
            <input type="number" min={0} value={form.qty} onChange={(event) => setForm({ ...form, qty: Number(event.target.value) || 0 })} />
          </label>
          <label className="field">
            <span>Unit cost</span>
            <input type="number" min={0} step="0.01" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) || 0 })} />
          </label>
          <label className="field">
            <span>Purchased</span>
            <input type="date" value={form.purchase} onChange={(event) => setForm({ ...form, purchase: event.target.value })} />
          </label>
          <button className="btn primary" type="submit">
            Save lot
          </button>
        </form>
      ) : null}
      {state.containers.map((container) => {
        const lots = state.containerLots.filter((lot) => lot.containerId === container.id);
        const onHand = containerOnHand(lots, container.id);
        const low = container.reorderThresholdUnits > 0 && onHand <= container.reorderThresholdUnits;
        return (
          <article key={container.id} className="card stack">
            <div className="split">
              <div>
                <h3>{container.name}</h3>
                <p className="muted">
                  {onHand} on hand · fill {container.approxFillG} g · {money(effectiveUnitCost(container) ?? 0)} each
                </p>
              </div>
              {low ? <Badge tone="amber">Low stock</Badge> : null}
            </div>
            <label className="field">
              <span>Reorder at (units)</span>
              <input
                type="number"
                min={0}
                value={container.reorderThresholdUnits}
                onChange={(event) => {
                  const reorderThresholdUnits = Number(event.target.value) || 0;
                  mutate((current) => ({
                    ...current,
                    containers: current.containers.map((item) => (item.id === container.id ? { ...item, reorderThresholdUnits } : item)),
                  }));
                }}
              />
            </label>
            {lots.map((lot) => (
              <div key={lot.id} className="fields cols-3">
                <strong>{lot.lotCode}</strong>
                <FieldEdit
                  label="Remaining"
                  value={lot.qtyRemaining}
                  onChange={(qtyRemaining) =>
                    mutate((current) => ({
                      ...current,
                      containerLots: current.containerLots.map((item) => (item.id === lot.id ? { ...item, qtyRemaining: Math.max(0, qtyRemaining) } : item)),
                    }))
                  }
                />
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => mutate((current) => ({ ...current, containerLots: current.containerLots.filter((item) => item.id !== lot.id) }))}
                >
                  Delete
                </button>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}

function FinishedGoods() {
  const { state, mutate } = useStore();
  const [labelFor, setLabelFor] = useState<CompletedBatch | null>(null);
  const [adjust, setAdjust] = useState({ id: "", qty: 1, reason: "personal" as const });
  if (!state.batches.length) return <p className="empty">Completed batches will land here.</p>;
  return (
    <div className="list">
      {state.batches.map((batch) => (
        <article key={batch.id} className="card stack">
          <div className="split">
            <div>
              <h3>{batch.versionSnapshot.name}</h3>
              <p className="muted">
                {batch.lotCode} · {batch.versionLabel} · made {batch.madeDate} · exp {batch.expirationDate}
              </p>
            </div>
            <Badge tone={batch.unitsRemaining === 0 ? "ink" : "sage"}>{batch.unitsRemaining} left</Badge>
          </div>
          <p>
            {money(batch.unitCogs)} / unit · batch {money(batch.batchCogs)} · produced {batch.unitsProduced}
            {batch.rdOverride ? " · R&D override" : ""}
          </p>
          <div className="cluster">
            <input
              type="number"
              min={1}
              value={adjust.id === batch.id ? adjust.qty : 1}
              aria-label="Units to adjust"
              onChange={(event) => setAdjust({ id: batch.id, qty: Number(event.target.value) || 1, reason: adjust.reason })}
            />
            <select
              value={adjust.id === batch.id ? adjust.reason : "personal"}
              aria-label="Adjustment reason"
              onChange={(event) => setAdjust({ id: batch.id, qty: adjust.qty || 1, reason: event.target.value as typeof adjust.reason })}
            >
              <option value="personal">Personal use</option>
              <option value="gifted">Gifted</option>
              <option value="sold">Sold</option>
              <option value="damaged">Damaged</option>
              <option value="correction">Correction</option>
            </select>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const qty = adjust.id === batch.id ? adjust.qty : 1;
                const reason = adjust.id === batch.id ? adjust.reason : "personal";
                mutate((current) => ({
                  ...current,
                  batches: current.batches.map((item) => {
                    if (item.id !== batch.id) return item;
                    const unitsRemaining = Math.max(0, item.unitsRemaining - qty);
                    return {
                      ...item,
                      unitsRemaining,
                      adjustments: [...item.adjustments, { at: new Date().toISOString(), delta: unitsRemaining - item.unitsRemaining, reason, note: "" }],
                    };
                  }),
                }));
              }}
            >
              Remove units
            </button>
            <button className="btn ghost" type="button" onClick={() => navigate(`/trace/batch/${encodeURIComponent(batch.id)}`)}>
              Trace
            </button>
            <button className="btn ghost" type="button" onClick={() => setLabelFor(batch)}>
              INCI label
            </button>
          </div>
        </article>
      ))}
      {labelFor ? (
        <InciDialog
          version={labelFor.versionSnapshot}
          catalog={labelFor.ingredientSnapshots}
          lotCode={labelFor.lotCode}
          netGrams={labelFor.fillWeightG}
          waterName={state.settings.waterInciName}
          showCommonNames={state.settings.showCommonNames}
          onClose={() => setLabelFor(null)}
        />
      ) : null}
    </div>
  );
}

function Catalog() {
  const { state, mutate } = useStore();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Ingredient | null>(null);
  const [containerDraft, setContainerDraft] = useState<Container | null>(null);
  const needle = query.trim().toLowerCase();
  const ingredients = state.ingredients.filter((item) =>
    !needle || `${item.name} ${item.inciName} ${item.category} ${item.notes} ${item.quotes.map((quote) => quote.supplier).join(" ")}`.toLowerCase().includes(needle),
  );
  const containers = state.containers.filter((item) => !needle || `${item.name} ${item.type} ${item.notes}`.toLowerCase().includes(needle));

  return (
    <div className="stack">
      <input className="search" placeholder="Search ingredients, INCI, suppliers" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="cluster">
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            const ingredient = emptyIngredient();
            setDraft(ingredient);
            setContainerDraft(null);
          }}
        >
          Add ingredient
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            const container = emptyContainer();
            setContainerDraft(container);
            setDraft(null);
          }}
        >
          Add container
        </button>
      </div>
      {draft ? <IngredientEditor draft={draft} setDraft={setDraft} onSave={(ingredient) => saveIngredient(mutate, state.ingredients, ingredient, () => setDraft(null))} onCancel={() => setDraft(null)} /> : null}
      {containerDraft ? (
        <ContainerEditor
          draft={containerDraft}
          setDraft={setContainerDraft}
          onSave={(container) => saveContainer(mutate, state.containers, container, () => setContainerDraft(null))}
          onCancel={() => setContainerDraft(null)}
        />
      ) : null}
      {ingredients.map((ingredient) => (
        <article key={ingredient.id} className="card stack">
          <div className="split">
            <div>
              <h3>{ingredient.name}</h3>
              <p className="muted">
                {ingredient.inciName} · {categoryLabel(ingredient.category)} · {ingredient.lipSafe ? "lip safe" : "not lip safe"} · shelf {ingredient.shelfLifeMonths} mo
              </p>
            </div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setDraft(structuredClone(ingredient));
                setContainerDraft(null);
              }}
            >
              Edit
            </button>
          </div>
          {ingredient.pricingStatus ? <Badge tone="amber">{ingredient.pricingStatus.replaceAll("_", " ")}</Badge> : null}
          {ingredient.notes ? <p>{ingredient.notes}</p> : null}
          {ingredient.quotes.map((quote) => (
            <div key={quote.id} className="quote">
              <div className="split">
                <a href={quote.url} target="_blank" rel="noopener noreferrer">
                  {quote.supplier}
                </a>
                {ingredient.activeQuoteId === quote.id && ingredient.costOverridePerG == null ? <Badge tone="sage">Active cost</Badge> : null}
              </div>
              <p className="muted">
                {quote.packLabel} · {money(quote.priceUsd)} · {money(quote.costPerG, 4)} / g · checked {quote.checkedDate}
              </p>
              {quote.notes ? <p>{quote.notes}</p> : null}
              <button
                className="btn"
                type="button"
                onClick={() =>
                  mutate((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((item) =>
                      item.id === ingredient.id ? { ...item, activeQuoteId: quote.id, costOverridePerG: null } : item,
                    ),
                  }))
                }
              >
                Use as active cost
              </button>
            </div>
          ))}
          <label className="field">
            <span>Custom active cost / g</span>
            <input
              type="number"
              min={0}
              step="0.0001"
              value={ingredient.costOverridePerG ?? ""}
              placeholder={effectiveCostPerG(ingredient)?.toString() ?? "Set a cost"}
              onChange={(event) => {
                const costOverridePerG = event.target.value === "" ? null : Number(event.target.value);
                mutate((current) => ({
                  ...current,
                  ingredients: current.ingredients.map((item) => (item.id === ingredient.id ? { ...item, costOverridePerG } : item)),
                }));
              }}
            />
          </label>
        </article>
      ))}
      {containers.map((container) => (
        <article key={container.id} className="card stack">
          <div className="split">
            <div>
              <h3>{container.name}</h3>
              <p className="muted">
                {container.sizeLabel} · fill about {container.approxFillG} g · active {money(effectiveUnitCost(container) ?? 0)}
              </p>
            </div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setContainerDraft(structuredClone(container));
                setDraft(null);
              }}
            >
              Edit
            </button>
          </div>
          {container.quotes.map((quote) => (
            <div key={quote.id} className="quote">
              <a href={quote.url} target="_blank" rel="noopener noreferrer">
                {quote.supplier}
              </a>
              <p className="muted">
                Pack of {quote.packQty} · {money(quote.priceUsd)} · {money(quote.unitCostUsd)} each · checked {quote.checkedDate}
              </p>
              {quote.notes ? <p>{quote.notes}</p> : null}
              <button
                className="btn"
                type="button"
                onClick={() =>
                  mutate((current) => ({
                    ...current,
                    containers: current.containers.map((item) => (item.id === container.id ? { ...item, activeQuoteId: quote.id, costOverrideUsd: null } : item)),
                  }))
                }
              >
                Use as active cost
              </button>
            </div>
          ))}
        </article>
      ))}
      <details className="card caveat-fold">
        <summary>Sourcing caveats</summary>
        <ul className="caveat">
          {state.caveats.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function IngredientEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Ingredient;
  setDraft: (ingredient: Ingredient) => void;
  onSave: (ingredient: Ingredient) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <h3>{draft.name || "Ingredient"}</h3>
      <div className="fields cols-2">
        <Text label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Text label="INCI" value={draft.inciName} onChange={(inciName) => setDraft({ ...draft, inciName })} />
        <label className="field">
          <span>Category</span>
          <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
            {CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Default phase</span>
          <select value={draft.defaultPhase} onChange={(event) => setDraft({ ...draft, defaultPhase: event.target.value as Phase })}>
            <option value="water">Water</option>
            <option value="oil">Oil</option>
            <option value="cool_down">Cool-down</option>
          </select>
        </label>
        <Num label="Typical min %" value={draft.typicalUsagePct.min} onChange={(min) => setDraft({ ...draft, typicalUsagePct: { ...draft.typicalUsagePct, min } })} />
        <Num label="Typical max %" value={draft.typicalUsagePct.max} onChange={(max) => setDraft({ ...draft, typicalUsagePct: { ...draft.typicalUsagePct, max } })} />
        <Num label="Max lip %" value={draft.maxSafePct.lip ?? ""} onChange={(lip) => setDraft({ ...draft, maxSafePct: { ...draft.maxSafePct, lip } })} />
        <Num label="Max lotion %" value={draft.maxSafePct.bodyLotion ?? ""} onChange={(bodyLotion) => setDraft({ ...draft, maxSafePct: { ...draft.maxSafePct, bodyLotion } })} />
        <Num label="Shelf life months" value={draft.shelfLifeMonths} onChange={(shelfLifeMonths) => setDraft({ ...draft, shelfLifeMonths })} />
        <label className="field">
          <span>Phototoxic</span>
          <select
            value={draft.phototoxic == null ? "unknown" : draft.phototoxic ? "yes" : "no"}
            onChange={(event) => setDraft({ ...draft, phototoxic: event.target.value === "unknown" ? null : event.target.value === "yes" })}
          >
            <option value="unknown">Unspecified</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.lipSafe} onChange={(event) => setDraft({ ...draft, lipSafe: event.target.checked })} />
          <span>Lip safe</span>
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </label>
      <h3>Quotes</h3>
      {draft.quotes.map((quote, index) => (
        <div key={quote.id} className="fields cols-2">
          <Text label="Supplier" value={quote.supplier} onChange={(supplier) => setDraft({ ...draft, quotes: replaceQuote(draft.quotes, index, { ...quote, supplier }) })} />
          <Text label="Pack label" value={quote.packLabel} onChange={(packLabel) => setDraft({ ...draft, quotes: replaceQuote(draft.quotes, index, { ...quote, packLabel }) })} />
          <Num label="Pack g" value={quote.packSizeG} onChange={(packSizeG) => setDraft({ ...draft, quotes: replaceQuote(draft.quotes, index, recomputeIngredientQuote({ ...quote, packSizeG })) })} />
          <Num label="Price USD" value={quote.priceUsd} onChange={(priceUsd) => setDraft({ ...draft, quotes: replaceQuote(draft.quotes, index, recomputeIngredientQuote({ ...quote, priceUsd })) })} />
          <Text label="URL" value={quote.url} onChange={(url) => setDraft({ ...draft, quotes: replaceQuote(draft.quotes, index, { ...quote, url }) })} />
          <Text label="Checked" value={quote.checkedDate} onChange={(checkedDate) => setDraft({ ...draft, quotes: replaceQuote(draft.quotes, index, { ...quote, checkedDate }) })} />
        </div>
      ))}
      <div className="cluster">
        <button
          className="btn"
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              quotes: [
                ...draft.quotes,
                { id: uid("quote"), supplier: "", packSizeG: 0, packLabel: "", priceUsd: 0, costPerG: 0, url: "", checkedDate: todayISO() },
              ],
            })
          }
        >
          Add quote
        </button>
        <button className="btn primary" type="submit">
          Save ingredient
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ContainerEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Container;
  setDraft: (container: Container) => void;
  onSave: (container: Container) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <div className="fields cols-2">
        <Text label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Text label="Type" value={draft.type} onChange={(type) => setDraft({ ...draft, type })} />
        <Text label="Size label" value={draft.sizeLabel} onChange={(sizeLabel) => setDraft({ ...draft, sizeLabel })} />
        <Num label="Approx fill g" value={draft.approxFillG} onChange={(approxFillG) => setDraft({ ...draft, approxFillG })} />
      </div>
      {draft.quotes.map((quote, index) => (
        <div key={quote.id} className="fields cols-2">
          <Text label="Supplier" value={quote.supplier} onChange={(supplier) => setDraft({ ...draft, quotes: replaceContainerQuote(draft.quotes, index, { ...quote, supplier }) })} />
          <Num label="Pack qty" value={quote.packQty} onChange={(packQty) => setDraft({ ...draft, quotes: replaceContainerQuote(draft.quotes, index, recomputeContainerQuote({ ...quote, packQty })) })} />
          <Num label="Price USD" value={quote.priceUsd} onChange={(priceUsd) => setDraft({ ...draft, quotes: replaceContainerQuote(draft.quotes, index, recomputeContainerQuote({ ...quote, priceUsd })) })} />
          <Text label="URL" value={quote.url} onChange={(url) => setDraft({ ...draft, quotes: replaceContainerQuote(draft.quotes, index, { ...quote, url }) })} />
        </div>
      ))}
      <div className="cluster">
        <button
          className="btn"
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              quotes: [...draft.quotes, { id: uid("cquote"), supplier: "", packQty: 0, priceUsd: 0, unitCostUsd: 0, url: "", checkedDate: todayISO() }],
            })
          }
        >
          Add quote
        </button>
        <button className="btn primary" type="submit">
          Save container
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number | ""; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

function FieldEdit({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

function blankLot(ingredient?: Ingredient) {
  const today = todayISO();
  return {
    lotCode: "",
    supplier: ingredient?.quotes[0]?.supplier ?? "",
    qty: 0,
    cost: effectiveCostPerG(ingredient ?? emptyIngredient()) ?? 0,
    purchase: today,
    expiration: ingredient ? addMonths(today, ingredient.shelfLifeMonths) : today,
    notes: "",
  };
}

function emptyIngredient(): Ingredient {
  return {
    id: uid("ing"),
    name: "",
    inciName: "",
    category: "carrier_oil",
    defaultPhase: "oil",
    typicalUsagePct: { min: 1, max: 10 },
    maxSafePct: { lip: null, bodyLotion: null, notes: "" },
    lipSafe: true,
    shelfLifeMonths: 12,
    phWindow: null,
    phototoxic: null,
    notes: "",
    quotes: [],
    activeQuoteId: null,
    costOverridePerG: null,
    reorderThresholdG: 0,
  };
}

function emptyContainer(): Container {
  return {
    id: uid("container"),
    name: "",
    type: "jar",
    sizeLabel: "",
    approxFillG: 0,
    notes: "",
    quotes: [],
    activeQuoteId: null,
    costOverrideUsd: null,
    reorderThresholdUnits: 0,
  };
}

function replaceQuote(quotes: IngredientQuote[], index: number, quote: IngredientQuote) {
  return quotes.map((item, itemIndex) => (itemIndex === index ? quote : item));
}

function replaceContainerQuote(quotes: ContainerQuote[], index: number, quote: ContainerQuote) {
  return quotes.map((item, itemIndex) => (itemIndex === index ? quote : item));
}

function updateLot(mutate: ReturnType<typeof useStore>["mutate"], id: string, patch: Partial<(ReturnType<typeof useStore>["state"]["ingredientLots"][number])>) {
  mutate((current) => ({
    ...current,
    ingredientLots: current.ingredientLots.map((lot) => (lot.id === id ? { ...lot, ...patch } : lot)),
  }));
}

function saveIngredient(mutate: ReturnType<typeof useStore>["mutate"], ingredients: Ingredient[], ingredient: Ingredient, done: () => void) {
  mutate((current) => ({
    ...current,
    ingredients: current.ingredients.some((item) => item.id === ingredient.id)
      ? current.ingredients.map((item) => (item.id === ingredient.id ? ingredient : item))
      : [ingredient, ...current.ingredients],
  }));
  void ingredients;
  done();
}

function saveContainer(mutate: ReturnType<typeof useStore>["mutate"], containers: Container[], container: Container, done: () => void) {
  mutate((current) => ({
    ...current,
    containers: current.containers.some((item) => item.id === container.id)
      ? current.containers.map((item) => (item.id === container.id ? container : item))
      : [container, ...current.containers],
  }));
  void containers;
  done();
}

function roundish(value: number) {
  return Math.round(value * 100) / 100;
}

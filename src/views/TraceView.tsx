import { useState } from "react";
import { money } from "../domain/format";
import { useStore } from "../state/Store";
import { InciDialog } from "../ui/InciDialog";
import { navigate } from "../ui/router";

export function TraceView({ kind, id }: { kind?: "batch" | "ingredient" | "container"; id?: string }) {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [labelId, setLabelId] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const batches = state.batches.filter((batch) => !needle || `${batch.lotCode} ${batch.versionSnapshot.name}`.toLowerCase().includes(needle));
  const ingredientLots = state.ingredientLots.filter((lot) => {
    const name = state.ingredients.find((item) => item.id === lot.ingredientId)?.name ?? "";
    return !needle || `${lot.lotCode} ${lot.supplier} ${name}`.toLowerCase().includes(needle);
  });
  const containerLots = state.containerLots.filter((lot) => {
    const name = state.containers.find((item) => item.id === lot.containerId)?.name ?? "";
    return !needle || `${lot.lotCode} ${lot.supplier} ${name}`.toLowerCase().includes(needle);
  });
  const batch = kind === "batch" ? state.batches.find((item) => item.id === id || item.lotCode === id) : undefined;
  const ingredientLot = kind === "ingredient" ? state.ingredientLots.find((item) => item.id === id) : undefined;
  const containerLot = kind === "container" ? state.containerLots.find((item) => item.id === id) : undefined;
  const forwardBatches = ingredientLot
    ? state.batches.filter((item) => item.rawDeductions.some((row) => row.lotId === ingredientLot.id))
    : containerLot
      ? state.batches.filter((item) => item.containerDeductions.some((row) => row.lotId === containerLot.id))
      : [];
  const labelBatch = state.batches.find((item) => item.id === labelId);

  return (
    <section>
      <div className="page-head">
        <h1>Traceability</h1>
        <p className="lede">Look backward from a finished lot, or forward from a raw or container lot.</p>
      </div>
      <div className="trace-layout">
        <div className="stack">
          <input className="search" placeholder="Search lot codes" value={query} onChange={(event) => setQuery(event.target.value)} />
          <h3>Finished batches</h3>
          {batches.map((item) => (
            <button key={item.id} className="choice" type="button" aria-current={batch?.id === item.id} onClick={() => navigate(`/trace/batch/${encodeURIComponent(item.id)}`)}>
              <strong>{item.lotCode}</strong>
              <span className="muted">{item.versionSnapshot.name}</span>
            </button>
          ))}
          <h3>Raw lots</h3>
          {ingredientLots.map((item) => (
            <button key={item.id} className="choice" type="button" aria-current={ingredientLot?.id === item.id} onClick={() => navigate(`/trace/ingredient/${encodeURIComponent(item.id)}`)}>
              <strong>{item.lotCode}</strong>
              <span className="muted">{state.ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.name}</span>
            </button>
          ))}
          <h3>Container lots</h3>
          {containerLots.map((item) => (
            <button key={item.id} className="choice" type="button" aria-current={containerLot?.id === item.id} onClick={() => navigate(`/trace/container/${encodeURIComponent(item.id)}`)}>
              <strong>{item.lotCode}</strong>
              <span className="muted">{state.containers.find((container) => container.id === item.containerId)?.name}</span>
            </button>
          ))}
          {!batches.length && !ingredientLots.length && !containerLots.length ? (
            <p className="empty">{query.trim() ? "Nothing matches." : "No lots yet. Complete a batch to start a trace."}</p>
          ) : null}
        </div>
        <article className="card stack">
          {batch ? (
            <>
              <div className="split">
                <div>
                  <h2>{batch.lotCode}</h2>
                  <p className="muted">
                    {batch.versionSnapshot.name} {batch.versionLabel} · made {batch.madeDate} · exp {batch.expirationDate}
                  </p>
                </div>
                <button className="btn" type="button" onClick={() => setLabelId(batch.id)}>
                  INCI label
                </button>
              </div>
              <p>
                {batch.unitsRemaining} of {batch.unitsProduced} units left · {money(batch.unitCogs)} / unit · batch {money(batch.batchCogs)}
              </p>
              <p>{batch.containerName}</p>
              {batch.notes ? <p>{batch.notes}</p> : null}
              <h3>Raw lots used</h3>
              {batch.rawDeductions.map((row) => (
                <button key={`${row.lotId}-${row.ingredientId}`} className="choice" type="button" onClick={() => navigate(`/trace/ingredient/${encodeURIComponent(row.lotId)}`)}>
                  <strong>
                    {row.ingredientName} · {row.lotCode}
                  </strong>
                  <span className="muted">
                    {row.supplier} · {row.grams} g · {money(row.unitCostPerG, 4)} / g
                  </span>
                </button>
              ))}
              {!batch.rawDeductions.length ? <p className="muted">No raw lots were deducted.</p> : null}
              <h3>Container lots used</h3>
              {batch.containerDeductions.map((row) => (
                <button key={row.lotId} className="choice" type="button" onClick={() => navigate(`/trace/container/${encodeURIComponent(row.lotId)}`)}>
                  <strong>{row.lotCode}</strong>
                  <span className="muted">
                    {row.supplier} · {row.units} units · {money(row.unitCostUsd)} each
                  </span>
                </button>
              ))}
              {batch.shortages.length ? (
                <div className="banner">
                  {batch.shortages.map((item) => (
                    <p key={`${item.kind}-${item.id}`}>
                      Short {item.name}: needed {item.needed} {item.unit}, had {item.available}.
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {ingredientLot || containerLot ? (
            <>
              <h2>{(ingredientLot ?? containerLot)?.lotCode}</h2>
              <p className="muted">
                {ingredientLot
                  ? state.ingredients.find((item) => item.id === ingredientLot.ingredientId)?.name
                  : state.containers.find((item) => item.id === containerLot?.containerId)?.name}{" "}
                · {(ingredientLot ?? containerLot)?.supplier}
              </p>
              <h3>Finished batches that used it</h3>
              {forwardBatches.map((item) => {
                const raw = ingredientLot ? item.rawDeductions.filter((row) => row.lotId === ingredientLot.id) : [];
                const containers = containerLot ? item.containerDeductions.filter((row) => row.lotId === containerLot.id) : [];
                const amount = ingredientLot ? `${raw.reduce((sum, row) => sum + row.grams, 0)} g` : `${containers.reduce((sum, row) => sum + row.units, 0)} units`;
                return (
                  <button key={item.id} className="choice" type="button" onClick={() => navigate(`/trace/batch/${encodeURIComponent(item.id)}`)}>
                    <strong>{item.lotCode}</strong>
                    <span className="muted">
                      {item.madeDate} · used {amount} · {item.unitsRemaining} finished units left
                    </span>
                  </button>
                );
              })}
              {!forwardBatches.length ? <p className="muted">No finished batch has consumed this lot yet.</p> : null}
            </>
          ) : null}
          {!batch && !ingredientLot && !containerLot ? (
            <p className="empty">
              {state.batches.length || state.ingredientLots.length || state.containerLots.length
                ? "Select a lot to see where it came from or where it went."
                : "No lots yet. Complete a batch to start a trace."}
            </p>
          ) : null}
        </article>
      </div>
      {labelBatch ? (
        <InciDialog
          version={labelBatch.versionSnapshot}
          catalog={labelBatch.ingredientSnapshots}
          lotCode={labelBatch.lotCode}
          netGrams={labelBatch.fillWeightG}
          waterName={state.settings.waterInciName}
          showCommonNames={state.settings.showCommonNames}
          onClose={() => setLabelId(null)}
        />
      ) : null}
    </section>
  );
}

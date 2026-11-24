import { useMemo, useState } from "react";
import { buildInciItems, formatInciList, inciExportRule, inciLabelText, moveMinorOrder } from "../domain/inci";
import { GRAMS_PER_OZ, gramsToOz, round } from "../domain/format";
import type { FormulaVersion, Ingredient, WaterInciName } from "../types";
import { copyText, Modal } from "./bits";

export function InciDialog({
  version,
  catalog,
  lotCode = "",
  netGrams: initialNetGrams,
  waterName,
  showCommonNames,
  onClose,
  onOrderChange,
}: {
  version: FormulaVersion;
  catalog: Pick<Ingredient, "id" | "name" | "inciName">[];
  lotCode?: string;
  netGrams?: number;
  waterName: WaterInciName;
  showCommonNames: boolean;
  onClose: () => void;
  onOrderChange?: (order: string[]) => void;
}) {
  const [water, setWater] = useState<WaterInciName>(waterName);
  const [commons, setCommons] = useState(showCommonNames);
  const [unit, setUnit] = useState<"g" | "oz">("g");
  const [netGrams, setNetGrams] = useState(initialNetGrams && initialNetGrams > 0 ? initialNetGrams : 0);
  const [lot, setLot] = useState(lotCode);
  const shownWeight = unit === "oz" ? round(gramsToOz(netGrams), 2) : round(netGrams, 2);
  const [copied, setCopied] = useState(false);
  const seedItems = useMemo(
    () => buildInciItems(version, catalog, { waterName: water, showCommonNames: false }),
    [catalog, version, water],
  );
  const [order, setOrder] = useState(() => {
    const below = seedItems.filter((item) => item.below).map((item) => item.key);
    const saved = version.inciMinorOrder.filter((key) => below.includes(key));
    return [...saved, ...below.filter((key) => !saved.includes(key))];
  });
  const items = useMemo(
    () => buildInciItems(version, catalog, { waterName: water, showCommonNames: commons, minorOrder: order }),
    [catalog, commons, order, version, water],
  );
  const below = items.filter((item) => item.below);
  const text = inciLabelText({
    productName: version.name,
    items,
    waterName: water,
    showCommonNames: commons,
    netWeight: shownWeight,
    netUnit: unit,
    lotCode: lot,
  });

  function reorder(next: string[]) {
    setOrder(next);
    onOrderChange?.(next);
  }

  return (
    <Modal title="INCI label" onClose={onClose} wide testId="inci-dialog">
      <div className="no-print stack">
        <p className="finding info">{inciExportRule().message}</p>
        <div className="fields cols-3">
          <label className="field">
            <span>Water name</span>
            <select value={water} onChange={(event) => setWater(event.target.value as WaterInciName)}>
              <option value="Aqua">Aqua</option>
              <option value="Water (Aqua)">Water (Aqua)</option>
            </select>
          </label>
          <label className="field">
            <span>Net weight</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={shownWeight}
              onChange={(event) => {
                const next = Number(event.target.value) || 0;
                setNetGrams(unit === "oz" ? next * GRAMS_PER_OZ : next);
              }}
            />
          </label>
          <label className="field">
            <span>Unit</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value as "g" | "oz")}>
              <option value="g">g</option>
              <option value="oz">oz</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Batch lot code</span>
          <input value={lot} onChange={(event) => setLot(event.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={commons} onChange={(event) => setCommons(event.target.checked)} />
          <span>Add common-name parentheses when the INCI line does not already include them</span>
        </label>
        {below.length > 0 ? (
          <div className="stack">
            <h3>Below 1% — drag or move</h3>
            {below.map((item) => (
              <div
                key={item.key}
                className="order-item"
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.key)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = event.dataTransfer.getData("text/plain");
                  const next = [...order];
                  const fromIndex = next.indexOf(from);
                  const toIndex = next.indexOf(item.key);
                  if (fromIndex < 0 || toIndex < 0) return;
                  next.splice(fromIndex, 1);
                  next.splice(toIndex, 0, from);
                  reorder(next);
                }}
              >
                <span>{formatInciList([item], { waterName: water, showCommonNames: commons })}</span>
                <span className="cluster">
                  <button className="btn ghost" type="button" onClick={() => reorder(moveMinorOrder(order, item.key, -1))}>
                    Up
                  </button>
                  <button className="btn ghost" type="button" onClick={() => reorder(moveMinorOrder(order, item.key, 1))}>
                    Down
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="cluster">
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              const ok = await copyText(text);
              setCopied(ok);
            }}
          >
            {copied ? "Copied" : "Copy label"}
          </button>
          <button className="btn ghost" type="button" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      <article className="inci-sheet">
        <h2>{version.name}</h2>
        <p>
          Net wt. {shownWeight} {unit}
        </p>
        {lot ? <p>Lot {lot}</p> : null}
        <p>
          <strong>Ingredients: </strong>
          {formatInciList(items, { waterName: water, showCommonNames: commons })}
        </p>
        <p>Confirm the batch IFRA certificate and applicable labeling rules before selling.</p>
      </article>
    </Modal>
  );
}

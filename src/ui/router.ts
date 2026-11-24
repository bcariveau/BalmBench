import { useEffect, useState } from "react";

export type TabName = "recipes" | "batch" | "inventory" | "costing" | "trace";
export type InventorySegment = "raw" | "containers" | "finished" | "catalog";

export interface Route {
  tab: TabName;
  formulaId?: string;
  segment: InventorySegment;
  traceKind?: "batch" | "ingredient" | "container";
  traceId?: string;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  const [tab, a, b] = parts;
  const segment: InventorySegment = a === "containers" || a === "finished" || a === "catalog" ? a : "raw";
  if (tab === "batch") return { tab, segment: "raw" };
  if (tab === "inventory") return { tab, segment };
  if (tab === "costing") return { tab: "costing", segment: "raw" };
  if (tab === "trace") {
    const kind = a === "batch" || a === "ingredient" || a === "container" ? a : undefined;
    return { tab, segment: "raw", traceKind: kind, traceId: b ? decodeURIComponent(b) : undefined };
  }
  return { tab: "recipes", formulaId: a ? decodeURIComponent(a) : undefined, segment: "raw" };
}

export function navigate(path: string) {
  const next = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash || "#/recipes");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/recipes");
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) window.location.replace("#/recipes");
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return parseHash(hash);
}

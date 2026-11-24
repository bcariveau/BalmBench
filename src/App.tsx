import { useEffect, useState, type ReactElement } from "react";
import { buildBundle, summarizeBundle } from "./domain/gist";
import { todayISO } from "./domain/format";
import { useStore } from "./state/Store";
import { downloadJson, IconBeaker, IconBook, IconBoxes, IconCloud, IconGear, IconMoon, IconSearch, IconSun, IconTag } from "./ui/bits";
import { useRoute, type TabName } from "./ui/router";
import { SettingsPanel } from "./ui/SettingsPanel";
import { BatchView } from "./views/BatchView";
import { CostingView } from "./views/CostingView";
import { InventoryView } from "./views/InventoryView";
import { RecipesView } from "./views/RecipesView";
import { TraceView } from "./views/TraceView";

const TABS: { id: TabName; label: string; icon: () => ReactElement }[] = [
  { id: "recipes", label: "Recipes", icon: IconBook },
  { id: "batch", label: "Batch", icon: IconBeaker },
  { id: "inventory", label: "Inventory", icon: IconBoxes },
  { id: "costing", label: "Costing", icon: IconTag },
  { id: "trace", label: "Trace", icon: IconSearch },
];

export function App() {
  const route = useRoute();
  const { state, patchSettings, sync } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const titles: Record<TabName, string> = {
      recipes: "Recipes",
      batch: "Batch",
      inventory: "Inventory",
      costing: "Costing",
      trace: "Trace",
    };
    document.title = `BalmBench · ${titles[route.tab]}`;
  }, [route.tab]);

  return (
    <div className="app" data-testid="app-root">
      <header className="header no-print">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <strong>BalmBench</strong>
        </div>
        <div className="header-actions">
          <button className="pill" type="button" data-status={sync.status} aria-label={syncLabel(sync.status)} onClick={() => setSettingsOpen(true)}>
            <IconCloud />
            <span className="pill-text">{syncLabel(sync.status)}</span>
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label={state.settings.theme === "dark" ? "Use light mode" : "Use dark mode"}
            onClick={() => patchSettings({ theme: state.settings.theme === "dark" ? "light" : "dark" }, true)}
          >
            {state.settings.theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <button className="icon-btn" type="button" aria-label="Settings" data-testid="settings-button" onClick={() => setSettingsOpen(true)}>
            <IconGear />
          </button>
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar no-print">
          <nav aria-label="Primary">
            {TABS.map((tab) => (
              <a key={tab.id} className="side-link" href={`#/${tab.id}`} aria-current={route.tab === tab.id ? "page" : undefined}>
                <tab.icon />
                {tab.label}
              </a>
            ))}
          </nav>
          <div className="side-spacer" />
          <button className="side-link" type="button" onClick={() => setSettingsOpen(true)}>
            <IconGear /> Settings
          </button>
        </aside>
        <main>
          {route.tab === "recipes" ? <RecipesView formulaId={route.formulaId} /> : null}
          {route.tab === "batch" ? <BatchView /> : null}
          {route.tab === "inventory" ? <InventoryView segment={route.segment} /> : null}
          {route.tab === "costing" ? <CostingView /> : null}
          {route.tab === "trace" ? <TraceView kind={route.traceKind} id={route.traceId} /> : null}
        </main>
      </div>
      <nav className="tabbar no-print" aria-label="Primary">
        {TABS.map((tab) => (
          <a key={tab.id} className="tab" href={`#/${tab.id}`} aria-current={route.tab === tab.id ? "page" : undefined} data-testid={`tab-${tab.id}`}>
            <tab.icon />
            {tab.label}
          </a>
        ))}
      </nav>
      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
      {sync.conflict ? (
        <div className="modal-back" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Sync conflict" data-testid="conflict-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <h2>Sync conflict</h2>
            </header>
            <div className="modal-body stack">
              <p>This device and the private Gist both changed since the last sync. Nothing was overwritten.</p>
              <p>This device: {sync.conflict.localUpdatedAt}</p>
              <Summary summary={sync.conflict.localSummary} />
              <p>Cloud: {sync.conflict.remoteUpdatedAt}</p>
              <Summary summary={sync.conflict.remoteSummary} />
              <div className="cluster">
                <button className="btn primary" type="button" onClick={() => void sync.keepLocal()}>
                  Keep local
                </button>
                <button className="btn" type="button" onClick={sync.keepCloud}>
                  Keep cloud
                </button>
                <button className="btn ghost" type="button" onClick={() => downloadJson(`balmbench-local-${todayISO()}.json`, buildBundle(state))}>
                  Download local backup
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ summary }: { summary: ReturnType<typeof summarizeBundle> }) {
  return (
    <p className="muted">
      {summary.formulas} formulas · {summary.versions} versions · {summary.ingredients} ingredients · {summary.ingredientLots} raw lots · {summary.containerLots} container lots · {summary.batches} batches
    </p>
  );
}

function syncLabel(status: string) {
  if (status === "synced") return "Synced";
  if (status === "syncing") return "Syncing";
  if (status === "offline") return "Offline";
  if (status === "error") return "Sync issue";
  if (status === "conflict") return "Conflict";
  return "On this device";
}

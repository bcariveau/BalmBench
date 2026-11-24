import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { StoreProvider } from "./state/Store";
import { STORAGE_KEY } from "./domain/seed";
import "./styles.css";

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  const theme = saved ? (JSON.parse(saved) as { settings?: { theme?: string } }).settings?.theme : undefined;
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
} catch {
  /* Keep the default light theme if stored data cannot be read. */
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

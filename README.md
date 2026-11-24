# BalmBench

BalmBench is a bench-side app for natural lip balm and body lotion: formulas and version history, safety guardrails, batch making, inventory, costing, and lot traceability.

Live app: [https://bcariveau.github.io/BalmBench/](https://bcariveau.github.io/BalmBench/)

It is a static Vite + React + TypeScript app. Data stays in this browser until you connect a private GitHub Gist. You can install it on Android Chrome and keep working offline.

## Local development

```bash
npm ci
npm run dev
```

Other checks:

```bash
npm test
npx tsc --noEmit
npm run build
npm run preview
```

The dev server uses `/`. Production and `vite preview` use `/BalmBench/`, which is the GitHub Pages path.

## GitHub Pages

Pushes to `main` run `.github/workflows/deploy.yml`. In the repository settings, set Pages → Build and deployment → Source to **GitHub Actions**.

## Cloud sync

Settings → Cloud sync uses a **classic** GitHub personal access token with the `gist` scope. Fine-grained tokens cannot access Gists.

1. Open GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).
2. Generate a new classic token and enable only the `gist` scope.
3. Paste it into BalmBench. It stays in this browser and is sent only to `https://api.github.com`.

On connect, BalmBench looks through your Gists for a private one named BalmBench or containing `balmbench-data.json`. If none exists, it creates one. A second device only needs the same token. If both sides changed, the app asks you to keep local, keep cloud, or download a backup instead of overwriting either copy.

Export JSON, import JSON, and Reset to starter seed are in the same settings panel. The starter catalog was verified on 2026-11-23.

---
name: Recharts in Vite monorepo
description: Expected behavior when adding recharts to a Vite workspace package
---

When `recharts` is first imported in a Vite app in this monorepo, Vite's dependency pre-bundler will:
1. Log "✨ new dependencies optimized: recharts"
2. Log "✨ optimized dependencies changed. reloading"
3. Trigger a full page reload

This is normal and expected — NOT a bug. After the first reload, subsequent hot reloads work normally.

**Why:** Vite pre-bundles CJS dependencies on first use. Recharts is a large CJS package that Vite converts to ESM. This one-time cost happens only in development.

**How to apply:** Do not attempt to fix this "reload" — it is the correct behavior. The app will be fully functional after the reload completes.

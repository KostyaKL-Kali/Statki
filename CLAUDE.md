# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server at http://localhost:5173
npm run build     # type-check + production build (tsc -b && vite build)
npm run lint      # ESLint
npm run preview   # preview production build locally
```

No test runner is configured yet.

## Stack

- **Vite 8** + **React 19** + **TypeScript 6**
- **Tailwind CSS v4** — integrated via `@tailwindcss/vite` plugin (no `tailwind.config.*` file). CSS entry point is `src/index.css` with a single `@import "tailwindcss"` line.
- **Supabase JS v2** — installed, not yet wired up. Import via `import { createClient } from '@supabase/supabase-js'`.

## Architecture

The project is a blank slate — only `src/App.tsx` and `src/main.tsx` exist. The intended product is a two-player multiplayer browser game ("Statki" = Battleship in Polish). Real-time multiplayer will be built on top of Supabase (Realtime channels or Postgres).

## Conventions

- Components go in `src/components/`
- Game state goes in `src/store/`
- Variable and file names in English; comments in Polish
- Do not install new UI libraries without asking the user first

## Tailwind v4 notes

Tailwind v4 has no config file by default. Custom theme tokens go inside `src/index.css` using `@theme { … }` blocks, not in a JS config. Utility classes work as usual.

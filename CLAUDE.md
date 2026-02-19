# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Consentify is a minimal, headless cookie consent management SDK. It's a TypeScript monorepo with zero runtime dependencies, designed for SSR-safe usage in modern web frameworks.

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Build core only
pnpm -w --filter @consentify/core build

# Type-check core (and react transitively)
pnpm -w --filter @consentify/core check

# Run tests (vitest + happy-dom)
pnpm test
```

## Publishing

CI publishes on tags matching `core-v*`:
```bash
pnpm changeset           # Create changeset
pnpm changeset version   # Version packages
git tag core-v1.0.0 && git push origin core-v1.0.0  # Trigger release
```

## Git & GitHub

- Repo lives at `consentify/consentify` (transferred from `RomanDenysov/consentify`)
- Remote SSH alias: `git@github.com-personal:consentify/consentify.git`
- **main is branch-protected** — all changes require a PR, no direct push
- After squash-merging a local branch: `git fetch && git reset --hard origin/main` (not `git pull` — branches diverge)
- `gh pr create` targets `consentify/consentify` automatically via remote

## Architecture

### Core Package (`packages/core`)

Single-file SDK (`src/index.ts`) built around `createConsentify()` factory that returns separate `client` and `server` APIs:

- **Server API**: Reads/writes consent via raw `Cookie` headers (Node.js compatible)
- **Client API**: Browser-side storage with React `useSyncExternalStore` support via `subscribe()` and `getServerSnapshot()`

Key design patterns:
- Policy versioning via hash - consent invalidates when categories change
- `'necessary'` category is always `true` and cannot be disabled
- Storage abstraction supports cookie (canonical) and localStorage (optional mirror)
- State uses discriminated union: `{ decision: 'unset' }` | `{ decision: 'decided', snapshot }`

### Internal utilities
- `fnv1a()` / `stableStringify()` - deterministic policy hashing
- `readCookie()` / `writeCookie()` - isomorphic cookie handling
- Listener pattern for React reactivity (`listeners` Set, `syncState`, `notifyListeners`)

### SSR Safety

- `isBrowser()` (defined in `src/index.ts`) checks both `window` and `document` — use it for browser-only init
- `typeof BroadcastChannel !== 'undefined'` is **not** sufficient alone — Node.js 18+ exposes it natively; always pair with `isBrowser()`
- Server API is cookie-header only; `client.*` methods are browser-only

### Testing

- Single test file: `packages/core/src/index.test.ts`
- Mock browser globals with `vi.stubGlobal` / `vi.unstubAllGlobals()` in `afterEach`
- Design docs: `docs/plans/YYYY-MM-DD-<topic>-design.md`

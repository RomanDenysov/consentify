## @consentify/core

Headless cookie consent SDK — zero-deps, TypeScript-first, SSR-safe. Stores a compact snapshot in a cookie and provides a minimal, strongly-typed API.

### Install

```bash
npm install @consentify/core
```

### Quick start

```ts
import { createConsentify, defaultCategories } from '@consentify/core';

const manager = createConsentify({
  policy: {
    // Prefer to set a stable identifier derived from your policy document/version.
    // If omitted, a deterministic hash of categories is used.
    identifier: 'policy-v1',
    categories: defaultCategories,
  },
  cookie: {
    name: 'consentify',
    path: '/',
    sameSite: 'Lax',
    secure: true,
  },
  // Cookie is canonical. Optionally mirror to localStorage for fast client reads.
  // storage: ['localStorage', 'cookie']
});

// Ask user... then set decisions
manager.client.set({ analytics: true });

// Query on client
const canAnalytics = manager.client.get('analytics'); // boolean
const state = manager.client.get(); // { decision: 'decided' | 'unset', snapshot? }
```

### SSR usage

Use the server API with a raw Cookie header. It never touches the DOM.

```ts
// Read consent on the server
const state = manager.server.get(request.headers.get('cookie'));
const canAnalytics = state.decision === 'decided' && !!state.snapshot.choices.analytics;

// Write consent on the server (e.g., after a POST to your consent endpoint)
const setCookieHeader = manager.server.set({ analytics: true }, request.headers.get('cookie'));
// Then attach header:  res.setHeader('Set-Cookie', setCookieHeader)

// Clear consent cookie on the server
const clearCookieHeader = manager.server.clear();
```

### API

#### createConsentify(init)

Creates a consent manager bound to a `policy`. Cookie is the canonical store; you can optionally mirror to `localStorage` for client-side speed. Returns:

- `policy`: `{ categories: string[]; identifier: string }`
- `client`:
  - `get(): ConsentState<T>` — re-reads storage and returns `{ decision: 'decided', snapshot } | { decision: 'unset' }`.
  - `get(category: 'necessary' | T): boolean` — boolean check; `'necessary'` always returns `true`.
  - `set(choices: Partial<Choices<T>>): void` — merges and saves; writes only if changed.
  - `clear(): void` — removes stored consent (cookie and any mirror).
- `server`:
  - `get(cookieHeader: string | null | undefined): ConsentState<T>` — raw Cookie header in, state out.
  - `set(choices: Partial<Choices<T>>, currentCookieHeader?: string): string` — returns `Set-Cookie` header string.
  - `clear(): string` — returns `Set-Cookie` header string to delete the cookie.

Options (init):

- `policy`: `{ categories: readonly T[]; identifier?: string }`
  - `identifier` is recommended and should come from your actual policy version/content. If omitted, a deterministic hash of the categories is used.
- `cookie`:
  - `name?: string` (default: `consentify`)
  - `maxAgeSec?: number` (default: 1 year)
  - `sameSite?: 'Lax' | 'Strict' | 'None'` (default: `'Lax'`)
  - `secure?: boolean` (forced `true` when `sameSite==='None'`)
  - `path?: string` (default: `/`)
  - `domain?: string`
- `storage?: ('cookie' | 'localStorage')[]` (default: `['cookie']`)

Notes:

- `'necessary'` is always `true` and cannot be disabled.
- The snapshot is invalidated automatically when the policy identity changes (identifier/hash).

### Types

- `Policy<T>` — `{ identifier?: string; categories: readonly T[] }`.
- `Snapshot<T>` — `{ policy: string; givenAt: string; choices: Record<'necessary'|T, boolean> }`.
- `Choices<T>` — map of consent by category plus `'necessary'`.
- `ConsentState<T>` — `{ decision: 'decided', snapshot } | { decision: 'unset' }`.
- `defaultCategories`/`DefaultCategory` — reusable defaults.

### Example: custom categories

```ts
type Cat = 'analytics' | 'ads' | 'functional';
const manager = createConsentify({
  policy: { categories: ['analytics','ads','functional'] as const, identifier: 'policy-v1' },
});

manager.client.set({ analytics: true, ads: false });
if (manager.client.get('analytics')) {
  // load analytics
}
```

### Support

If you find this library useful, consider supporting its development:

- ⭐ [GitHub Sponsors](https://github.com/sponsors/RomanDenysov)
- ☕ [Ko-fi](https://ko-fi.com/romandenysov)

### License

MIT © 2025 [Roman Denysov](https://github.com/RomanDenysov)



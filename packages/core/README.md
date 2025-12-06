## @consentify/core

Headless cookie consent SDK — zero-deps, TypeScript-first, SSR-safe. Stores a compact snapshot in a cookie and provides a minimal, strongly-typed API.

### Install

```bash
npm install @consentify/core
```

### Quick start

```ts
import { createConsentify, defaultCategories } from '@consentify/core';

const consent = createConsentify({
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
consent.client.set({ analytics: true });

// Query on client
const canAnalytics = consent.client.get('analytics'); // boolean
const state = consent.client.get(); // { decision: 'decided' | 'unset', snapshot? }
```

### SSR usage

Use the server API with a raw Cookie header. It never touches the DOM.

```ts
// Read consent on the server
const state = consent.server.get(request.headers.get('cookie'));
const canAnalytics = state.decision === 'decided' && !!state.snapshot.choices.analytics;

// Write consent on the server (e.g., after a POST to your consent endpoint)
const setCookieHeader = consent.server.set({ analytics: true }, request.headers.get('cookie'));
// Then attach header:  res.setHeader('Set-Cookie', setCookieHeader)

// Clear consent cookie on the server
const clearCookieHeader = consent.server.clear();
```

### React integration

The client API is designed to work seamlessly with React 18+ `useSyncExternalStore`:

```tsx
import { useSyncExternalStore } from 'react';
import { createConsentify, defaultCategories, type ConsentState, type DefaultCategory } from '@consentify/core';

// Create once at module level
const consent = createConsentify({
  policy: { categories: defaultCategories, identifier: 'policy-v1' },
});

// Custom hook for React
function useConsent(): ConsentState<DefaultCategory> {
  return useSyncExternalStore(
    consent.client.subscribe,
    consent.client.get,
    consent.client.getServerSnapshot
  );
}

// Usage in components
function ConsentBanner() {
  const state = useConsent();

  if (state.decision === 'decided') return null;

  return (
    <div>
      <p>We use cookies to improve your experience.</p>
      <button onClick={() => consent.client.set({ analytics: true, marketing: true })}>
        Accept All
      </button>
      <button onClick={() => consent.client.set({ analytics: false, marketing: false })}>
        Reject Optional
      </button>
    </div>
  );
}
```

### API

#### createConsentify(init)

Creates a consent manager bound to a `policy`. Cookie is the canonical store; you can optionally mirror to `localStorage` for client-side speed. Returns:

- `policy`: `{ categories: string[]; identifier: string }`
- `client`:
  - `get(): ConsentState<T>` — returns cached consent state `{ decision: 'decided', snapshot } | { decision: 'unset' }`.
  - `get(category: 'necessary' | T): boolean` — boolean check; `'necessary'` always returns `true`.
  - `set(choices: Partial<Choices<T>>): void` — merges and saves; writes only if changed; notifies subscribers.
  - `clear(): void` — removes stored consent (cookie and any mirror); notifies subscribers.
  - `subscribe(callback: () => void): () => void` — subscribe to state changes (for React `useSyncExternalStore`).
  - `getServerSnapshot(): ConsentState<T>` — returns `{ decision: 'unset' }` for SSR hydration.
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
- Client state is cached and subscribers are notified on changes for optimal React performance.

### Types

- `Policy<T>` — `{ identifier?: string; categories: readonly T[] }`.
- `Snapshot<T>` — `{ policy: string; givenAt: string; choices: Record<'necessary'|T, boolean> }`.
- `Choices<T>` — map of consent by category plus `'necessary'`.
- `ConsentState<T>` — `{ decision: 'decided', snapshot } | { decision: 'unset' }`.
- `defaultCategories`/`DefaultCategory` — reusable defaults.
- `StorageKind` — `'cookie' | 'localStorage'`.

### Example: custom categories

```ts
type Cat = 'analytics' | 'ads' | 'functional';
const consent = createConsentify({
  policy: { categories: ['analytics', 'ads', 'functional'] as const, identifier: 'policy-v1' },
});

consent.client.set({ analytics: true, ads: false });
if (consent.client.get('analytics')) {
  // load analytics
}
```

### Example: Next.js App Router

```tsx
// lib/consent.ts
import { createConsentify, defaultCategories } from '@consentify/core';

export const consent = createConsentify({
  policy: { categories: defaultCategories, identifier: 'policy-v1' },
});

// app/layout.tsx (Server Component)
import { cookies } from 'next/headers';
import { consent } from '@/lib/consent';

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const state = consent.server.get(cookieStore.toString());
  const canLoadAnalytics = state.decision === 'decided' && state.snapshot.choices.analytics;

  return (
    <html>
      <body>
        {children}
        {canLoadAnalytics && <AnalyticsScript />}
      </body>
    </html>
  );
}
```

### Support

If you find this library useful, consider supporting its development:

- ⭐ [GitHub Sponsors](https://github.com/sponsors/RomanDenysov)
- ☕ [Ko-fi](https://ko-fi.com/romandenysov)

### License

MIT © 2025 [Roman Denysov](https://github.com/RomanDenysov)

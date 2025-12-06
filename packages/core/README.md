# @consentify/core

[![npm version](https://img.shields.io/npm/v/@consentify/core.svg)](https://www.npmjs.com/package/@consentify/core)
[![npm downloads](https://img.shields.io/npm/dm/@consentify/core.svg)](https://www.npmjs.com/package/@consentify/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@consentify/core)](https://bundlephobia.com/package/@consentify/core)
[![license](https://img.shields.io/npm/l/@consentify/core.svg)](./LICENSE)

> Headless cookie consent SDK — zero dependencies, TypeScript-first, SSR-ready.

## Why Consentify?

- **🪶 Lightweight** — Zero runtime dependencies, ~2KB minified + gzipped
- **🔒 Type-safe** — Full TypeScript support with inference for your categories
- **⚡ SSR-ready** — Separate server/client APIs that never touch the DOM on server
- **⚛️ React-native** — Built-in `useSyncExternalStore` support for React 18+
- **🎯 Headless** — Bring your own UI, we handle the state
- **📋 Compliant** — Built for GDPR, CCPA, and similar regulations

## Install

```bash
npm install @consentify/core
# or
pnpm add @consentify/core
# or
yarn add @consentify/core
```

## Quick Start

```ts
import { createConsentify, defaultCategories } from '@consentify/core';

const consent = createConsentify({
  policy: {
    identifier: 'v1.0',
    categories: defaultCategories, // ['preferences', 'analytics', 'marketing', 'functional', 'unclassified']
  },
});

// Set user choices
consent.client.set({ analytics: true, marketing: false });

// Check consent
if (consent.client.get('analytics')) {
  loadAnalytics();
}

// Get full state
const state = consent.client.get();
// → { decision: 'decided', snapshot: { policy: '...', givenAt: '...', choices: {...} } }
// → { decision: 'unset' } (if no consent given yet)
```

## React Integration

Works seamlessly with React 18+ using `useSyncExternalStore`:

```tsx
import { useSyncExternalStore } from 'react';
import { createConsentify, defaultCategories } from '@consentify/core';

// Create once at module level
export const consent = createConsentify({
  policy: { identifier: 'v1.0', categories: defaultCategories },
});

// Custom hook
export function useConsent() {
  return useSyncExternalStore(
    consent.client.subscribe,
    consent.client.get,
    consent.client.getServerSnapshot
  );
}

// Component
function CookieBanner() {
  const state = useConsent();

  if (state.decision === 'decided') return null;

  return (
    <div className="cookie-banner">
      <p>We use cookies to enhance your experience.</p>
      <button onClick={() => consent.client.set({ 
        analytics: true, 
        marketing: true,
        preferences: true 
      })}>
        Accept All
      </button>
      <button onClick={() => consent.client.set({ 
        analytics: false, 
        marketing: false,
        preferences: false 
      })}>
        Essential Only
      </button>
    </div>
  );
}
```

## Server-Side Usage

The server API works with raw `Cookie` headers — perfect for Next.js, Remix, or any Node.js framework:

```ts
// Read consent from request
const state = consent.server.get(request.headers.get('cookie'));

if (state.decision === 'decided' && state.snapshot.choices.analytics) {
  // User consented to analytics
}

// Set consent (returns Set-Cookie header string)
const setCookieHeader = consent.server.set(
  { analytics: true },
  request.headers.get('cookie')
);
response.headers.set('Set-Cookie', setCookieHeader);

// Clear consent
const clearHeader = consent.server.clear();
```

### Next.js App Router Example

```tsx
// lib/consent.ts
import { createConsentify, defaultCategories } from '@consentify/core';

export const consent = createConsentify({
  policy: { identifier: 'v1.0', categories: defaultCategories },
});

// app/layout.tsx
import { cookies } from 'next/headers';
import { consent } from '@/lib/consent';

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const state = consent.server.get(cookieStore.toString());
  
  return (
    <html>
      <body>
        {children}
        {state.decision === 'decided' && state.snapshot.choices.analytics && (
          <Analytics />
        )}
      </body>
    </html>
  );
}
```

## Custom Categories

Define your own consent categories with full type safety:

```ts
const consent = createConsentify({
  policy: {
    identifier: 'v1.0',
    categories: ['analytics', 'ads', 'personalization'] as const,
  },
});

// TypeScript knows your categories!
consent.client.set({ analytics: true, ads: false });
consent.client.get('personalization'); // ✓ valid
consent.client.get('unknown');         // ✗ type error
```

## Configuration

```ts
createConsentify({
  policy: {
    identifier: 'v1.0',           // Recommended: version your policy
    categories: defaultCategories,
  },
  cookie: {
    name: 'consent',              // Default: 'consentify'
    maxAgeSec: 60 * 60 * 24 * 365, // Default: 1 year
    sameSite: 'Lax',              // 'Lax' | 'Strict' | 'None'
    secure: true,                 // Forced true when sameSite='None'
    path: '/',
    domain: '.example.com',       // Optional: for cross-subdomain
  },
  storage: ['cookie'],            // ['cookie'] | ['localStorage', 'cookie']
});
```

## API Reference

### `createConsentify(options)`

Returns an object with `policy`, `client`, and `server` properties.

#### `client` (browser)

| Method | Description |
|--------|-------------|
| `get()` | Returns `ConsentState` — `{ decision: 'decided', snapshot }` or `{ decision: 'unset' }` |
| `get(category)` | Returns `boolean` — `true` if category is consented (`'necessary'` always returns `true`) |
| `set(choices)` | Merges choices and persists; notifies subscribers if changed |
| `clear()` | Removes stored consent; notifies subscribers |
| `subscribe(cb)` | Subscribe to changes; returns unsubscribe function |
| `getServerSnapshot()` | Returns `{ decision: 'unset' }` for SSR hydration |

#### `server` (Node.js)

| Method | Description |
|--------|-------------|
| `get(cookieHeader)` | Parse consent from `Cookie` header string |
| `set(choices, cookieHeader?)` | Returns `Set-Cookie` header string |
| `clear()` | Returns `Set-Cookie` header string to delete cookie |

### Types

```ts
type ConsentState<T> = 
  | { decision: 'unset' }
  | { decision: 'decided'; snapshot: Snapshot<T> };

interface Snapshot<T> {
  policy: string;      // Policy identifier/hash
  givenAt: string;     // ISO timestamp
  choices: Choices<T>; // { necessary: true, ...categories }
}

type Choices<T> = Record<'necessary' | T, boolean>;
```

### Default Categories

```ts
const defaultCategories = [
  'preferences',   // User preferences (language, theme)
  'analytics',     // Analytics and performance
  'marketing',     // Advertising and marketing
  'functional',    // Enhanced functionality
  'unclassified',  // Uncategorized cookies
] as const;
```

## How It Works

1. **Policy versioning** — Consent is tied to a policy identifier. When you update your policy (change `identifier`), previous consent is invalidated.

2. **Necessary cookies** — The `'necessary'` category is always `true` and cannot be disabled.

3. **Storage** — Cookie is the canonical store (works on server). Optionally mirror to `localStorage` for faster client reads.

4. **Compact format** — Consent is stored as a URL-encoded JSON snapshot in a single cookie.

## Support

If you find this library useful:

- ⭐ Star the repo on [GitHub](https://github.com/RomanDenysov/consentify)
- 💖 [Sponsor on GitHub](https://github.com/sponsors/RomanDenysov)
- ☕ [Buy me a coffee](https://ko-fi.com/romandenysov)

## License

MIT © 2025 [Roman Denysov](https://github.com/RomanDenysov)

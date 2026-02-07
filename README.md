# consentify

**Headless cookie consent that actually blocks scripts.**

[![npm version](https://img.shields.io/npm/v/@consentify/core.svg)](https://www.npmjs.com/package/@consentify/core)
[![tests](https://img.shields.io/badge/tests-48%20passing-brightgreen)](#)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@consentify/core)](https://bundlephobia.com/package/@consentify/core)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)
[![license](https://img.shields.io/npm/l/@consentify/core.svg)](https://github.com/RomanDenysov/consentify/blob/main/packages/core/LICENSE)

TypeScript-first, SSR-safe, zero-dependency consent management. Works on the server (Node.js headers), on the client (cookies/localStorage), and with React via `useSyncExternalStore` -- no Provider required.

## Quick Start

```bash
npm install @consentify/core
```

```ts
import { createConsentify } from '@consentify/core';

const consent = createConsentify({
  policy: { categories: ['analytics', 'marketing'] as const },
});

// Check consent (client-side)
consent.client.get('analytics'); // false — not yet granted

// User accepts analytics
consent.client.set({ analytics: true });

consent.client.get('analytics'); // true
```

## The Full Integration: Blocking Google Analytics Until Consent

This is what consent management is actually for -- preventing tracking scripts from loading until the user explicitly opts in. `guard()` handles the entire lifecycle: wait for consent, load the script, and optionally clean up if consent is revoked.

```ts
// lib/consent.ts
import { createConsentify } from '@consentify/core';

export const consent = createConsentify({
  policy: { categories: ['analytics', 'marketing'] as const },
  cookie: { name: 'consent', sameSite: 'Lax', secure: true },
  consentMaxAgeDays: 365,
});
```

```ts
// Load GA only when analytics consent is granted
consent.client.guard('analytics', () => {
  const s = document.createElement('script');
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX';
  s.async = true;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXX');
});
```

If the user has already consented, the script loads immediately. If not, `guard()` waits and fires once consent is granted -- no manual `subscribe()` wiring needed.

You can also handle revocation:

```ts
const dispose = consent.client.guard(
  'marketing',
  () => loadPixel(),      // runs when marketing consent is granted
  () => removePixel(),    // runs if consent is later revoked
);

// Stop watching entirely
dispose();
```

```ts
// Your cookie banner UI (framework-agnostic)
import { consent } from './lib/consent';

document.getElementById('accept-all')?.addEventListener('click', () => {
  consent.client.set({ analytics: true, marketing: true });
});

document.getElementById('reject-all')?.addEventListener('click', () => {
  consent.client.set({ analytics: false, marketing: false });
});

document.getElementById('reset')?.addEventListener('click', () => {
  consent.client.clear();
  window.location.reload();
});
```

## React Integration

```bash
npm install @consentify/core @consentify/react
```

```tsx
// lib/consent.ts
import { createConsentify } from '@consentify/core';

export const consent = createConsentify({
  policy: { categories: ['analytics', 'marketing'] as const },
});
```

```tsx
// components/CookieBanner.tsx
import { useConsentify } from '@consentify/react';
import { consent } from '../lib/consent';

export function CookieBanner() {
  const state = useConsentify(consent);

  if (state.decision === 'decided') return null;

  return (
    <div role="dialog" aria-label="Cookie consent">
      <p>We use cookies to improve your experience.</p>
      <button onClick={() => consent.client.set({ analytics: true, marketing: true })}>
        Accept All
      </button>
      <button onClick={() => consent.client.set({ analytics: false, marketing: false })}>
        Reject All
      </button>
    </div>
  );
}
```

```tsx
// components/Analytics.tsx — only render tracking when consented
import { useConsentify } from '@consentify/react';
import { consent } from '../lib/consent';

export function Analytics() {
  const state = useConsentify(consent);

  if (state.decision !== 'decided' || !state.snapshot.choices.analytics) {
    return null;
  }

  return <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX" />;
}
```

No Provider or Context needed. `useConsentify` is powered by `useSyncExternalStore` -- it subscribes directly to the consent instance and re-renders on changes.

## SSR / Next.js

Consentify is SSR-safe out of the box. The server API reads and writes consent via raw `Cookie` / `Set-Cookie` headers -- no DOM required.

```ts
// app/layout.tsx (Next.js App Router)
import { cookies } from 'next/headers';
import { consent } from '../lib/consent';
import { CookieBanner } from '../components/CookieBanner';
import { Analytics } from '../components/Analytics';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const state = consent.server.get(cookieStore.toString());

  return (
    <html>
      <body>
        {children}
        <CookieBanner />
        {state.decision === 'decided' && state.snapshot.choices.analytics && <Analytics />}
      </body>
    </html>
  );
}
```

```ts
// app/api/consent/route.ts — Server Action to set consent
import { NextResponse } from 'next/server';
import { consent } from '../../../lib/consent';

export async function POST(request: Request) {
  const { choices } = await request.json();
  const cookieHeader = request.headers.get('cookie');
  const setCookie = consent.server.set(choices, cookieHeader ?? undefined);

  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', setCookie);
  return res;
}
```

`client.getServerSnapshot()` always returns `{ decision: 'unset' }` during SSR, so hydration mismatches are impossible.

## API Reference

### `createConsentify(init)`

Returns `{ policy, server, client }`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `policy.categories` | `readonly string[]` | *required* | Consent categories (e.g., `['analytics', 'marketing']`) |
| `policy.identifier` | `string` | auto-hash | Stable policy version key. Changing it invalidates existing consent |
| `cookie.name` | `string` | `'consentify'` | Cookie name |
| `cookie.maxAgeSec` | `number` | `31536000` (1 year) | Cookie max-age in seconds |
| `cookie.sameSite` | `'Lax' \| 'Strict' \| 'None'` | `'Lax'` | SameSite attribute |
| `cookie.secure` | `boolean` | `true` | Secure flag (forced `true` when `sameSite: 'None'`) |
| `cookie.path` | `string` | `'/'` | Cookie path |
| `cookie.domain` | `string` | — | Cookie domain |
| `consentMaxAgeDays` | `number` | — | Auto-expire consent after N days |
| `storage` | `StorageKind[]` | `['cookie']` | Client storage priority (`'cookie'`, `'localStorage'`) |

### Server API

| Method | Signature | Description |
|--------|-----------|-------------|
| `server.get` | `(cookieHeader: string \| null \| undefined) => ConsentState<T>` | Read consent from a `Cookie` header |
| `server.set` | `(choices: Partial<Choices<T>>, currentCookieHeader?: string) => string` | Returns a `Set-Cookie` header string |
| `server.clear` | `() => string` | Returns a clearing `Set-Cookie` header |

### Client API

| Method | Signature | Description |
|--------|-----------|-------------|
| `client.get` | `() => ConsentState<T>` | Current consent state |
| `client.get` | `(category: string) => boolean` | Check a single category |
| `client.set` | `(choices: Partial<Choices<T>>) => void` | Update consent choices |
| `client.clear` | `() => void` | Clear all consent data |
| `client.guard` | `(category, onGrant, onRevoke?) => () => void` | Run code when consent is granted; optionally handle revocation. Returns a dispose function |
| `client.subscribe` | `(cb: () => void) => () => void` | Subscribe to changes (React-compatible) |
| `client.getServerSnapshot` | `() => ConsentState<T>` | Always returns `{ decision: 'unset' }` for SSR |

### `useConsentify(instance)` (React)

```ts
import { useConsentify } from '@consentify/react';

const state = useConsentify(consent);
// state: { decision: 'unset' } | { decision: 'decided', snapshot: Snapshot<T> }
```

### Policy Versioning

The `'necessary'` category is always `true` and cannot be disabled. When you change your `policy.categories` (or `policy.identifier`), all existing consent is automatically invalidated -- users will be prompted again.

## Packages

| Package | Description |
|---------|-------------|
| [@consentify/core](./packages/core) | Headless consent SDK -- TypeScript-first, SSR-safe, zero dependencies |
| [@consentify/react](./packages/react) | React hook for @consentify/core |

## Coming Soon: Consentify SaaS

A hosted consent management platform with a visual banner editor, analytics dashboard, and compliance reporting.

[consentify.dev](https://consentify.dev)

## Support

If you find this project useful, consider supporting its development:

- [GitHub Sponsors](https://github.com/sponsors/RomanDenysov)
- [Ko-fi](https://ko-fi.com/romandenysov)

## License

MIT &copy; 2025 [Roman Denysov](https://github.com/RomanDenysov)

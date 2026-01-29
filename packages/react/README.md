# @consentify/react

[![npm version](https://img.shields.io/npm/v/@consentify/react.svg)](https://www.npmjs.com/package/@consentify/react)
[![npm downloads](https://img.shields.io/npm/dm/@consentify/react.svg)](https://www.npmjs.com/package/@consentify/react)
[![license](https://img.shields.io/npm/l/@consentify/react.svg)](./LICENSE)

> React hook for [@consentify/core](https://www.npmjs.com/package/@consentify/core) — headless cookie consent SDK.

## Install

```bash
npm install @consentify/react
# or
pnpm add @consentify/react
# or
yarn add @consentify/react
```

## Usage

```tsx
import { createConsentify, defaultCategories, useConsentify } from '@consentify/react';

// Create once at module level
const consent = createConsentify({
  policy: { identifier: 'v1.0', categories: defaultCategories },
});

function CookieBanner() {
  const state = useConsentify(consent);

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

## API

### `useConsentify(instance)`

React hook that subscribes to consent state changes using `useSyncExternalStore`.

**Parameters:**
- `instance` — The object returned by `createConsentify()`

**Returns:** `ConsentState<T>`
- `{ decision: 'unset' }` — No consent given yet
- `{ decision: 'decided', snapshot }` — User has made a choice

### Re-exports

This package re-exports everything from `@consentify/core`:
- `createConsentify`
- `defaultCategories`
- All types (`ConsentState`, `Snapshot`, `Choices`, etc.)

## SSR Support

The hook uses `useSyncExternalStore` with a server snapshot that returns `{ decision: 'unset' }`, ensuring hydration works correctly in SSR frameworks like Next.js.

## License

MIT © 2025 [Roman Denysov](https://github.com/RomanDenysov)

# Multi-Tab Sync Design

**Date:** 2026-02-19
**Status:** Approved

## Problem

When a user grants or withdraws consent in one tab, other open tabs don't reflect the change. Guards and listeners in those tabs remain stale until the page reloads.

## Decision

Use `BroadcastChannel` — always-on, no config option.

## Approach: BroadcastChannel

A single `BroadcastChannel` instance keyed as `consentify:<cookieName>` is created inside `createConsentify()` on the browser. When `client.set()` or `client.clear()` write to storage, they post a signal to all other same-origin tabs. Receiving tabs call `syncState()` + `notifyListeners()`, triggering React re-renders and `guard()` callbacks.

```
Tab A: client.set()  →  writeClientRaw()  →  bc.postMessage(null)
Tab B:                                    ←  onmessage → syncState() + notifyListeners()
```

The payload is `null`. Storage remains the source of truth — Tab B re-reads from its own storage, keeping the sync path identical to a local update.

## Implementation

### `packages/core/src/index.ts`

1. After the `syncState()` init block, create the channel:

```ts
let bc: BroadcastChannel | null = null;
if (isBrowser() && typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(`consentify:${cookieName}`);
    bc.onmessage = () => { syncState(); notifyListeners(); };
}
```

2. In `client.set()`, after `notifyListeners()`:

```ts
bc?.postMessage(null);
```

3. In `client.clear()`, after `notifyListeners()`:

```ts
bc?.postMessage(null);
```

### `packages/core/src/index.test.ts`

New test block: `"multi-tab sync (BroadcastChannel)"` using happy-dom's native BroadcastChannel (v20+):

- Consent set in one instance notifies listeners in a second instance
- Clear in one instance notifies listeners in a second instance
- Receiving instance state is correct after sync
- Initiating instance does not double-fire

## Constraints

- SSR-safe: guarded by `typeof BroadcastChannel !== 'undefined'`
- No API surface changes — returned object is unchanged
- No `destroy()` needed — singleton usage, channel lifetime matches tab lifetime
- Browser support: Chrome 54+, Firefox 38+, Safari 15.4+, Edge 79+

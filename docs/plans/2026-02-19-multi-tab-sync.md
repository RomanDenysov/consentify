# Multi-Tab Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Propagate consent changes to all open tabs using `BroadcastChannel`.

**Architecture:** A `BroadcastChannel` keyed as `consentify:<cookieName>` is created on browser init inside `createConsentify()`. After any write (`client.set` / `client.clear`), a `null` signal is posted to other tabs. Receiving tabs call `syncState()` + `notifyListeners()` — storage remains the source of truth, the channel is just the notification mechanism.

**Tech Stack:** TypeScript, Vitest, happy-dom (via `vi.stubGlobal` for BroadcastChannel mocking)

---

### Task 1: Write failing tests for BroadcastChannel sync

**Files:**
- Modify: `packages/core/src/index.test.ts` (append at the end)

**Step 1: Add `MockBroadcastChannel` helper near the top of the test file, after the existing helpers (~line 37)**

```typescript
// --- MockBroadcastChannel for multi-tab sync tests ---
class MockBroadcastChannel {
    static channels = new Map<string, Set<MockBroadcastChannel>>();
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(public name: string) {
        if (!MockBroadcastChannel.channels.has(name)) {
            MockBroadcastChannel.channels.set(name, new Set());
        }
        MockBroadcastChannel.channels.get(name)!.add(this);
    }

    postMessage(data: unknown) {
        for (const ch of MockBroadcastChannel.channels.get(this.name) ?? []) {
            if (ch !== this) ch.onmessage?.(new MessageEvent('message', { data }));
        }
    }

    close() {
        MockBroadcastChannel.channels.get(this.name)?.delete(this);
    }
}
```

**Step 2: Add the test block at the end of the test file**

```typescript
// ============================================================
// 12. Multi-tab sync (BroadcastChannel)
// ============================================================
describe('multi-tab sync (BroadcastChannel)', () => {
    beforeEach(() => {
        clearAllCookies();
        MockBroadcastChannel.channels.clear();
        vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('set() in one instance notifies listeners in another', () => {
        const c1 = createConsentify({ policy: { categories: ['analytics'] as const } });
        const c2 = createConsentify({ policy: { categories: ['analytics'] as const } });
        const listener = vi.fn();
        c2.client.subscribe(listener);

        c1.client.set({ analytics: true });

        expect(listener).toHaveBeenCalled();
    });

    it('receiving instance has updated state after set()', () => {
        const c1 = createConsentify({ policy: { categories: ['analytics'] as const } });
        const c2 = createConsentify({ policy: { categories: ['analytics'] as const } });

        c1.client.set({ analytics: true });

        expect(c2.client.get('analytics')).toBe(true);
    });

    it('clear() in one instance notifies listeners in another', () => {
        const c1 = createConsentify({ policy: { categories: ['analytics'] as const } });
        const c2 = createConsentify({ policy: { categories: ['analytics'] as const } });
        c1.client.set({ analytics: true });
        const listener = vi.fn();
        c2.client.subscribe(listener);

        c1.client.clear();

        expect(listener).toHaveBeenCalled();
        expect(c2.client.get()).toEqual({ decision: 'unset' });
    });

    it('initiating instance does not double-fire its own listeners', () => {
        const c1 = createConsentify({ policy: { categories: ['analytics'] as const } });
        // second instance just to have a channel peer
        createConsentify({ policy: { categories: ['analytics'] as const } });
        const listener = vi.fn();
        c1.client.subscribe(listener);

        c1.client.set({ analytics: true });

        // Fires exactly once from the local notifyListeners(), not again from BroadcastChannel
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
```

**Step 3: Run tests to confirm they fail**

```bash
pnpm test
```

Expected: 4 new tests fail — `set() in one instance notifies...`, `receiving instance has updated state...`, `clear() in one instance...`, `initiating instance does not double-fire...`

---

### Task 2: Implement BroadcastChannel in core

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add channel creation after the browser sync-state init block (currently lines 297-299)**

Find this block:
```typescript
    // Init cache on browser
    if (isBrowser()) {
        syncState();
    }
```

Replace with:
```typescript
    // Init cache on browser
    if (isBrowser()) {
        syncState();
    }

    // Multi-tab sync — notify other tabs on any consent change
    let bc: BroadcastChannel | null = null;
    if (isBrowser() && typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(`consentify:${cookieName}`);
        bc.onmessage = () => { syncState(); notifyListeners(); };
    }
```

**Step 2: Add `bc?.postMessage(null)` in `client.set()` after `notifyListeners()`**

Find:
```typescript
        const changed = writeClientIfChanged(next);
        if (changed) {
            syncState();
            notifyListeners();
        }
```

Replace with:
```typescript
        const changed = writeClientIfChanged(next);
        if (changed) {
            syncState();
            notifyListeners();
            bc?.postMessage(null);
        }
```

**Step 3: Add `bc?.postMessage(null)` in `client.clear()` after `notifyListeners()`**

Find:
```typescript
        clear: () => {
            for (const k of new Set<StorageKind>([...storageOrder, 'cookie'])) clearStore(k);
            syncState();
            notifyListeners();
        },
```

Replace with:
```typescript
        clear: () => {
            for (const k of new Set<StorageKind>([...storageOrder, 'cookie'])) clearStore(k);
            syncState();
            notifyListeners();
            bc?.postMessage(null);
        },
```

**Step 4: Run all tests to confirm everything passes**

```bash
pnpm test
```

Expected: all tests pass including the 4 new multi-tab sync tests.

**Step 5: Type-check**

```bash
pnpm -w --filter @consentify/core check
```

Expected: no errors.

**Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "feat: sync consent across tabs via BroadcastChannel"
```

---

### Task 3: Push and open PR

**Step 1: Push and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: sync consent across tabs via BroadcastChannel" --body "$(cat <<'EOF'
## Summary
- Creates a \`BroadcastChannel\` keyed as \`consentify:<cookieName>\` on browser init
- Posts a signal after \`client.set()\` and \`client.clear()\`
- Other tabs receive the signal, re-read storage, and notify their listeners
- SSR-safe: guarded by \`typeof BroadcastChannel !== 'undefined'\`
- No API changes — purely internal
- 4 new tests covering set/clear/state/no-double-fire

## Test plan
- [ ] All existing tests still pass
- [ ] 4 new multi-tab sync tests pass
- [ ] TypeScript check passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 2: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
```

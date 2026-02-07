import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createConsentify, defaultCategories } from './index';

// --- Exported helper access (re-implement for testing since they're not exported) ---

function stableStringify(o: unknown): string {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return `[${o.map(stableStringify).join(',')}]`;
    const e = Object.entries(o as Record<string, unknown>).sort((a, b) => a[0].localeCompare(b[0]));
    return `{${e.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',')}}`;
}

function fnv1a(str: string): string {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
}

function hashPolicy(categories: readonly string[], identifier?: string): string {
    return fnv1a(stableStringify({ categories: [...categories].sort(), identifier: identifier ?? null }));
}

// Helper to encode a snapshot as document.cookie value
const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));

function setCookie(name: string, value: string) {
    document.cookie = `${name}=${value}; Path=/`;
}
function clearAllCookies() {
    document.cookie.split(';').forEach(c => {
        const name = c.split('=')[0].trim();
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
}

// ============================================================
// 1. Utility functions
// ============================================================
describe('stableStringify', () => {
    it('produces deterministic output regardless of key order', () => {
        expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    });
    it('handles nested objects', () => {
        expect(stableStringify({ z: { b: 1, a: 2 } })).toBe('{"z":{"a":2,"b":1}}');
    });
    it('handles arrays', () => {
        expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
    });
    it('handles null and primitives', () => {
        expect(stableStringify(null)).toBe('null');
        expect(stableStringify('hello')).toBe('"hello"');
        expect(stableStringify(42)).toBe('42');
    });
});

describe('fnv1a', () => {
    it('returns consistent 8-char hex string', () => {
        const h = fnv1a('test');
        expect(h).toMatch(/^[0-9a-f]{8}$/);
        expect(fnv1a('test')).toBe(h);
    });
    it('produces different hashes for different inputs', () => {
        expect(fnv1a('abc')).not.toBe(fnv1a('def'));
    });
});

describe('hashPolicy', () => {
    it('is stable across category order', () => {
        expect(hashPolicy(['a', 'b'])).toBe(hashPolicy(['b', 'a']));
    });
    it('changes when categories change', () => {
        expect(hashPolicy(['a'])).not.toBe(hashPolicy(['a', 'b']));
    });
    it('folds identifier into hash', () => {
        expect(hashPolicy(['a'], 'v1')).not.toBe(hashPolicy(['a']));
    });
});

// ============================================================
// 2. Cookie parsing
// ============================================================
describe('readCookie (via server.get)', () => {
    it('returns unset when no cookie', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        expect(c.server.get('')).toEqual({ decision: 'unset' });
    });
    it('returns unset for null/undefined', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        expect(c.server.get(null)).toEqual({ decision: 'unset' });
        expect(c.server.get(undefined)).toEqual({ decision: 'unset' });
    });
    it('parses cookie among multiple cookies', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: true },
        };
        const header = `other=foo; consentify=${enc(snapshot)}; another=bar`;
        const state = c.server.get(header);
        expect(state.decision).toBe('decided');
    });
});

describe('writeCookie (via client)', () => {
    beforeEach(clearAllCookies);
    it('writes to document.cookie via client.set()', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        c.client.set({ analytics: true });
        expect(document.cookie).toContain('consentify=');
    });
});

// ============================================================
// 3. Snapshot validation
// ============================================================
describe('isValidSnapshot (via server.get)', () => {
    const makeInstance = () => createConsentify({ policy: { categories: ['analytics'] } });

    it('accepts a valid snapshot', () => {
        const c = makeInstance();
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: false },
        };
        const header = `consentify=${enc(snapshot)}`;
        expect(c.server.get(header).decision).toBe('decided');
    });

    it('rejects missing fields', () => {
        const c = makeInstance();
        const bad = { policy: c.policy.identifier, choices: { necessary: true, analytics: false } };
        expect(c.server.get(`consentify=${enc(bad)}`).decision).toBe('unset');
    });

    it('rejects non-boolean choices', () => {
        const c = makeInstance();
        const bad = {
            policy: c.policy.identifier,
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: 'yes' },
        };
        expect(c.server.get(`consentify=${enc(bad)}`).decision).toBe('unset');
    });

    it('rejects invalid dates', () => {
        const c = makeInstance();
        const bad = {
            policy: c.policy.identifier,
            givenAt: 'not-a-date',
            choices: { necessary: true, analytics: false },
        };
        expect(c.server.get(`consentify=${enc(bad)}`).decision).toBe('unset');
    });

    it('rejects empty policy string', () => {
        const c = makeInstance();
        const bad = {
            policy: '',
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: false },
        };
        expect(c.server.get(`consentify=${enc(bad)}`).decision).toBe('unset');
    });
});

// ============================================================
// 4. createConsentify — server API
// ============================================================
describe('server API', () => {
    it('get() returns unset when no cookie', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        expect(c.server.get('')).toEqual({ decision: 'unset' });
    });

    it('get() returns decided with valid cookie', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: true },
        };
        const state = c.server.get(`consentify=${enc(snapshot)}`);
        expect(state.decision).toBe('decided');
        if (state.decision === 'decided') {
            expect(state.snapshot.choices.analytics).toBe(true);
        }
    });

    it('get() returns unset on policy mismatch', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        const snapshot = {
            policy: 'wrong-hash',
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: true },
        };
        expect(c.server.get(`consentify=${enc(snapshot)}`).decision).toBe('unset');
    });

    it('get() returns unset on expired consent', () => {
        const c = createConsentify({
            policy: { categories: ['analytics'] },
            consentMaxAgeDays: 1,
        });
        const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: oldDate,
            choices: { necessary: true, analytics: true },
        };
        expect(c.server.get(`consentify=${enc(snapshot)}`).decision).toBe('unset');
    });

    it('set() returns a Set-Cookie header string', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        const header = c.server.set({ analytics: true });
        expect(header).toContain('consentify=');
        expect(header).toContain('Path=/');
        expect(header).toContain('SameSite=Lax');
    });

    it('clear() returns a clearing header with Max-Age=0', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        const header = c.server.clear();
        expect(header).toContain('Max-Age=0');
        expect(header).toContain('consentify=;');
    });

    it('necessary is always true in server.set()', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        const header = c.server.set({ necessary: false } as any);
        // Parse out the cookie value from the header
        const val = header.split(';')[0].split('=').slice(1).join('=');
        const snapshot = JSON.parse(decodeURIComponent(val));
        expect(snapshot.choices.necessary).toBe(true);
    });
});

// ============================================================
// 5. createConsentify — client API
// ============================================================
describe('client API', () => {
    beforeEach(clearAllCookies);

    it('get() returns unset initially', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] } });
        expect(c.client.get()).toEqual({ decision: 'unset' });
    });

    it('get(category) returns boolean', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        expect(c.client.get('necessary')).toBe(true);
        expect(c.client.get('analytics')).toBe(false);
    });

    it('set() stores and reads back', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        c.client.set({ analytics: true });
        const state = c.client.get();
        expect(state.decision).toBe('decided');
        if (state.decision === 'decided') {
            expect(state.snapshot.choices.analytics).toBe(true);
            expect(state.snapshot.choices.necessary).toBe(true);
        }
    });

    it('set() race condition: sequential sets preserve both', () => {
        const c = createConsentify({ policy: { categories: ['analytics', 'marketing'] as const } });
        c.client.set({ analytics: true });
        c.client.set({ marketing: true });
        const state = c.client.get();
        expect(state.decision).toBe('decided');
        if (state.decision === 'decided') {
            expect(state.snapshot.choices.analytics).toBe(true);
            expect(state.snapshot.choices.marketing).toBe(true);
        }
    });

    it('clear() resets to unset', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        c.client.set({ analytics: true });
        expect(c.client.get().decision).toBe('decided');
        c.client.clear();
        expect(c.client.get()).toEqual({ decision: 'unset' });
    });

    it('subscribe() callback fired on set and clear', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const cb = vi.fn();
        const unsub = c.client.subscribe(cb);
        c.client.set({ analytics: true });
        expect(cb).toHaveBeenCalledTimes(1);
        c.client.clear();
        expect(cb).toHaveBeenCalledTimes(2);
        unsub();
        c.client.set({ analytics: false });
        expect(cb).toHaveBeenCalledTimes(2); // no more calls after unsub
    });

    it('subscribe() one error does not break other listeners', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const bad = vi.fn(() => { throw new Error('boom'); });
        const good = vi.fn();
        c.client.subscribe(bad);
        c.client.subscribe(good);
        c.client.set({ analytics: true });
        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
    });

    it('getServerSnapshot() always returns unset', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        c.client.set({ analytics: true });
        expect(c.client.getServerSnapshot()).toEqual({ decision: 'unset' });
    });
});

// ============================================================
// 6. Storage fallback
// ============================================================
describe('storage fallback', () => {
    beforeEach(clearAllCookies);

    it('localStorage primary with cookie mirror', () => {
        const c = createConsentify({
            policy: { categories: ['analytics'] as const },
            storage: ['localStorage', 'cookie'],
        });
        c.client.set({ analytics: true });
        // Should be in both localStorage and cookie
        expect(window.localStorage.getItem('consentify')).toBeTruthy();
        expect(document.cookie).toContain('consentify=');
    });

    it('localStorage failure falls back gracefully', () => {
        const orig = window.localStorage.setItem;
        // Simulate quota exceeded
        window.localStorage.setItem = () => { throw new DOMException('QuotaExceeded'); };
        const c = createConsentify({
            policy: { categories: ['analytics'] as const },
            storage: ['localStorage', 'cookie'],
        });
        // Should not throw
        expect(() => c.client.set({ analytics: true })).not.toThrow();
        // Cookie mirror should still work
        expect(document.cookie).toContain('consentify=');
        window.localStorage.setItem = orig;
    });
});

// ============================================================
// 7. Policy versioning
// ============================================================
describe('policy versioning', () => {
    beforeEach(clearAllCookies);

    it('changed categories invalidate consent', () => {
        const c1 = createConsentify({ policy: { categories: ['analytics'] as const } });
        c1.client.set({ analytics: true });
        // New instance with different categories
        const c2 = createConsentify({ policy: { categories: ['analytics', 'marketing'] as const } });
        expect(c2.client.get()).toEqual({ decision: 'unset' });
    });

    it('custom identifier works', () => {
        const c = createConsentify({
            policy: { categories: ['analytics'] as const, identifier: 'v2' },
        });
        expect(c.policy.identifier).toBe('v2');
    });
});

// ============================================================
// 8. Consent expiration
// ============================================================
describe('consent expiration', () => {
    beforeEach(clearAllCookies);

    it('fresh consent is valid', () => {
        const c = createConsentify({
            policy: { categories: ['analytics'] },
            consentMaxAgeDays: 365,
        });
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: new Date().toISOString(),
            choices: { necessary: true, analytics: true },
        };
        expect(c.server.get(`consentify=${enc(snapshot)}`).decision).toBe('decided');
    });

    it('old consent is expired', () => {
        const c = createConsentify({
            policy: { categories: ['analytics'] },
            consentMaxAgeDays: 30,
        });
        const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: oldDate,
            choices: { necessary: true, analytics: true },
        };
        expect(c.server.get(`consentify=${enc(snapshot)}`).decision).toBe('unset');
    });

    it('invalid date treated as expired', () => {
        const c = createConsentify({
            policy: { categories: ['analytics'] },
            consentMaxAgeDays: 365,
        });
        const snapshot = {
            policy: c.policy.identifier,
            givenAt: 'invalid-date',
            choices: { necessary: true, analytics: true },
        };
        // With hardened validation, invalid date is rejected by isValidSnapshot
        expect(c.server.get(`consentify=${enc(snapshot)}`).decision).toBe('unset');
    });
});

// ============================================================
// 9. client.guard()
// ============================================================
describe('client.guard()', () => {
    beforeEach(clearAllCookies);

    it('fires immediately when already consented', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        c.client.set({ analytics: true });
        const onGrant = vi.fn();
        c.client.guard('analytics', onGrant);
        expect(onGrant).toHaveBeenCalledTimes(1);
    });

    it('defers until consent is granted', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        c.client.guard('analytics', onGrant);
        expect(onGrant).not.toHaveBeenCalled();
        c.client.set({ analytics: true });
        expect(onGrant).toHaveBeenCalledTimes(1);
    });

    it('onRevoke fires when consent is withdrawn', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        const onRevoke = vi.fn();
        c.client.guard('analytics', onGrant, onRevoke);
        c.client.set({ analytics: true });
        expect(onGrant).toHaveBeenCalledTimes(1);
        c.client.set({ analytics: false });
        expect(onRevoke).toHaveBeenCalledTimes(1);
    });

    it('does not fire onGrant again after revoke', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        const onRevoke = vi.fn();
        c.client.guard('analytics', onGrant, onRevoke);
        c.client.set({ analytics: true });
        c.client.set({ analytics: false });
        c.client.set({ analytics: true });
        expect(onGrant).toHaveBeenCalledTimes(1);
        expect(onRevoke).toHaveBeenCalledTimes(1);
    });

    it('dispose cancels before grant', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        const dispose = c.client.guard('analytics', onGrant);
        dispose();
        c.client.set({ analytics: true });
        expect(onGrant).not.toHaveBeenCalled();
    });

    it('dispose cancels before revoke', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        const onRevoke = vi.fn();
        c.client.guard('analytics', onGrant, onRevoke);
        c.client.set({ analytics: true });
        const dispose = c.client.guard('analytics', vi.fn(), onRevoke);
        dispose();
        c.client.set({ analytics: false });
        // onRevoke from the first guard fires, but not the disposed one
        expect(onRevoke).toHaveBeenCalledTimes(1);
    });

    it('guard("necessary") fires immediately (always true)', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        c.client.guard('necessary', onGrant);
        expect(onGrant).toHaveBeenCalledTimes(1);
    });

    it('without onRevoke stops watching after grant', () => {
        const c = createConsentify({ policy: { categories: ['analytics'] as const } });
        const onGrant = vi.fn();
        c.client.guard('analytics', onGrant);
        c.client.set({ analytics: true });
        expect(onGrant).toHaveBeenCalledTimes(1);
        // Subsequent changes should not trigger anything
        c.client.set({ analytics: false });
        c.client.set({ analytics: true });
        expect(onGrant).toHaveBeenCalledTimes(1);
    });
});

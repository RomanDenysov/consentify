// --- Types (generic categories) ---
/**
 * Literal type for the non-optional category that is always enabled.
 */
export type Necessary = 'necessary';

/**
 * User-defined category identifier (e.g., 'analytics', 'marketing').
 */
export type UserCategory = string;

/**
 * Map of consent choices for all categories, including the 'necessary' category.
 * A value of `true` means the user granted consent for the category.
 */
export type Choices<T extends UserCategory> = Record<Necessary | T, boolean>;

/**
 * Describes a cookie policy and its consent categories.
 * @template T Category string union used by this policy.
 */
export interface Policy<T extends UserCategory> {
    /**
     * Optional stable identifier for your policy. Prefer supplying a value derived from
     * your actual policy content/version (e.g., a hash of the policy document).
     * If omitted, a deterministic hash of the provided categories (and this identifier when present)
     * will be used to key snapshots.
     */
    identifier?: string;
    categories: readonly T[];
}

/**
 * Immutable snapshot of a user's consent decision for a specific policy version.
 * @template T Category string union captured in the snapshot.
 */
export interface Snapshot<T extends UserCategory> {
    policy: string;
    givenAt: string;
    choices: Choices<T>;
}

/**
 * High-level consent state derived from the presence of a valid snapshot.
 * When no valid snapshot exists for the current policy version, the state is `unset`.
 */
export type ConsentState<T extends UserCategory> = 
| {decision: 'unset'}
| {decision: 'decided', snapshot: Snapshot<T>}

// Utility to turn a readonly string[] into a string union
type ArrToUnion<T extends readonly string[]> = T[number];

// Storage kinds: keep only widely used options for SSR apps
export type StorageKind = 'cookie' | 'localStorage';

export interface CreateConsentifyInit<Cs extends readonly string[]> {
    policy: { categories: Cs, identifier?: string };
    cookie?: {
        name?: string; maxAgeSec?: number; sameSite?: 'Lax'|'Strict'|'None';
        secure?: boolean; path?: string; domain?: string;
    };
    /**
     * Maximum age of consent in days. If set, consent older than this
     * will be treated as expired, requiring re-consent.
     */
    consentMaxAgeDays?: number;
    /**
     * Client-side storage priority. Server-side access is cookie-only.
     * Supported: 'cookie' (canonical), 'localStorage' (optional mirror for fast reads)
     * Default: ['cookie']
     */
    storage?: StorageKind[];
}

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
    // Deterministic identity for the policy. If you provide `identifier`, it is folded into the hash,
    // but consider using `identifier` itself as the canonical version key for clarity.
    return fnv1a(stableStringify({ categories: [...categories].sort(), identifier: identifier ?? null}));
}
// --- Internals ---
const DEFAULT_COOKIE = 'consentify';
const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
const dec = <T>(s: string) => { try { return JSON.parse(decodeURIComponent(s)) as T; } catch { return null; } };
const toISO = () => new Date().toISOString();

function isValidSnapshot<T extends UserCategory>(s: unknown): s is Snapshot<T> {
    return (
        typeof s === 'object' && s !== null &&
        typeof (s as any).policy === 'string' &&
        typeof (s as any).givenAt === 'string' &&
        typeof (s as any).choices === 'object' &&
        (s as any).choices !== null
    );
}

function readCookie(name: string, cookieStr?: string): string | null {
    const src = cookieStr ?? (typeof document !== 'undefined' ? document.cookie : '');
    if (!src) return null;
    const m = src.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
    return m ? m.slice(name.length + 1) : null;
}
function writeCookie(
    name: string, value: string,
    opt: { maxAgeSec: number; sameSite: 'Lax'|'Strict'|'None'; secure: boolean; path: string; domain?: string }
): void {
    if (typeof document === 'undefined') return;
    let c = `${name}=${value}; Path=${opt.path}; Max-Age=${opt.maxAgeSec}; SameSite=${opt.sameSite}`;
    if (opt.domain) c += `; Domain=${opt.domain}`;
    if (opt.secure) c += `; Secure`;
    document.cookie = c;
}

// --- Unified Factory (single entry point) ---
export function createConsentify<Cs extends readonly string[]>(init: CreateConsentifyInit<Cs>) {
    type T = ArrToUnion<Cs>;
    const policyHash = init.policy.identifier ?? hashPolicy(init.policy.categories);
    const cookieName = init.cookie?.name ?? DEFAULT_COOKIE;
    const sameSite = init.cookie?.sameSite ?? 'Lax';
    const cookieCfg = {
        path: init.cookie?.path ?? '/',
        maxAgeSec: init.cookie?.maxAgeSec ?? 60 * 60 * 24 * 365,
        sameSite,
        secure: sameSite === 'None' ? true : (init.cookie?.secure ?? true),
        domain: init.cookie?.domain,
    };
    const storageOrder: StorageKind[] = (init.storage && init.storage.length > 0) ? init.storage : ['cookie'];
    const consentMaxAgeDays = init.consentMaxAgeDays;

    const isExpired = (givenAt: string): boolean => {
        if (!consentMaxAgeDays) return false;
        const givenTime = new Date(givenAt).getTime();
        if (isNaN(givenTime)) return true; // Invalid date = expired
        const maxAgeMs = consentMaxAgeDays * 24 * 60 * 60 * 1000;
        return Date.now() - givenTime > maxAgeMs;
    };

    const allowed = new Set<Necessary | T>(['necessary', ...(init.policy.categories as unknown as T[])]);

    const normalize = (choices?: Partial<Choices<T>>): Choices<T> => {
        const base = { necessary: true } as Choices<T>;
        for (const c of init.policy.categories as unknown as T[]) (base as any)[c] = false;
        if (choices) {
            for (const [k,v] of Object.entries(choices) as [keyof Choices<T>, boolean][]) {
                if (allowed.has(k as any)) (base as any)[k] = !!v;
            }
        }
        (base as any).necessary = true;
        return base;
    };

    // --- client-side storage helpers ---
    const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';
    const canLocal = () => { try { return isBrowser() && !!window.localStorage; } catch { return false; } };

    const readFromStore = (kind: StorageKind): string | null => {
        switch (kind) {
            case 'cookie': return readCookie(cookieName);
            case 'localStorage': return canLocal() ? window.localStorage.getItem(cookieName) : null;
            default: return null;
        }
    };
    const writeToStore = (kind: StorageKind, value: string) => {
        switch (kind) {
            case 'cookie': writeCookie(cookieName, value, cookieCfg); break;
            case 'localStorage': if (canLocal()) window.localStorage.setItem(cookieName, value); break;
        }
    };
    const clearStore = (kind: StorageKind) => {
        switch (kind) {
            case 'cookie': if (isBrowser()) document.cookie = `${cookieName}=; Path=${cookieCfg.path}; Max-Age=0; SameSite=${cookieCfg.sameSite}${cookieCfg.domain ? `; Domain=${cookieCfg.domain}` : ''}${cookieCfg.secure ? '; Secure' : ''}`; break;
            case 'localStorage': if (canLocal()) window.localStorage.removeItem(cookieName); break;
        }
    };
    const firstAvailableStore = (): StorageKind => {
        for (const k of storageOrder) {
            if (k === 'cookie') return 'cookie';
            if (k === 'localStorage' && canLocal()) return 'localStorage';
        }
        return 'cookie';
    };
    const readClientRaw = (): string | null => {
        for (const k of storageOrder) {
            const v = readFromStore(k);
            if (v) return v;
        }
        return null;
    };
    const writeClientRaw = (value: string) => {
        const primary = firstAvailableStore();
        writeToStore(primary, value);
        if (primary !== 'cookie' && storageOrder.includes('cookie')) writeToStore('cookie', value);
    };

    // --- read helpers ---
    const readClient = (): Snapshot<T> | null => {
        const raw = readClientRaw();
        const s = raw ? dec<Snapshot<T>>(raw) : null;
        if (!s || !isValidSnapshot<T>(s)) return null;
        if (s.policy !== policyHash) return null;
        if (isExpired(s.givenAt)) return null;
        return s;
    };

    const writeClientIfChanged = (next: Snapshot<T>): boolean => {
        const prev = readClient();
        const same = !!(prev && prev.policy === next.policy && JSON.stringify(prev.choices) === JSON.stringify(next.choices));
        if (!same) writeClientRaw(enc(next));
        return !same;
    };

    function buildSetCookieHeader(name: string, value: string, opt: typeof cookieCfg): string {
        let header = `${name}=${value}; Path=${opt.path}; Max-Age=${opt.maxAgeSec}; SameSite=${opt.sameSite}`;
        if (opt.domain) header += `; Domain=${opt.domain}`;
        if (opt.secure) header += `; Secure`;
        return header;
    }

    // ---- server API
    const server = {
        get: (cookieHeader: string | null | undefined): ConsentState<T> => {
            const raw = cookieHeader ? readCookie(cookieName, cookieHeader) : null;
            const s = raw ? dec<Snapshot<T>>(raw) : null;
            if (!s || !isValidSnapshot<T>(s)) return { decision: 'unset' };
            if (s.policy !== policyHash) return { decision: 'unset' };
            if (isExpired(s.givenAt)) return { decision: 'unset' };
            return { decision: 'decided', snapshot: s };
        },
        set: (
            choices: Partial<Choices<T>>,
            currentCookieHeader?: string
        ): string => {
            const prev = currentCookieHeader ? server.get(currentCookieHeader) : { decision: 'unset' as const };
            const base = prev.decision === 'decided' ? prev.snapshot.choices : normalize();
            const snapshot: Snapshot<T> = {
                policy: policyHash,
                givenAt: toISO(),
                choices: normalize({ ...base, ...choices }),
            };
            return buildSetCookieHeader(cookieName, enc(snapshot), cookieCfg);
        },
        clear: (): string => {
            let h = `${cookieName}=; Path=${cookieCfg.path}; Max-Age=0; SameSite=${cookieCfg.sameSite}`;
            if (cookieCfg.domain) h += `; Domain=${cookieCfg.domain}`;
            if (cookieCfg.secure) h += `; Secure`;
            return h;
        }
    };

    // ========== NEW: Subscribe pattern for React ==========
    const listeners = new Set<() => void>();
    const unsetState: ConsentState<T> = { decision: 'unset' };
    let cachedState: ConsentState<T> = unsetState;

    const syncState = (): void => {
        const s = readClient();
        if (!s) {
            cachedState = unsetState;
        } else {
            cachedState = { decision: 'decided', snapshot: s };
        }
    };

    const notifyListeners = (): void => {
        listeners.forEach(cb => cb());
    };

    // Init cache on browser
    if (isBrowser()) {
        syncState();
    }
    // ======================================================

    // ---- client API
    function clientGet(): ConsentState<T>;
    function clientGet(category: 'necessary' | T): boolean;
    function clientGet(category?: 'necessary' | T): ConsentState<T> | boolean {
        // Return cached state for React compatibility
        if (typeof category === 'undefined') return cachedState;
        if (category === 'necessary') return true;
        return cachedState.decision === 'decided' 
            ? !!cachedState.snapshot.choices[category] 
            : false;
    }

    const client = {
        get: clientGet,
        
        set: (choices: Partial<Choices<T>>) => {
            const prev = client.get();
            const base = prev.decision === 'decided' ? prev.snapshot.choices : normalize();
            const next: Snapshot<T> = {
                policy: policyHash,
                givenAt: toISO(),
                choices: normalize({ ...base, ...choices }),
            };
            const changed = writeClientIfChanged(next);
            if (changed) {
                syncState();
                notifyListeners();
            }
        },
        
        clear: () => {
            for (const k of new Set<StorageKind>([...storageOrder, 'cookie'])) clearStore(k);
            syncState();
            notifyListeners();
        },

        // NEW: Subscribe for React useSyncExternalStore
        subscribe: (callback: () => void): (() => void) => {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },

        // NEW: Server snapshot for SSR (always unset)
        getServerSnapshot: (): ConsentState<T> => unsetState,
    };

    return {
        policy: {
            categories: init.policy.categories,
            identifier: policyHash,
        },
        server,
        client,
    } as const;
}

// Common predefined category names you can reuse in your policy.
export const defaultCategories = ['preferences','analytics','marketing','functional','unclassified'] as const;
export type DefaultCategory = typeof defaultCategories[number];
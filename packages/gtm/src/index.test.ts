import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConsentify } from '@consentify/core';
import { enableConsentMode } from './index';

function getGtagCalls(): unknown[][] {
  return (window.dataLayer as unknown[][]);
}

function findGtagCall(action: string, type: string): Record<string, unknown> | undefined {
  for (const entry of window.dataLayer as any[]) {
    // dataLayer entries from gtag are Arguments objects, convert to array
    const args = Array.from(entry);
    if (args[0] === action && args[1] === type) {
      return args[2] as Record<string, unknown>;
    }
  }
  return undefined;
}

function countGtagCalls(action: string, type: string): number {
  let count = 0;
  for (const entry of window.dataLayer as any[]) {
    const args = Array.from(entry);
    if (args[0] === action && args[1] === type) count++;
  }
  return count;
}

describe('enableConsentMode', () => {
  let consent: ReturnType<typeof createConsentify<readonly ['analytics', 'marketing', 'preferences']>>;

  beforeEach(() => {
    // Clean up window state
    delete (window as any).dataLayer;
    delete (window as any).gtag;
    // Clear cookies
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim();
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
    // Clear localStorage
    localStorage.clear();

    consent = createConsentify({
      policy: { categories: ['analytics', 'marketing', 'preferences'] as const },
    });
  });

  it('returns no-op dispose and makes no gtag calls in SSR', () => {
    const origWindow = globalThis.window;
    // Simulate SSR by temporarily hiding window
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true });

    const dispose = enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    expect(dispose).toBeTypeOf('function');
    dispose(); // should not throw

    // Restore
    Object.defineProperty(globalThis, 'window', { value: origWindow, configurable: true });
  });

  it('bootstraps dataLayer and gtag if missing', () => {
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();

    enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    expect(Array.isArray(window.dataLayer)).toBe(true);
    expect(typeof window.gtag).toBe('function');
  });

  it('preserves existing dataLayer and gtag', () => {
    const existingData = [{ event: 'existing' }];
    window.dataLayer = existingData;
    const customGtag = vi.fn(function gtag() { window.dataLayer.push(arguments); });
    window.gtag = customGtag;

    enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    // Existing data should still be there
    expect(window.dataLayer[0]).toEqual({ event: 'existing' });
    // Custom gtag should have been called
    expect(customGtag).toHaveBeenCalled();
  });

  it('calls gtag consent default on init with mapped types as denied', () => {
    enableConsentMode(consent, {
      mapping: {
        analytics: ['analytics_storage'],
        marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
      },
    });

    const defaultCall = findGtagCall('consent', 'default');
    expect(defaultCall).toBeDefined();
    expect(defaultCall!.analytics_storage).toBe('denied');
    expect(defaultCall!.ad_storage).toBe('denied');
    expect(defaultCall!.ad_user_data).toBe('denied');
    expect(defaultCall!.ad_personalization).toBe('denied');
  });

  it('passes wait_for_update in default call when provided', () => {
    enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
      waitForUpdate: 500,
    });

    const defaultCall = findGtagCall('consent', 'default');
    expect(defaultCall).toBeDefined();
    expect(defaultCall!.wait_for_update).toBe(500);
  });

  it('does not include wait_for_update when not provided', () => {
    enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    const defaultCall = findGtagCall('consent', 'default');
    expect(defaultCall).toBeDefined();
    expect(defaultCall!).not.toHaveProperty('wait_for_update');
  });

  it('calls both default and update if consent already decided', () => {
    consent.client.set({ analytics: true, marketing: false });

    enableConsentMode(consent, {
      mapping: {
        analytics: ['analytics_storage'],
        marketing: ['ad_storage'],
      },
    });

    expect(countGtagCalls('consent', 'default')).toBe(1);
    expect(countGtagCalls('consent', 'update')).toBe(1);

    const updateCall = findGtagCall('consent', 'update');
    expect(updateCall!.analytics_storage).toBe('granted');
    expect(updateCall!.ad_storage).toBe('denied');
  });

  it('only calls default if consent is unset', () => {
    enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    expect(countGtagCalls('consent', 'default')).toBe(1);
    expect(countGtagCalls('consent', 'update')).toBe(0);
  });

  it('calls gtag consent update on client.set()', () => {
    enableConsentMode(consent, {
      mapping: {
        analytics: ['analytics_storage'],
        marketing: ['ad_storage', 'ad_user_data'],
      },
    });

    consent.client.set({ analytics: true, marketing: false });

    const updateCalls = (window.dataLayer as any[]).filter(entry => {
      const args = Array.from(entry);
      return args[0] === 'consent' && args[1] === 'update';
    });

    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const lastUpdate = Array.from(updateCalls[updateCalls.length - 1]) as unknown[];
    const payload = lastUpdate[2] as Record<string, string>;
    expect(payload.analytics_storage).toBe('granted');
    expect(payload.ad_storage).toBe('denied');
    expect(payload.ad_user_data).toBe('denied');
  });

  it('maps multiple categories correctly', () => {
    enableConsentMode(consent, {
      mapping: {
        analytics: ['analytics_storage'],
        marketing: ['ad_storage'],
        preferences: ['functionality_storage', 'personalization_storage'],
      },
    });

    consent.client.set({ analytics: true, marketing: false, preferences: true });

    const updateCalls = (window.dataLayer as any[]).filter(entry => {
      const args = Array.from(entry);
      return args[0] === 'consent' && args[1] === 'update';
    });
    const lastUpdate = Array.from(updateCalls[updateCalls.length - 1]) as unknown[];
    const payload = lastUpdate[2] as Record<string, string>;

    expect(payload.analytics_storage).toBe('granted');
    expect(payload.ad_storage).toBe('denied');
    expect(payload.functionality_storage).toBe('granted');
    expect(payload.personalization_storage).toBe('granted');
  });

  it('maps necessary to granted always', () => {
    enableConsentMode(consent, {
      mapping: {
        necessary: ['security_storage'],
        analytics: ['analytics_storage'],
      },
    });

    const defaultCall = findGtagCall('consent', 'default');
    expect(defaultCall!.security_storage).toBe('granted');
    expect(defaultCall!.analytics_storage).toBe('denied');
  });

  it('dispose stops future updates', () => {
    const dispose = enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    dispose();

    const countBefore = countGtagCalls('consent', 'update');
    consent.client.set({ analytics: true });
    const countAfter = countGtagCalls('consent', 'update');

    expect(countAfter).toBe(countBefore);
  });

  it('handles client.clear() (consent revoked)', () => {
    enableConsentMode(consent, {
      mapping: { analytics: ['analytics_storage'] },
    });

    consent.client.set({ analytics: true });
    const updatesBefore = countGtagCalls('consent', 'update');

    consent.client.clear();

    // clear triggers subscribe callback, but decision is unset so no new update call
    const updatesAfter = countGtagCalls('consent', 'update');
    expect(updatesAfter).toBe(updatesBefore);
  });
});

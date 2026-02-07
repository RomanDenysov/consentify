import type { ConsentState } from '@consentify/core';

export type GoogleConsentType =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage';

type GoogleConsentValue = 'granted' | 'denied';

export interface ConsentModeOptions<T extends string> {
  mapping: Partial<Record<'necessary' | T, GoogleConsentType[]>>;
  waitForUpdate?: number;
}

interface ConsentifyClient<T extends string> {
  subscribe: (callback: () => void) => () => void;
  get: () => ConsentState<T>;
}

interface ConsentifyInstance<T extends string> {
  client: ConsentifyClient<T>;
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function enableConsentMode<T extends string>(
  instance: ConsentifyInstance<T>,
  options: ConsentModeOptions<T>,
): () => void {
  if (typeof window === 'undefined') return () => {};

  // Ensure dataLayer exists
  window.dataLayer = window.dataLayer || [];

  // Ensure gtag exists
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
  }

  const resolve = (): Record<string, GoogleConsentValue> => {
    const state = instance.client.get();
    const result: Record<string, GoogleConsentValue> = {};

    for (const [category, gTypes] of Object.entries(options.mapping) as [string, GoogleConsentType[]][]) {
      if (!gTypes) continue;

      let granted = false;
      if (category === 'necessary') {
        granted = true;
      } else if (state.decision === 'decided') {
        granted = !!(state.snapshot.choices as Record<string, boolean>)[category];
      }

      for (const gType of gTypes) {
        result[gType] = granted ? 'granted' : 'denied';
      }
    }

    return result;
  };

  // Default consent call
  const defaultPayload: Record<string, unknown> = { ...resolve() };
  if (options.waitForUpdate != null) {
    defaultPayload.wait_for_update = options.waitForUpdate;
  }
  window.gtag('consent', 'default', defaultPayload);

  // If consent already decided, immediately send update
  const state = instance.client.get();
  if (state.decision === 'decided') {
    window.gtag('consent', 'update', resolve());
  }

  // Subscribe to future changes
  const unsubscribe = instance.client.subscribe(() => {
    const current = instance.client.get();
    if (current.decision === 'decided') {
      window.gtag('consent', 'update', resolve());
    }
  });

  return unsubscribe;
}

export * from '@consentify/core';

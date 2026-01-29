"use client";

import { useSyncExternalStore } from "react";
import type { ConsentState } from "@consentify/core";

interface ConsentifyClient<T extends string> {
  subscribe: (callback: () => void) => () => void;
  get: () => ConsentState<T>;
  getServerSnapshot: () => ConsentState<T>;
}

interface ConsentifyInstance<T extends string> {
  client: ConsentifyClient<T>;
}

export function useConsentify<T extends string>(
  instance: ConsentifyInstance<T>
): ConsentState<T> {
  return useSyncExternalStore(
    instance.client.subscribe,
    instance.client.get,
    instance.client.getServerSnapshot
  );
}

export * from "@consentify/core";

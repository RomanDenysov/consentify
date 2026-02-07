"use client";

import { useSyncExternalStore } from "react";
import type { ConsentifySubscribable } from "@consentify/core";

export function useConsentify<T extends string>(
  instance: ConsentifySubscribable<T>
): ReturnType<typeof instance.get> {
  return useSyncExternalStore(
    instance.subscribe,
    instance.get,
    instance.getServerSnapshot
  );
}

export * from "@consentify/core";

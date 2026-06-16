import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AutomergeService {
  /**
   * Detects which fields the user intended to change (keys in `localPayload`,
   * excluding `version`) that the server has already set to a *different* value.
   *
   * No base snapshot is required — a conflict exists when what the client
   * wants to write differs from what the server currently holds.
   */
  detectOverlap<T extends Record<string, unknown>>(
    localPayload: Partial<T>,
    serverState: T,
  ): string[] {
    return (Object.keys(localPayload) as string[]).filter((key) => {
      if (key === 'version') return false;
      return serverState[key] !== localPayload[key as keyof T];
    });
  }

  /**
   * Merges local edits onto the latest server state for non-overlapping fields.
   * Takes all keys from `serverState` as the base, then overwrites with any
   * keys from `localPayload` that do NOT appear in `overlappingFields`.
   */
  merge<T extends Record<string, unknown>>(
    serverState: T,
    localPayload: Partial<T>,
    overlappingFields: string[],
  ): Partial<T> {
    const overlappingSet = new Set<string>(overlappingFields);
    const merged: Partial<T> = { ...serverState };

    for (const key of Object.keys(localPayload) as (keyof T)[]) {
      if (!overlappingSet.has(key as string)) {
        merged[key] = localPayload[key];
      }
    }

    return merged;
  }
}

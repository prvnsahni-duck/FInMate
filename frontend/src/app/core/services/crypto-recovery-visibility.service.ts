import { Injectable, Signal, computed, signal } from '@angular/core';

/**
 * Ensures only one <app-crypto-recovery-panel> instance is ever visible at
 * a time, even though several can be mounted simultaneously — e.g. Group
 * Detail's own panel plus Create Expense's panel while that modal is open
 * on top of it. Without this, both would show the same recovery prompt at
 * once, which reads as broken/duplicated rather than "one recovery event".
 *
 * Each panel instance registers on creation and unregisters on destroy. The
 * most-recently-registered instance is the "topmost" one and is the only
 * one allowed to render its content; every earlier-registered instance
 * suppresses itself while a later one exists. Because Angular constructs a
 * modal's contents after the page underneath it already exists, "most
 * recently registered" reliably matches "topmost on screen" for this app's
 * structure (a modal opened over a page, not multiple independent windows).
 */
@Injectable({ providedIn: 'root' })
export class CryptoRecoveryVisibilityService {
  private stack = signal<number[]>([]);
  private nextId = 0;

  register(): number {
    const id = this.nextId++;
    this.stack.update((s) => [...s, id]);
    return id;
  }

  unregister(id: number): void {
    this.stack.update((s) => s.filter((existing) => existing !== id));
  }

  isTopmost(id: number): Signal<boolean> {
    return computed(() => {
      const s = this.stack();
      return s.length > 0 && s[s.length - 1] === id;
    });
  }
}

import { useEffect, useRef } from "react";

// Persist a form snapshot to localStorage so the user doesn't lose what
// they typed if they navigate away (tab switch, back button, etc) before
// hitting save. Rehydrates once on mount, then mirrors every state update.
//
// Usage: called AFTER all state hooks, wires up against an accessor that
// rebuilds the snapshot from current state + a setter that spreads the
// saved snapshot back onto each field.
export function useFormDraft<T extends Record<string, unknown>>({
  key,
  enabled,
  snapshot,
  restore,
}: {
  key: string;
  enabled: boolean;
  snapshot: T;
  restore: (saved: Partial<T>) => void;
}) {
  const hydrated = useRef(false);

  // Hydrate once on mount.
  useEffect(() => {
    if (!enabled) return;
    if (hydrated.current) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>;
        restore(parsed);
      }
    } catch (e) {
      console.warn("[useFormDraft] failed to load draft:", e);
    }
    hydrated.current = true;
    // We intentionally run this only on mount — restore is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the snapshot on every change (after hydration).
  useEffect(() => {
    if (!enabled) return;
    if (!hydrated.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch (e) {
      // Quota / JSON error — swallow, we don't want form edits to crash.
      console.warn("[useFormDraft] failed to save draft:", e);
    }
  }, [key, enabled, snapshot]);

  return {
    clear: () => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

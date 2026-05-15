export const HOME_NAV_RESELECT_EVENT = "ourtable:home-nav-reselect";
const HOME_NAV_RESTORE_KEY = "ourtable:home-nav-restore:v1";

export function queueHomeNavRestore() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HOME_NAV_RESTORE_KEY, String(Date.now()));
  } catch {
    // Non-critical. Without the flag, tapping Home from another route
    // falls back to the normal new-route top position.
  }
}

export function consumeHomeNavRestore() {
  if (typeof window === "undefined") return false;
  try {
    const queued = window.sessionStorage.getItem(HOME_NAV_RESTORE_KEY);
    if (!queued) return false;
    window.sessionStorage.removeItem(HOME_NAV_RESTORE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function notifyHomeNavReselect() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOME_NAV_RESELECT_EVENT));
}

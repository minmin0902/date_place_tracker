export const HOME_NAV_RESELECT_EVENT = "ourtable:home-nav-reselect";
const HOME_NAV_RESELECT_KEY = "ourtable:home-nav-reselect:v1";

export function queueHomeNavReselect() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HOME_NAV_RESELECT_KEY, String(Date.now()));
  } catch {
    // Non-critical. The live event still handles the already-mounted
    // home page; this only bridges a tap from another route.
  }
}

export function consumeHomeNavReselect() {
  if (typeof window === "undefined") return false;
  try {
    const queued = window.sessionStorage.getItem(HOME_NAV_RESELECT_KEY);
    if (!queued) return false;
    window.sessionStorage.removeItem(HOME_NAV_RESELECT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function notifyHomeNavReselect() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOME_NAV_RESELECT_EVENT));
}

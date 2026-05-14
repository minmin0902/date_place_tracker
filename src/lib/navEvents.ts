export const HOME_NAV_RESELECT_EVENT = "ourtable:home-nav-reselect";
export const HOME_RETURN_ANCHOR_KEY = "home:return-anchor:v1";
export const FORCE_SCROLL_SAVE_EVENT = "ourtable:force-scroll-save";

export type ForceScrollSaveDetail = {
  key: string;
  y: number;
};

export function notifyHomeNavReselect() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOME_NAV_RESELECT_EVENT));
}

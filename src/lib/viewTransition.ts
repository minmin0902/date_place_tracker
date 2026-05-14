type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => {
    finished: Promise<void>;
  };
};

export function startRouteViewTransition(callback: () => void) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    callback();
    return;
  }

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const doc = document as ViewTransitionDocument;

  if (!doc.startViewTransition || prefersReduced) {
    callback();
    return;
  }

  document.documentElement.classList.add("route-view-transition");
  const transition = doc.startViewTransition(callback);
  void transition.finished.finally(() => {
    document.documentElement.classList.remove("route-view-transition");
  });
}

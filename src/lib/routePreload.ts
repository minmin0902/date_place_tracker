type RouteImporter = () => Promise<unknown>;

export const routeImporters = {
  placeForm: () => import("@/pages/PlaceFormPage"),
  placeDetail: () => import("@/pages/PlaceDetailPage"),
  foodForm: () => import("@/pages/FoodFormPage"),
  wishlistForm: () => import("@/pages/WishlistFormPage"),
  recipes: () => import("@/pages/RecipesPage"),
  compare: () => import("@/pages/ComparePage"),
  map: () => import("@/pages/MapPage"),
  settings: () => import("@/pages/SettingsPage"),
  profileEdit: () => import("@/pages/ProfileEditPage"),
  notifications: () => import("@/pages/NotificationsPage"),
} satisfies Record<string, RouteImporter>;

type RouteKey = keyof typeof routeImporters;

const warmed = new Set<RouteKey>();

function preloadRoute(key: RouteKey) {
  if (warmed.has(key)) return;
  warmed.add(key);
  void routeImporters[key]().catch(() => {
    warmed.delete(key);
  });
}

export function preloadRouteForPath(path: string) {
  if (path === "/map") preloadRoute("map");
  else if (path === "/compare") preloadRoute("compare");
  else if (path === "/settings") preloadRoute("settings");
  else if (path === "/notifications") preloadRoute("notifications");
  else if (path.startsWith("/profile/")) preloadRoute("profileEdit");
  else if (path.startsWith("/places/new")) preloadRoute("placeForm");
  else if (path.includes("/foods/")) preloadRoute("foodForm");
  else if (path.startsWith("/places/")) preloadRoute("placeDetail");
  else if (path.startsWith("/wishlist/")) preloadRoute("wishlistForm");
  else if (path === "/recipes") preloadRoute("recipes");
}

export function preloadAppRoutes() {
  if (typeof window === "undefined") return;
  const keys: RouteKey[] = [
    "placeDetail",
    "placeForm",
    "foodForm",
    "wishlistForm",
    "map",
    "compare",
    "settings",
    "notifications",
    "profileEdit",
    "recipes",
  ];
  const warm = () => {
    keys.forEach((key, index) => {
      globalThis.setTimeout(() => preloadRoute(key), index * 80);
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warm, { timeout: 2500 });
  } else {
    globalThis.setTimeout(warm, 900);
  }
}

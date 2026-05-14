import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { AppShell } from "@/components/AppShell";
import LoginPage from "@/pages/LoginPage";
import { routeImporters } from "@/lib/routePreload";
// HomePage stays eager because it's the landing route — every cold
// start lands here and a Suspense flash on the very first paint feels
// like the app is loading twice. Every other route is React.lazy so
// the initial bundle drops from a single ~850KB chunk into per-route
// chunks fetched on demand. PWA caches the chunks after first visit
// so repeat navigation is still instant.
import HomePage from "@/pages/HomePage";
import CoupleSetupPage from "@/pages/CoupleSetupPage";
const PlaceFormPage = lazy(routeImporters.placeForm);
const PlaceDetailPage = lazy(routeImporters.placeDetail);
const FoodFormPage = lazy(routeImporters.foodForm);
const WishlistFormPage = lazy(routeImporters.wishlistForm);
const RecipesPage = lazy(routeImporters.recipes);
const ComparePage = lazy(routeImporters.compare);
const MapPage = lazy(routeImporters.map);
const SettingsPage = lazy(routeImporters.settings);
const ProfileEditPage = lazy(routeImporters.profileEdit);
const NotificationsPage = lazy(routeImporters.notifications);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // iOS PWA backgrounds + foregrounds extremely aggressively
      // (home → app switch → return) and the default true triggered
      // every place/memo/reaction subscription to refetch on each
      // focus event, which caused a visible re-render wave. Hooks
      // that genuinely need focus-driven freshness (notification
      // unread badge) opt back in per-query.
      refetchOnWindowFocus: false,
    },
  },
});

// Supabase throws PostgrestError (plain object with message/details/hint/code)
// which is not an Error instance, so default stringification yields
// "[object Object]". Walk the common shapes and produce something readable.
function formatError(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string") parts.push(e.message);
    if (typeof e.details === "string" && e.details) parts.push(`details: ${e.details}`);
    if (typeof e.hint === "string" && e.hint) parts.push(`hint: ${e.hint}`);
    if (typeof e.code === "string" && e.code) parts.push(`code: ${e.code}`);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function LoadingScreen({ note, error }: { note: string; error?: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-3">
        <div className="text-3xl animate-pulse">🍜</div>
        <p className="text-sm text-ink-500">{note}</p>
        {error && (
          <div className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-xl p-3 text-left break-words">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const coupleQuery = useCouple();

  if (loading) {
    return <LoadingScreen note="인증 확인 중… · 检查登录状态…" />;
  }

  if (!user) return <LoginPage />;

  if (coupleQuery.isLoading || coupleQuery.isFetching) {
    return <LoadingScreen note="커플 정보 불러오는 중… · 加载情侣信息…" />;
  }

  if (coupleQuery.isError) {
    console.error("[Gate] couple query error:", coupleQuery.error);
    return (
      <LoadingScreen
        note="커플 정보 불러오기 실패 · 加载情侣信息失败"
        error={formatError(coupleQuery.error)}
      />
    );
  }

  const couple = coupleQuery.data;
  const hasPartner = couple?.user2_id && couple.user1_id !== couple.user2_id;
  if (!couple || !hasPartner) {
    return <CoupleSetupPage />;
  }

  return (
    // Suspense fallback uses the same loading shell as Gate's auth
    // check so the visual feel during a lazy chunk fetch matches the
    // initial auth boot. Mounted ONCE at the route container level so
    // every lazy route shares it — no need to wrap each <Route> in
    // its own boundary.
    <Suspense fallback={<LoadingScreen note="잠시만요… · 加载中…" />}>
      <Routes>
        {/* Every authenticated route lives under AppShell so the bottom nav
            stays visible on place/food detail & form pages too. */}
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile/:who" element={<ProfileEditPage />} />
          <Route path="places/new" element={<PlaceFormPage />} />
          <Route path="places/:id" element={<PlaceDetailPage />} />
          <Route path="places/:id/edit" element={<PlaceFormPage />} />
          <Route path="wishlist/new" element={<WishlistFormPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="places/:id/foods/new" element={<FoodFormPage />} />
          <Route path="places/:id/foods/:foodId/edit" element={<FoodFormPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

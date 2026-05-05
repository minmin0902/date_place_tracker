import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { AppShell } from "@/components/AppShell";
import LoginPage from "@/pages/LoginPage";
import CoupleSetupPage from "@/pages/CoupleSetupPage";
import HomePage from "@/pages/HomePage";
import PlaceFormPage from "@/pages/PlaceFormPage";
import PlaceDetailPage from "@/pages/PlaceDetailPage";
import FoodFormPage from "@/pages/FoodFormPage";
import WishlistFormPage from "@/pages/WishlistFormPage";
import RecipesPage from "@/pages/RecipesPage";
import ComparePage from "@/pages/ComparePage";
import MapPage from "@/pages/MapPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfileEditPage from "@/pages/ProfileEditPage";
import NotificationsPage from "@/pages/NotificationsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
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

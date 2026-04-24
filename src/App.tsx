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
import ComparePage from "@/pages/ComparePage";
import MapPage from "@/pages/MapPage";
import SettingsPage from "@/pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function Gate() {
  const { user, loading } = useAuth();
  const { data: couple, isLoading: coupleLoading } = useCouple();

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-ink-500">
        …
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (coupleLoading) {
    return (
      <div className="min-h-full flex items-center justify-center text-ink-500">
        …
      </div>
    );
  }

  const hasPartner = couple?.user2_id && couple.user1_id !== couple.user2_id;
  if (!couple || !hasPartner) {
    return <CoupleSetupPage />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="places/new" element={<PlaceFormPage />} />
      <Route path="places/:id" element={<PlaceDetailPage />} />
      <Route path="places/:id/edit" element={<PlaceFormPage />} />
      <Route path="places/:id/foods/new" element={<FoodFormPage />} />
      <Route path="places/:id/foods/:foodId/edit" element={<FoodFormPage />} />
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

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

// VAPID public key — deploy-time config. Bundled into the client so
// PushManager can encrypt the subscription against the server's
// keypair. Set VITE_VAPID_PUBLIC_KEY in .env / Vercel env vars.
//
// Generate the keypair once with:
//   npx web-push generate-vapid-keys
// Then store the PRIVATE key in the Supabase Edge Function as a
// secret; the PUBLIC half goes here.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

type PushStatus =
  | "unsupported" // browser/OS doesn't expose Notification + PushManager
  | "denied"      // user blocked notifications
  | "default"     // never asked
  | "granted-unsubscribed" // permission granted but no DB subscription yet
  | "granted-subscribed";  // good to go

// Web Push uses base64url; the API needs a BufferSource. We build the
// Uint8Array off an explicit ArrayBuffer (not just `new Uint8Array(n)`
// which TS now types as backed by ArrayBufferLike — a supertype that
// PushManager.subscribe doesn't accept).
function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Hook: returns the current push state + actions to enable/disable it.
// Used by the SettingsPage toggle and (optionally) a one-shot prompt.
export function usePushSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";

  // Compute initial state: permission + whether a subscription already
  // exists in the browser's PushManager (which survives across reloads).
  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    if (Notification.permission === "default") {
      setStatus("default");
      return;
    }
    // permission === "granted"
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setStatus(existing ? "granted-subscribed" : "granted-unsubscribed");
    } catch {
      setStatus("granted-unsubscribed");
    }
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ask permission + subscribe + persist endpoint to the DB. Idempotent:
  // if a subscription already exists in PushManager we just re-upsert
  // it so the DB row matches the live endpoint.
  const enable = useCallback(async () => {
    if (!supported || !user) return;
    if (!VAPID_PUBLIC_KEY) {
      setError("푸시 키가 설정되지 않았어요 (VITE_VAPID_PUBLIC_KEY)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!json.endpoint || !p256dh || !auth) {
        throw new Error("subscription missing endpoint/keys");
      }
      // Upsert by endpoint (unique). user_agent helps the user
      // identify which device a row belongs to in settings.
      const { error: upsertErr } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: json.endpoint,
            p256dh,
            auth_key: auth,
            user_agent: navigator.userAgent,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );
      if (upsertErr) throw upsertErr;
      setStatus("granted-subscribed");
    } catch (e) {
      console.error("[usePushSubscription] enable failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  // Tear down the local PushManager subscription + drop the DB row
  // for this endpoint. Permission stays granted at the OS level
  // (only the user can revoke that in browser settings).
  const disable = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
      }
      setStatus("granted-unsubscribed");
    } catch (e) {
      console.error("[usePushSubscription] disable failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  return { status, busy, error, enable, disable, refresh };
}

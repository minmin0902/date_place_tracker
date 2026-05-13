// Supabase Edge Function: send-push
//
// Triggered by a Supabase Database Webhook on `INSERT into notifications`.
// Looks up every push_subscriptions row for the recipient and sends
// a Web Push to each. Failed sends with 404/410 (subscription gone)
// auto-prune the dead row so the table doesn't accumulate stale endpoints.
//
// Setup:
//   1. Run `npx web-push generate-vapid-keys` once.
//   2. Save the PRIVATE key as a function secret:
//        supabase secrets set VAPID_PRIVATE_KEY=...
//        supabase secrets set VAPID_PUBLIC_KEY=...
//        supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
//      The PUBLIC key also goes into the frontend env (VITE_VAPID_PUBLIC_KEY).
//   3. Deploy:
//        supabase functions deploy send-push --no-verify-jwt
//      (no-verify-jwt because Database Webhooks call without a JWT;
//       the function itself uses the service-role key to read the table.)
//   4. In the Supabase dashboard → Database → Webhooks, create:
//        Table: notifications, Events: INSERT
//        Type: Supabase Edge Function → send-push
//
// The function expects the standard Supabase Database Webhook payload:
//   { type: "INSERT", table: "notifications", record: { ... } }

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

type NotificationRow = {
  id: string;
  recipient_id: string;
  kind:
    | "place"
    | "food"
    | "memo"
    | "memo_thread"
    | "memo_reply"
    | "reaction"
    | "revisit"
    | "rating";
  actor_id: string;
  place_id: string | null;
  food_id: string | null;
  memo_id: string | null;
  preview: string | null;
  created_at: string;
};

type WebhookBody = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: NotificationRow;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Build the toast title/body shown by the OS. Kept short — push
// payloads have a ~4KB limit and notification UIs truncate aggressively.
//
// Recipient is the Chinese-speaking partner, so the verb runs in
// Chinese. Actor name is whatever they set in their own profile —
// no remapping via the recipient's partner_nickname.
function renderPayload(n: NotificationRow, actorName: string) {
  const verb = (() => {
    switch (n.kind) {
      case "place":
        return "添加了新地点";
      case "food":
        return "记下了新菜品";
      case "memo":
        return "改了备注";
      case "memo_thread":
        return "留了言";
      case "memo_reply":
        return "回复了你";
      case "reaction":
        return "用表情回应了你";
      case "revisit":
        return "想再去";
      case "rating":
        return "打了分";
    }
  })();
  return {
    title: `${actorName} ${verb}`,
    body: n.preview || "",
    url: n.place_id ? `/places/${n.place_id}` : "/notifications",
    tag: `notif-${n.id}`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  let body: WebhookBody;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (body.type !== "INSERT" || body.table !== "notifications") {
    // Webhook fired on something we don't handle — ack and skip.
    return new Response("skip", { status: 200 });
  }
  const n = body.record;

  // Resolve actor name from THEIR OWN profiles.nickname — never the
  // recipient's partner_nickname. Whatever the actor put in their own
  // profile is the canonical label for them across all surfaces.
  const { data: actor } = await sb
    .from("profiles")
    .select("nickname")
    .eq("user_id", n.actor_id)
    .maybeSingle();
  const actorName = actor?.nickname?.trim() || "宝宝";

  // Total unread count for the recipient — drives the app icon badge
  // on the receiving device. Includes the just-inserted row.
  const { count: unreadCount } = await sb
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", n.recipient_id)
    .is("read_at", null);

  const payload = JSON.stringify({
    ...renderPayload(n, actorName),
    unread: unreadCount ?? 1,
  });

  // Pull every active subscription for the recipient.
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", n.recipient_id);
  if (error) {
    console.error("[send-push] subs query failed", error);
    return new Response("db error", { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response("no subscriptions", { status: 200 });
  }

  let sent = 0;
  let pruned = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth_key },
          },
          payload
        );
        sent += 1;
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        // 404 / 410 = subscription gone; remove the row so the table
        // doesn't keep retrying it forever.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
          pruned += 1;
        } else {
          console.warn("[send-push] sendNotification failed", err);
        }
      }
    })
  );

  return Response.json({ sent, pruned, subs: subs.length });
});

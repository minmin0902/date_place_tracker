// Service Worker for the 우리의 식탁 PWA.
//
// Scope is "/" (set by main.tsx during register). Two responsibilities:
//   1. push  — receive web-push payload, render OS notification.
//   2. notificationclick — open the deep link the payload carries.
//
// We deliberately don't add a fetch handler / offline cache here.
// The PWA is online-only by design (Supabase reads/writes), and the
// app shell is small enough that the browser HTTP cache covers cold
// loads. Adding workbox / caches.put would force a v2 revision flow
// for every static asset bump, which isn't worth the upside today.

self.addEventListener("install", (event) => {
  // Take over the scope on the first install so subsequent navigations
  // route through this worker without a manual refresh.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push payload shape (sent by the send-push Edge Function):
//   { title, body, url, tag, unread }
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "우리의 식탁";
  const options = {
    body: payload.body || "",
    icon: "/app-icon.png",
    badge: "/app-icon.png",
    // tag groups duplicates so two memos in a row don't stack the
    // shade — the second replaces the first.
    tag: payload.tag || "ourtable",
    data: { url: payload.url || "/notifications" },
  };

  // Update the home-screen icon badge in addition to showing the
  // banner. iOS 16.4+ PWAs and Chromium browsers expose this; older
  // engines just throw, hence the try/catch wrapper.
  const tasks = [self.registration.showNotification(title, options)];
  if (typeof payload.unread === "number" && "setAppBadge" in self.navigator) {
    tasks.push(
      self.navigator
        .setAppBadge(payload.unread)
        .catch(() => {})
    );
  }
  event.waitUntil(Promise.all(tasks));
});

// Tap handler: focus an existing tab if the app is already open;
// otherwise open the deep link in a new tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Try to surface an already-open tab on the same origin.
      for (const c of allClients) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(target).catch(() => {});
          return;
        }
      }
      // No tab open → cold start.
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});

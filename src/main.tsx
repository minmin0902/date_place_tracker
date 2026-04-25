import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./index.css";
import App from "./App.tsx";

// Register the push service worker on app boot. Soft-fails on browsers
// or contexts that don't support SW (e.g. iOS Safari without "Add to
// Home Screen") — push setup itself is gated by Notification.permission
// later, so a missing SW just means no push, app still works.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[main] service worker registration failed:", err);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

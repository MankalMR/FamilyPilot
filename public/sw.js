// Family Pilot service worker — Phase 3 detail-light push.
// Pushes are no-payload (no Web Push payload encryption needed):
// on arrival, the worker fetches the detail-light title/body for
// this user from /api/push/latest (the row /api/push/send recorded
// just before sending) and shows that. If the fetch fails, or the
// latest row is older than 30 minutes, it falls back to the
// generic notification — a push must never arrive as silence.
// Tapping opens the app, which fetches the latest data.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "Family Pilot updated";
      let body = "Something changed — open Family Pilot to see what's new.";
      try {
        const res = await fetch("/api/push/latest", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.notification && data.notification.title) {
            title = data.notification.title;
            body = data.notification.body || body;
          }
        }
      } catch {}
      return self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

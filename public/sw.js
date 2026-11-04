// Family Pilot service worker — push spike, no-payload first.
// Redeploy trigger Nov 3: VAPID_PRIVATE_KEY production secret is now
// set, and Pages binds secrets at deploy time, so this build is the
// first one that can actually see the secret.
// Pushes carry no data in the payload (privacy + no payload-encryption
// complexity for the spike). The notification is generic; tapping it
// opens the app, which fetches the latest data from the API.
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Family Pilot updated", {
      body: "Something changed — open Family Pilot to see what's new.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: "/" },
    })
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

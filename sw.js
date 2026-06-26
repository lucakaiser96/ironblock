// IRONBLOCK Service Worker
// Handles: push notifications, offline caching

const CACHE_NAME = 'ironblock-v3';

// ── Install: skip waiting, don't pre-cache ────────────────────────────────────
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ─────────────────────────────
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

// ── Message: schedule / cancel alarms from the app ───────────────────────────
// The app posts messages here because SW can run timers even when app is backgrounded.
// Format: { type: 'SCHEDULE_REST', seconds: 90 }
//         { type: 'CANCEL_REST' }
//         { type: 'SCHEDULE_STREAK_CHECK' }

let restTimer = null;

self.addEventListener('message', (e) => {
  const { type, seconds } = e.data || {};

  if (type === 'SCHEDULE_REST') {
    // Clear any existing rest timer
    if (restTimer) clearTimeout(restTimer);
    restTimer = setTimeout(() => {
      self.registration.showNotification('⏱ Pause vorbei!', {
        body: 'Nächster Satz wartet auf dich.',
        icon: '/manifest.json', // reuse — SW can't inline SVG easily
        badge: '/manifest.json',
        tag: 'rest-timer',       // replaces previous notification of same tag
        renotify: true,
        silent: false,
        data: { url: '/' },
      });
      restTimer = null;
    }, seconds * 1000);
    return;
  }

  if (type === 'CANCEL_REST') {
    if (restTimer) { clearTimeout(restTimer); restTimer = null; }
    // Dismiss the notification if it's already shown
    self.registration.getNotifications({ tag: 'rest-timer' }).then((notes) =>
      notes.forEach((n) => n.close())
    );
    return;
  }

  if (type === 'SCHEDULE_STREAK_CHECK') {
    // Called once on app open. Schedules a streak-danger notification
    // for later today if the user hasn't trained yet.
    // The app passes { type, streakDanger: true/false, msUntilReminder }
    const { streakDanger, msUntilReminder } = e.data;
    if (!streakDanger || !msUntilReminder || msUntilReminder <= 0) return;

    setTimeout(() => {
      self.registration.showNotification('🔥 Streak in Gefahr!', {
        body: 'Du hast heute noch nicht trainiert — rette deinen Streak!',
        tag: 'streak-warning',
        renotify: false,
        data: { url: '/' },
      });
    }, msUntilReminder);
  }
});

// ── Notification click: focus or open the app ─────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow('/');
    })
  );
});

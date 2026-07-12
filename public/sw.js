// Service Worker THT - notifications push + mise a jour automatique
// (sans ca, une nouvelle version du code peut rester "en attente" indefiniment
// et l'app continue d'afficher l'ancienne version meme apres avoir vide le cache)

self.addEventListener('install', () => {
  // Ne pas attendre : cette nouvelle version se prepare tout de suite
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Prend le controle de toutes les pages ouvertes immediatement, sans attendre
  // qu'elles soient toutes fermees comme c'est le comportement par defaut
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let data = { title: 'HABY Tontine', body: 'Nouvelle notification', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(data.title || 'HABY Tontine', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        client.postMessage({ type: 'NAVIGATE', url: targetUrl });
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});

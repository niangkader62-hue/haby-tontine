// Service Worker HABY Tontine - notifications push

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

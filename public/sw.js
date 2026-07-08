// Service Worker HABY Tontine - notifications push

self.addEventListener('push', (event) => {
  let data = { title: 'HABY Tontine', body: 'Nouvelle notification' };
  try { data = event.data.json(); } catch (e) {}
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(data.title || 'HABY Tontine', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

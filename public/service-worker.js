self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'タスクのお知らせ', body: event.data ? event.data.text() : '' };
  }

  const title = `⏰ ${data.title || 'タスクの期日です'}`;
  const options = {
    body: data.body || '',
    tag: data.taskId || 'taskline',
    renotify: true,
    requireInteraction: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { taskId: data.taskId },
    actions: [
      { action: 'snooze', title: '5分後に再通知' },
      { action: 'complete', title: '対応完了' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const taskId = event.notification.data && event.notification.data.taskId;
  event.notification.close();

  if (!taskId) {
    event.waitUntil(focusApp());
    return;
  }

  if (event.action === 'snooze') {
    event.waitUntil(
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          snoozeUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          resetAlert: true
        })
      })
    );
    return;
  }

  if (event.action === 'complete') {
    event.waitUntil(
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, completed: true })
      })
    );
    return;
  }

  event.waitUntil(focusApp());
});

async function focusApp() {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of allClients) {
    if ('focus' in client) return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow('/');
}

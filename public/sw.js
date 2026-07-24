// 결재 알림 전용 최소 서비스워커. 오프라인 캐싱 등은 하지 않고, Web Push 수신과 알림 클릭
// 처리만 담당한다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = { title: '알림', body: '', url: '/dashboard' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://public-frontend-cos.metadl.com/mgx/img/favicon.png',
      badge: 'https://public-frontend-cos.metadl.com/mgx/img/favicon.png',
      data: { url: data.url },
    })
  );
});

// 알림을 클릭하면 이미 열려있는 탭이 있으면 그 탭으로 이동시키고, 없으면 새 창을 연다.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        const url = new URL(client.url);
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

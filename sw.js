// EliteLab Service Worker

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
    let data = { title: "EliteLab Alert", body: "You have a new market alert!" };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: 'data:image/svg+xml,%3Csvg width="110" height="52" viewBox="0 0 110 52" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M 0 4 L 9 4 L 9 39 L 36 39 L 36 48 L 0 48 Z" fill="%238B5CF6" /%3E%3C/svg%3E',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});

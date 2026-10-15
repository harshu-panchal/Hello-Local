// Install before Firebase's handler so custom links work for SDK-displayed
// notifications as well as foreground/data-only notifications.
self.addEventListener('notificationclick', (event) => {
    const notificationData = event.notification.data || {};
    const data = notificationData.FCM_MSG?.data || notificationData;
    const url = new URL(data.link || '/', self.location.origin);
    event.stopImmediatePropagation();
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
        const existing = windows.find(client => client.url === url.href);
        if (existing) return existing.focus();
        return clients.openWindow(url.href);
    }));
});

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Firebase configuration
// WARNING: Do not hardcode credentials here. 
// For production, these should be injected during build or the worker should be initialized from the main thread.
const firebaseConfig = {
    apiKey: "AIzaSyBxjHgqQqaZcpG_GDBoUM9hixG7tbitoZI",
    authDomain: "hello-local-2e935.firebaseapp.com",
    projectId: "hello-local-2e935",
    storageBucket: "hello-local-2e935.firebasestorage.app",
    messagingSenderId: "48136214665",
    appId: "1:48136214665:web:6c3d9e6054336419760e58",
    measurementId: "G-JT3J4YCR6P"
};

// Initialize Firebase in service worker
firebase.initializeApp(firebaseConfig);

// Get messaging instance
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message', payload);

    // Firebase already displays notification payloads. Only data-only messages
    // need a manual display, otherwise users receive two notifications.
    if (payload.notification) return;
    const notificationTitle = payload.data?.title || 'New Notification';
    const notificationOptions = {
        body: payload.data?.body || '',
        icon: payload.data?.icon || '/logo.png',
        badge: '/logo.png',
        data: payload.data || {},
        tag: payload.data?.type || 'default',
        requireInteraction: false
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Apply notification fixes to existing installations without waiting for all
// tabs to close. The message format remains compatible with open pages.
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

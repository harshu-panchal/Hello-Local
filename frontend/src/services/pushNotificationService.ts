import { messaging, getToken, onMessage } from './firebase';
import { currentPortal, getAuthToken } from './api/session';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
const LEGACY_TOKEN_KEY = 'fcm_token_web';
const tokenKey = (portal: string) => `fcm_token_web.${portal}`;

// Serialize saves/removals so logout cannot race an in-flight registration.
let tokenOperations: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tokenOperations.then(operation);
    tokenOperations = result.catch(() => undefined);
    return result;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        // Firebase and showNotification require an active worker on first install.
        if (!registration.active) await navigator.serviceWorker.ready;
        return registration;
    } catch (error) {
        console.error('Service worker registration failed:', error);
        return null;
    }
}

/** Revalidate the SDK token even when a previous token is cached locally. */
export function registerFCMToken(
    _forceUpdate = false,
    options: { requestPermission?: boolean } = {},
): Promise<string | null> {
    const portal = currentPortal();
    const authToken = getAuthToken(portal);
    // Ask during login, but never prompt a returning session on page load.
    const permission = !authToken || !('Notification' in window)
        ? Promise.resolve('denied')
        : Notification.permission === 'default' && options.requestPermission !== false
            ? Notification.requestPermission().catch(() => 'denied')
            : Promise.resolve(Notification.permission);

    // A permission prompt may stay open indefinitely; do not let it block logout.
    return permission.then(granted => enqueue(async () => {
        try {
            if (!authToken || !messaging || granted !== 'granted') return null;
            if (getAuthToken(portal) !== authToken) return null;
            const registration = await registerServiceWorker();
            if (!registration) return null;
            const token = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration,
            });
            // Logout/account switching may happen while Firebase is loading.
            if (!token || getAuthToken(portal) !== authToken) return null;
            const response = await fetch(`${API_BASE_URL}/fcm-tokens/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ token, platform: 'web' }),
            });
            if (!response.ok) throw new Error(`FCM registration failed (${response.status})`);
            localStorage.setItem(tokenKey(portal), token);
            return token;
        } catch (error) {
            console.error('Failed to register FCM token:', error);
            return null;
        }
    }));
}

/** Returns the Firebase unsubscribe function for React effect cleanup. */
export function setupForegroundNotificationHandler(handler?: (payload: any) => void): () => void {
    if (!messaging) return () => undefined;
    return onMessage(messaging, (payload) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            void (async () => {
                const registration = await registerServiceWorker();
                if (!registration) return;
                await registration.showNotification(payload.notification?.title || payload.data?.title || 'New Notification', {
                    body: payload.notification?.body || payload.data?.body || '',
                    icon: payload.notification?.icon || payload.data?.icon || '/logo.png',
                    badge: '/logo.png',
                    tag: payload.data?.type || 'notification',
                    data: payload.data || {},
                });
            })().catch(error => console.error('Failed to display foreground notification:', error));
        }
        handler?.(payload);
    });
}

export async function initializePushNotifications(): Promise<void> {
    await registerServiceWorker();
}

/** Capture authentication synchronously, before the caller clears its session. */
export function removeFCMToken(): Promise<void> {
    const portal = currentPortal();
    const authToken = getAuthToken(portal);
    return enqueue(async () => {
        try {
            const savedToken = localStorage.getItem(tokenKey(portal)) || localStorage.getItem(LEGACY_TOKEN_KEY);
            if (!savedToken || !authToken) return;
            const response = await fetch(`${API_BASE_URL}/fcm-tokens/remove`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ token: savedToken, platform: 'web' }),
                keepalive: true,
            });
            if (!response.ok) throw new Error(`FCM removal failed (${response.status})`);
            localStorage.removeItem(tokenKey(portal));
            if (localStorage.getItem(LEGACY_TOKEN_KEY) === savedToken) localStorage.removeItem(LEGACY_TOKEN_KEY);
        } catch (error) {
            // Keep the cached token for retry; cleanup must not block logout.
            console.error('Failed to remove FCM token:', error);
        }
    });
}

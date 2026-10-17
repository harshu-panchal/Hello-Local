import { clearSession, currentPortal, getAuthToken, Portal } from './api/session';
import { removeFCMToken } from './pushNotificationService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export function endSession(portal: Portal = currentPortal()): void {
  const token = getAuthToken(portal);
  // Capture authentication for cleanup before clearing this portal locally.
  const cleanup = removeFCMToken(portal);
  clearSession(portal);
  if (!token) return;
  // A stalled push request must not prevent revoking the login session.
  let deadline: ReturnType<typeof setTimeout> | undefined;
  void Promise.race([cleanup, new Promise<void>(resolve => { deadline = setTimeout(resolve, 4000); })]).then(async () => {
    if (deadline) clearTimeout(deadline);
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true,
    });
    if (!response.ok && response.status !== 401) throw new Error(`Logout failed (${response.status})`);
  }).catch(error => console.error('Could not revoke the server session:', error));
}

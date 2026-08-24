/**
 * Portal-scoped session storage.
 *
 * All four portals used to share a single `authToken` / `userData` pair in
 * localStorage, so signing into the admin console silently destroyed an open
 * customer session in the same browser (and vice versa). Each portal now owns
 * its own namespace and they no longer collide. (#H-27)
 */

export type Portal = "admin" | "seller" | "delivery" | "customer";

const LEGACY_TOKEN_KEY = "authToken";
const LEGACY_USER_KEY = "userData";

/** Which portal the current URL belongs to. */
export function currentPortal(): Portal {
  if (typeof window === "undefined") return "customer";
  const p = window.location.pathname;
  if (p === "/admin" || p.startsWith("/admin/")) return "admin";
  if (p === "/seller" || p.startsWith("/seller/")) return "seller";
  if (p === "/delivery" || p.startsWith("/delivery/")) return "delivery";
  return "customer";
}

/** Map a login response's userType/role onto a portal. */
export function portalForUserType(userType?: string): Portal {
  switch (userType) {
    case "Admin":
    case "Super Admin":
      return "admin";
    case "Seller":
      return "seller";
    case "Delivery":
      return "delivery";
    default:
      return "customer";
  }
}

const tokenKey = (portal: Portal) => `hl.${portal}.token`;
const userKey = (portal: Portal) => `hl.${portal}.user`;

/**
 * One-time migration of a pre-namespacing session so people who are already
 * signed in are not logged out by this change.
 */
let migrated = false;
function migrateLegacySession(): void {
  if (migrated || typeof window === "undefined") return;
  migrated = true;

  try {
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    const legacyUser = localStorage.getItem(LEGACY_USER_KEY);
    if (!legacyToken) return;

    let portal: Portal = "customer";
    if (legacyUser) {
      try {
        const parsed = JSON.parse(legacyUser);
        portal = portalForUserType(parsed?.userType || parsed?.role);
      } catch {
        /* fall through to customer */
      }
    }

    if (!localStorage.getItem(tokenKey(portal))) {
      localStorage.setItem(tokenKey(portal), legacyToken);
      if (legacyUser) localStorage.setItem(userKey(portal), legacyUser);
    }
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

export function getAuthToken(portal: Portal = currentPortal()): string | null {
  if (typeof window === "undefined") return null;
  migrateLegacySession();
  return localStorage.getItem(tokenKey(portal));
}

export function setAuthToken(token: string, portal: Portal = currentPortal()): void {
  migrateLegacySession();
  localStorage.setItem(tokenKey(portal), token);
}

export function getStoredUser<T = any>(portal: Portal = currentPortal()): T | null {
  if (typeof window === "undefined") return null;
  migrateLegacySession();
  const raw = localStorage.getItem(userKey(portal));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown, portal: Portal = currentPortal()): void {
  migrateLegacySession();
  localStorage.setItem(userKey(portal), JSON.stringify(user));
}

/** Clear only the current portal's session; other portals stay signed in. */
export function clearSession(portal: Portal = currentPortal()): void {
  localStorage.removeItem(tokenKey(portal));
  localStorage.removeItem(userKey(portal));
  // Also clear any pre-namespacing leftovers.
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

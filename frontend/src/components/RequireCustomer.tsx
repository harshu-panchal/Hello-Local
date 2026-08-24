import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Gate for customer pages that are meaningless without a session.
 *
 * Orders, checkout, the address book and the account screen were all reachable
 * while signed out: they rendered empty shells whose API calls returned 401,
 * so the page looked broken rather than asking the user to sign in. (#M-08)
 *
 * This is a UX gate, not a security boundary — every one of these screens is
 * also enforced server-side.
 */
export default function RequireCustomer({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  const userType = (user as { userType?: string } | null)?.userType;
  const isCustomer = isAuthenticated && (!userType || userType === "Customer");

  if (!isCustomer) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import {
  getNotifications,
  Notification as NotificationType,
  markAsRead,
  markMultipleAsRead,
} from "../../../services/api/admin/adminNotificationService";
import { useAdminSocket, AdminSocketNotification } from "../hooks/useAdminSocket";
import helloLocalLogo from "@assets/logo.png";

interface AdminHeaderProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export default function AdminHeader({ onMenuClick, isSidebarOpen }: AdminHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { showToast } = useToast();

  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname.startsWith(path);

  // Real-time socket notification handler — fires immediately when a new order arrives
  const handleSocketNotification = useCallback((socketNotif: AdminSocketNotification) => {
    if (socketNotif.type !== "NEW_ORDER") return;

    // Prepend synthetic notification entry to the list
    const syntheticNotif: NotificationType = {
      _id: `socket-${Date.now()}`,
      recipientType: "Admin",
      title: "📦 New Order Received",
      message: `Order #${socketNotif.orderNumber} — ₹${socketNotif.totalAmount.toLocaleString("en-IN")} (${socketNotif.paymentMethod || "Unknown"})`,
      type: "Order",
      isRead: false,
      priority: "High",
      createdAt: new Date(socketNotif.timestamp).toISOString(),
      link: `/admin/orders/${socketNotif.orderId}`,
      actionLabel: "View Order",
    };

    setNotifications((prev) => [syntheticNotif, ...prev].slice(0, 10));
    setUnreadCount((prev) => prev + 1);
  }, []);

  // Connect to socket for real-time admin notifications
  useAdminSocket(handleSocketNotification);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotificationsDropdown(false);
      }
    };

    // Initial fetch; re-poll every 60s as a safety net
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      clearInterval(interval);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await getNotifications({ recipientType: "Admin", limit: 10 });
      if (response.success && response.data) {
        setNotifications(response.data);
        const unread = response.data.filter((n: any) => !n.isRead).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error("Error fetching admin notifications:", err);
    }
  };

  const handleNotificationClick = async (notification: NotificationType) => {
    if (!notification.isRead && !notification._id.startsWith("socket-")) {
      try {
        await markAsRead(notification._id);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Error marking notification as read:", err);
      }
    } else if (notification._id.startsWith("socket-")) {
      setNotifications((prev) =>
        prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    if (notification.link) {
      navigate(notification.link);
    }
    setShowNotificationsDropdown(false);
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications
      .filter((n) => !n.isRead && !n._id.startsWith("socket-"))
      .map((n) => n._id);

    try {
      setMarkingAll(true);
      if (unreadIds.length > 0) {
        await markMultipleAsRead({ notificationIds: unreadIds });
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      showToast("All notifications marked as read", "success");
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
      showToast("Failed to mark notifications as read", "error");
    } finally {
      setMarkingAll(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  const handleLogoClick = () => {
    navigate("/admin/dashboard");
  };

  return (
    <header className="bg-white shadow-xs border-b border-neutral-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 gap-3">
        {/* Left: Logo and Hamburger Menu */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Hamburger Menu Button */}
          <button
            onClick={onMenuClick}
            className="p-2.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Toggle navigation sidebar"
          >
            {isSidebarOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            )}
          </button>

          {/* Hello Local Logo */}
          <button
            onClick={handleLogoClick}
            className="hover:opacity-85 transition-opacity flex items-center"
            title="Go to Admin Dashboard"
          >
            <img
              src={helloLocalLogo}
              alt="Hello Local"
              className="h-9 sm:h-10 w-auto object-contain cursor-pointer"
              style={{ maxWidth: "180px" }}
            />
          </button>
        </div>

        {/* Center: Top Quick Navigation Tabs */}
        <nav aria-label="Quick Links" className="hidden md:flex items-center gap-1 lg:gap-2">
          <button
            onClick={() => navigate("/admin/orders/all")}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors min-h-[40px] ${
              isActive("/admin/orders")
                ? "bg-rose-50 text-rose-700 font-bold"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            Orders
          </button>

          <button
            onClick={() => navigate("/admin/users")}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors min-h-[40px] whitespace-nowrap ${
              isActive("/admin/users") || isActive("/admin/customers")
                ? "bg-rose-50 text-rose-700 font-bold"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            Manage Customer
          </button>

          <button
            onClick={() => navigate("/admin/delivery-boy/cash-collection")}
            className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors min-h-[40px] whitespace-nowrap ${
              isActive("/admin/delivery-boy/cash-collection") || isActive("/admin/collect-cash")
                ? "bg-rose-50 text-rose-700 font-bold"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            Collect Cash
          </button>
        </nav>

        {/* Right: Action Icons (Notification Bell, Profile, Logout) */}
        <div className="flex items-center gap-1.5 sm:gap-2 relative">
          {/* Notifications Button & Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setShowNotificationsDropdown((prev) => !prev)}
              className="p-2.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center relative"
              aria-label="View notifications"
              title="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8C6 11.3137 4 14 4 17H20C20 14 18 11.3137 18 8Z" />
                <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" />
              </svg>

              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] flex items-center justify-center rounded-full font-extrabold shadow-sm border border-white animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Popover */}
            {showNotificationsDropdown && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-neutral-200/90 z-50 flex flex-col max-h-[500px] overflow-hidden animate-scale-up">
                {/* Popover Header */}
                <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/80">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                      Live Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {unreadCount} New
                      </span>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      disabled={markingAll}
                      className="text-[11px] font-bold text-rose-700 hover:text-rose-800 disabled:opacity-50"
                    >
                      {markingAll ? "Marking..." : "Mark All Read"}
                    </button>
                  )}
                </div>

                {/* Notification List Body */}
                <div className="overflow-y-auto overflow-x-hidden flex-1 divide-y divide-neutral-100">
                  {notifications.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-2">
                      <div className="text-2xl text-neutral-300">🔔</div>
                      <p className="text-xs font-medium text-neutral-500">No active notifications</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        onClick={() => handleNotificationClick(n)}
                        className={`px-4 py-3 cursor-pointer hover:bg-rose-50/60 transition-colors relative ${
                          !n.isRead ? "bg-rose-50/30" : "bg-white"
                        }`}
                      >
                        {!n.isRead && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-rose-600 rounded-r" />
                        )}

                        <div className="flex flex-col gap-0.5">
                          <div className="flex justify-between items-start">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                n.type === "Payment"
                                  ? "text-amber-600"
                                  : n.type === "Success"
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                              }`}
                            >
                              {n.type}
                            </span>
                            <span className="text-[10px] text-neutral-400">
                              {n.createdAt
                                ? new Date(n.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Just now"}
                            </span>
                          </div>

                          <h4
                            className={`text-xs ${
                              !n.isRead ? "font-bold text-neutral-900" : "font-semibold text-neutral-700"
                            }`}
                          >
                            {n.title}
                          </h4>

                          <p className="text-[11px] text-neutral-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {n.message}
                          </p>

                          {n.actionLabel && (
                            <div className="mt-1 text-[11px] font-bold text-rose-700 flex items-center gap-1 group">
                              <span>{n.actionLabel}</span>
                              <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Popover Footer */}
                <div className="px-4 py-2.5 border-t border-neutral-100 bg-neutral-50/80 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/admin/notification");
                      setShowNotificationsDropdown(false);
                    }}
                    className="w-full text-center text-xs text-rose-700 hover:text-rose-800 font-bold py-1 transition-colors"
                  >
                    Broadcast & Notification Desk →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Admin Profile Button */}
          <button
            onClick={() => navigate("/admin/profile")}
            className="p-2.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Admin Profile Settings"
            title="My Profile"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="p-2.5 text-neutral-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Logout from Admin Portal"
            title="Logout"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

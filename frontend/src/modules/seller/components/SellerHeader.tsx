import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  getSellerNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  SellerNotificationItem,
} from '../../../services/api/sellerNotificationService';

interface SellerHeaderProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export default function SellerHeader({ onMenuClick }: SellerHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifications, setNotifications] = useState<SellerNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout } = useAuth();
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load notifications on mount and poll periodically
  const fetchNotifications = async () => {
    try {
      const res = await getSellerNotifications();
      if (res?.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60000);
    return () => clearInterval(id);
  }, []);

  const handleNotifClick = () => {
    const opening = !showNotifDropdown;
    setShowNotifDropdown(opening);
    setShowProfileDropdown(false);
    if (opening) fetchNotifications();
  };

  const handleNotificationItemClick = async (n: SellerNotificationItem) => {
    if (!n.isRead) {
      try {
        await markNotificationRead(n._id);
        setNotifications((prev) => prev.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    }
    if (n.link) {
      setShowNotifDropdown(false);
      navigate(n.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
      showToast('All notifications marked as read', 'success');
    } catch {
      showToast('Failed to mark notifications as read', 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/seller/login');
  };

  const handleProfileClick = () => {
    setShowProfileDropdown(!showProfileDropdown);
    setShowNotifDropdown(false);
  };

  const displayName = user?.storeName || user?.name || (user as any)?.ownerName || 'Seller';
  const displayEmail = user?.email || '';
  const displayPhone = user?.mobile || (user as any)?.phone || '';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'S';

  return (
    <header className="bg-white shadow-xs border-b border-neutral-200/80 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Hamburger Menu & Brand Logo */}
        <div className="flex items-center gap-3">
          {/* Hamburger Menu Button */}
          <button
            onClick={onMenuClick}
            className="p-2 rounded-xl text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* HelloLocal Brand Logo */}
          <div
            onClick={() => navigate('/seller')}
            className="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-xs flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className="flex items-baseline">
              <span className="text-lg font-black text-neutral-900 tracking-tight">Hello</span>
              <span className="text-lg font-black text-purple-600 tracking-tight">Local</span>
            </div>
          </div>
        </div>

        {/* Right: Notifications & Profile Avatar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notification Bell with Badge */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={handleNotifClick}
              className="relative p-2.5 text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Notifications"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifDropdown && (
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-neutral-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
                  <span className="text-sm font-bold text-neutral-900">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-purple-600 hover:text-purple-700 font-bold">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto seller-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-neutral-400">No new notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n._id}
                        onClick={() => handleNotificationItemClick(n)}
                        className={`w-full text-left px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 active:bg-neutral-100 transition-colors min-h-[44px] ${n.isRead ? '' : 'bg-purple-50/40'}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-600 flex-shrink-0" />}
                          <div className={`min-w-0 ${n.isRead ? 'pl-4' : ''}`}>
                            <p className="text-sm font-semibold text-neutral-900 truncate">{n.title}</p>
                            <p className="text-xs text-neutral-600 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-neutral-400 mt-1">
                              {new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Seller Avatar */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={handleProfileClick}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-500 text-white font-bold text-sm shadow-sm ring-2 ring-purple-100 hover:ring-purple-300 transition-all active:scale-95 overflow-hidden min-h-[44px] min-w-[44px]"
              aria-label="Profile"
            >
              {user?.profileImage || (user as any)?.logo ? (
                <img
                  src={user?.profileImage || (user as any)?.logo}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initial}</span>
              )}
            </button>

            {showProfileDropdown && (
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-neutral-200 py-2 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-3 bg-neutral-50/50">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-600 text-white font-bold text-base flex-shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-neutral-900 truncate">{displayName}</p>
                    {displayEmail && <p className="text-xs text-neutral-500 truncate">{displayEmail}</p>}
                    {displayPhone && <p className="text-xs text-neutral-500 truncate">{displayPhone}</p>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowProfileDropdown(false);
                    navigate('/seller/profile');
                  }}
                  className="w-full text-left px-4 py-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  My Profile & Store
                </button>
                <button
                  onClick={() => {
                    setShowProfileDropdown(false);
                    navigate('/seller/wallet');
                  }}
                  className="w-full text-left px-4 py-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  Wallet & Payouts
                </button>
                <button
                  onClick={() => {
                    setShowProfileDropdown(false);
                    navigate('/seller/account-settings');
                  }}
                  className="w-full text-left px-4 py-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  Account Settings
                </button>
                <div className="border-t border-neutral-100 my-1" />
                <button
                  onClick={() => {
                    setShowProfileDropdown(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-4 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getNotifications, Notification as NotificationType, markAsRead } from '../../../services/api/admin/adminNotificationService';
import helloLocalLogo from '@assets/logo.png';

interface AdminHeaderProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export default function AdminHeader({ onMenuClick, isSidebarOpen }: AdminHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const notificationsRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname.includes(path);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotificationsDropdown(false);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Check every 30 seconds

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearInterval(interval);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await getNotifications({ recipientType: 'Admin', limit: 10 });
      if (response.success && response.data) {
        setNotifications(response.data);
        const unread = response.data.filter((n: any) => !n.isRead).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Error fetching admin notifications:', err);
    }
  };

  const handleNotificationClick = async (notification: NotificationType) => {
    if (!notification.isRead) {
      try {
        await markAsRead(notification._id);
        fetchNotifications();
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    }

    if (notification.link) {
      navigate(notification.link);
    }
    setShowNotificationsDropdown(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const handleLogoClick = () => {
    navigate('/admin');
  };

  return (
    <header className="bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-30">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 gap-3 sm:gap-0">
        {/* Logo and Hamburger Menu */}
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          {/* Hamburger Menu Button */}
          <button
            onClick={onMenuClick}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors flex-shrink-0"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 6H20M4 12H20M4 18H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {/* Hello Local Logo */}
          <button
            onClick={handleLogoClick}
            className="hover:opacity-80 transition-opacity"
          >
            <img
              src={helloLocalLogo}
              alt="Hello Local"
              className="h-10 sm:h-12 w-auto object-contain cursor-pointer"
              style={{ maxWidth: '200px' }}
            />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="hidden md:flex items-center gap-4 lg:gap-6">
          <button
            onClick={() => navigate('/admin/orders')}
            className={`relative px-3 lg:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${isActive('/admin/orders') ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            Orders

          </button>
          <button
            onClick={() => navigate('/admin/customers')}
            className={`px-3 lg:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isActive('/admin/customers') ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            Manage Customer
          </button>
          <button
            onClick={() => navigate('/admin/collect-cash')}
            className={`px-3 lg:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isActive('/admin/collect-cash') ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            Collect Cash
          </button>
        </div>

        {/* Action Icons */}
        <div className="flex items-center gap-2 md:gap-4 relative">
          {/* Search Button */}
          <div className="relative">
            <button
              onClick={() => setShowSearchModal(!showSearchModal)}
              className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
              aria-label="Search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showSearchModal && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 p-4 z-50">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        // Navigate to search results or perform search
                        navigate(`/admin?search=${encodeURIComponent(searchQuery)}`);
                        setShowSearchModal(false);
                        setSearchQuery('');
                      }
                    }}
                    placeholder="Search orders, customers, products..."
                    className="w-full px-4 py-2 pl-10 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                    autoFocus
                  />
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="M21 21L16.65 16.65"></path>
                  </svg>
                  <button
                    onClick={() => {
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                {searchQuery && (
                  <div className="mt-2 text-xs text-neutral-500">
                    Press Enter to search
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notifications Button */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setShowNotificationsDropdown(!showNotificationsDropdown);
                setShowSearchModal(false);
              }}
              className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors relative"
              aria-label="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 8A6 6 0 0 0 6 8C6 11.3137 4 14 4 17H20C20 14 18 11.3137 18 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotificationsDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-neutral-200 py-0 z-50 flex flex-col max-h-[500px]">
                <div className="px-4 py-3 border-b border-neutral-100 flex justify-between items-center bg-neutral-50 rounded-t-lg">
                  <h3 className="text-sm font-bold text-neutral-800">Notifications</h3>
                  {unreadCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">{unreadCount} New</span>}
                </div>

                <div className="overflow-y-auto overflow-x-hidden flex-1">
                  {notifications.length === 0 ? (
                    <div className="py-8 px-4 text-center">
                      <div className="text-neutral-300 mb-2">
                        <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <p className="text-sm text-neutral-500">No notifications found</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {notifications.map((n) => (
                        <div
                          key={n._id}
                          onClick={() => handleNotificationClick(n)}
                          className={`px-4 py-3 border-b border-neutral-50 cursor-pointer hover:bg-rose-50 transition-colors relative ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                        >
                          {!n.isRead && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-rose-500 rounded-r"></div>}
                          <div className="flex flex-col gap-0.5">
                            <div className="flex justify-between items-start">
                              <span className={`text-[11px] font-bold uppercase tracking-wider ${n.type === 'Payment' ? 'text-amber-600' :
                                  n.type === 'Success' ? 'text-green-600' : 'text-rose-600'
                                }`}>
                                {n.type}
                              </span>
                              <span className="text-[10px] text-neutral-400">
                                {new Date(n.createdAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <h4 className={`text-sm ${!n.isRead ? 'font-bold text-neutral-900' : 'text-neutral-700'}`}>{n.title}</h4>
                            <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{n.message}</p>
                            {n.actionLabel && (
                              <div className="mt-1.5 text-[11px] font-bold text-rose-600 flex items-center gap-1 group">
                                {n.actionLabel}
                                <span className="group-hover:translate-x-1 transition-transform">→</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 rounded-b-lg">
                  <button
                    onClick={() => {
                      navigate('/admin/notification');
                      setShowNotificationsDropdown(false);
                    }}
                    className="w-full text-center text-xs text-rose-600 hover:rose-700 font-bold py-1"
                  >
                    Manage All Notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile Button */}
          <button
            onClick={() => navigate('/admin/profile')}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            aria-label="Profile"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            aria-label="Logout"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9M16 17L21 12M21 12L16 7M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}



import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../../services/api/delivery/deliveryService';
import { useToast } from '../../../context/ToastContext';

type Tab = 'All' | 'Unread' | 'Orders';

export default function DeliveryNotifications() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await getNotifications();
      setNotifications(data || []);

      if (isManualRefresh) {
        showToast('Notifications refreshed', 'success');
      }
    } catch (error: any) {
      console.error("Failed to fetch notifications", error);
      showToast(error.message || 'Failed to load notifications', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (error: any) {
      console.error("Failed to mark as read", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAll(true);
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast('All notifications marked as read', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to mark all as read', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    if (!notification.isRead) {
      await handleMarkAsRead(notification._id);
    }

    // Deep-link to order if related
    if (notification.link) {
      navigate(notification.link);
    } else if (notification.type === 'Order' || notification.type === 'order') {
      const orderIdMatch = notification.message?.match(/#?([A-Za-z0-9-_]{8,})/);
      if (orderIdMatch && orderIdMatch[1]) {
        navigate(`/delivery/orders/${orderIdMatch[1]}`);
      } else {
        navigate('/delivery/orders/today');
      }
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'Order':
      case 'order':
        return (
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0 border border-rose-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
        );
      case 'Payment':
      case 'payment':
        return (
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 border border-amber-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        );
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'Unread') return !n.isRead;
    if (activeTab === 'Orders') return n.type === 'Order' || n.type === 'order';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse max-w-lg mx-auto">
          <div className="h-8 bg-slate-200 rounded-xl w-1/3" />
          <div className="h-24 bg-slate-200 rounded-3xl" />
          <div className="h-24 bg-slate-200 rounded-3xl" />
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Header & Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700"
              aria-label="Go back"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <div>
              <h2 className="text-slate-900 text-xl font-black tracking-tight">Notifications</h2>
              {unreadCount > 0 && (
                <p className="text-[11px] text-rose-700 font-bold">{unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
                className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-all min-h-[40px]"
              >
                {markingAll ? 'Clearing...' : 'Mark all read'}
              </button>
            )}
            <button
              onClick={() => fetchNotifications(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Category Tabs */}
        <div className="flex bg-slate-200/70 p-1 rounded-2xl gap-1">
          {(['All', 'Unread', 'Orders'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all min-h-[36px] ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab} {tab === 'Unread' && unreadCount > 0 ? `(${unreadCount})` : ''}
            </button>
          ))}
        </div>

        {/* Notification List */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-2.5">
            {filteredNotifications.map((notification) => (
              <div
                key={notification._id}
                onClick={() => handleNotificationClick(notification)}
                className={`rounded-3xl p-4 shadow-2xs border transition-all cursor-pointer active:scale-[0.99] ${
                  notification.isRead
                    ? 'bg-white border-slate-200/80 hover:shadow-xs'
                    : 'bg-rose-50/60 border-rose-200/80 hover:bg-rose-50'
                }`}
              >
                <div className="flex gap-3 items-start">
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-slate-900 text-xs sm:text-sm font-black truncate">
                        {notification.title}
                      </h3>
                      {!notification.isRead && (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-600 flex-shrink-0 animate-pulse" />
                      )}
                    </div>
                    <p className="text-slate-600 text-xs mt-1 leading-relaxed line-clamp-2 font-medium">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between pt-2 text-[10px] text-slate-400 font-medium">
                      <span>{formatTime(notification.createdAt)}</span>
                      {notification.link || notification.type === 'Order' || notification.type === 'order' ? (
                        <span className="text-rose-700 font-bold hover:underline">View Order →</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 min-h-[300px] flex flex-col items-center justify-center text-center shadow-2xs border border-slate-200/80 space-y-2">
            <span className="text-3xl">🔔</span>
            <h4 className="text-sm font-bold text-slate-800">
              {activeTab === 'Unread' ? 'No unread notifications' : 'No notifications yet'}
            </h4>
            <p className="text-xs text-slate-500 max-w-xs">
              When order assignments, wallet transactions, or system updates occur, they will appear here.
            </p>
          </div>
        )}
      </div>
      <DeliveryBottomNav />
    </div>
  );
}

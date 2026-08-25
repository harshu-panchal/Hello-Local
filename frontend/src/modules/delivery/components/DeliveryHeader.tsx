import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeliveryStatus } from '../context/DeliveryStatusContext';
import { useDeliveryUser } from '../context/DeliveryUserContext';
import { useAuth } from '../../../context/AuthContext';
import { getNotifications } from '../../../services/api/delivery/deliveryService';

interface DeliveryHeaderProps {
  userName?: string;
}

export default function DeliveryHeader({ userName }: DeliveryHeaderProps) {
  const navigate = useNavigate();
  const { isOnline, setIsOnline } = useDeliveryStatus();
  const { userName: contextUserName } = useDeliveryUser();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // Unapproved partners cannot go online (#98/#140)
  const isPendingApproval = ((user as any)?.status ?? 'Active') === 'Inactive';
  const displayName = userName || contextUserName;

  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const data = await getNotifications();
        if (isMounted && Array.isArray(data)) {
          const count = data.filter((n: any) => !n.isRead).length;
          setUnreadCount(count);
        }
      } catch (err) {
        // Silently handle header badge errors
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // 30s background sync
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-white shadow-2xs border-b border-slate-200/80 sticky top-0 z-30">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="px-4 py-1.5 bg-slate-700 text-white text-xs font-bold text-center tracking-wide">
          Offline • Go Online to receive orders
        </div>
      )}

      {/* Header Content */}
      <div className="px-4 py-3 max-w-lg mx-auto">
        {/* App Title */}
        <h1
          className={`text-xl font-black text-center mb-2.5 transition-colors tracking-tight ${
            isOnline ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          Delivery App
        </h1>

        {/* User Info & Quick Action Bar */}
        <div className="flex items-center justify-between">
          <div
            onClick={() => navigate('/delivery/profile')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            {/* Profile Icon */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xs ${
                isOnline
                  ? 'bg-rose-600 group-hover:bg-rose-700'
                  : 'bg-slate-400 group-hover:bg-slate-500'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="2" fill="none" />
                <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Hello</span>
              <span className="text-slate-900 text-xs font-black group-hover:text-rose-600 transition-colors">
                {displayName || 'Partner'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Top Navbar Notification Bell Button */}
            <button
              onClick={() => navigate('/delivery/notifications')}
              className="relative p-2 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95 shadow-2xs"
              aria-label="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-xs animate-pulse border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Toggle Switch — disabled until admin approval (#98/#140) */}
            <button
              onClick={() => {
                if (!isPendingApproval) setIsOnline(!isOnline);
              }}
              disabled={isPendingApproval}
              title={isPendingApproval ? 'Available after admin approval' : isOnline ? 'Go Offline' : 'Go Online'}
              className={`relative w-12 h-7 rounded-full transition-colors min-h-[44px] flex items-center px-1 shadow-2xs ${
                isPendingApproval
                  ? 'bg-slate-200 cursor-not-allowed opacity-60'
                  : isOnline
                  ? 'bg-rose-600'
                  : 'bg-slate-300'
              }`}
              aria-label={isOnline ? 'On Duty' : 'Off Duty'}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform shadow-xs ${
                  isOnline ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

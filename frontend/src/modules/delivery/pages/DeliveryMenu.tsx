import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DeliveryHeader from "../components/DeliveryHeader";
import DeliveryBottomNav from "../components/DeliveryBottomNav";
import { clearSession } from '../../../services/api/session';
import { useAuth } from "../../../context/AuthContext";
import { useDeliveryUser } from "../context/DeliveryUserContext";
import { useDeliveryStatus } from "../context/DeliveryStatusContext";
import { useToast } from "../../../context/ToastContext";

export default function DeliveryMenu() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { userName } = useDeliveryUser();
  const { isOnline, sellersInRangeCount } = useDeliveryStatus();
  const { showToast } = useToast();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const displayName = userName || (user as any)?.name || "Delivery Partner";
  const displayMobile = (user as any)?.mobile || "";
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'DP';

  const menuItems = [
    { id: "menu-1", title: "Profile & KYC", subtitle: "Personal & bank details", route: "/delivery/profile" },
    { id: "menu-w", title: "Courier Wallet", subtitle: "Balance & COD settlements", route: "/delivery/wallet" },
    { id: "menu-history", title: "Delivery History", subtitle: "All completed orders", route: "/delivery/orders/all" },
    { id: "menu-2", title: "Earnings & Payouts", subtitle: "Commission withdrawals", route: "/delivery/earnings" },
    { id: "menu-service-areas", title: "Active Service Areas", subtitle: `${sellersInRangeCount} stores in range`, route: "/delivery/sellers-in-range" },
    { id: "menu-3", title: "Settings & Sound", subtitle: "App & notification preferences", route: "/delivery/settings" },
    { id: "menu-4", title: "Help & Support Desk", subtitle: "FAQs & emergency lines", route: "/delivery/help" },
    { id: "menu-5", title: "About Hello Local", subtitle: "App policies & legal terms", route: "/delivery/about" },
    { id: "menu-6", title: "Logout", subtitle: "Sign out of your account", route: "logout" },
  ];

  const getMenuIcon = (menuId: string) => {
    switch (menuId) {
      case "menu-1":
        return (
          <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
            </svg>
          </div>
        );
      case "menu-w":
        return (
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
        );
      case "menu-history":
        return (
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case "menu-2":
        return (
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10H18M6 14H14" />
              <circle cx="16" cy="12" r="2" />
            </svg>
          </div>
        );
      case "menu-service-areas":
        return (
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        );
      case "menu-3":
        return (
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
        );
      case "menu-4":
        return (
          <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        );
      case "menu-5":
        return (
          <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
        );
      case "menu-6":
        return (
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const handleMenuClick = (route: string) => {
    if (route === "logout") {
      setShowLogoutModal(true);
    } else {
      navigate(route);
    }
  };

  const handleConfirmLogout = () => {
    clearSession('delivery');
    logout();
    showToast('Logged out successfully', 'info');
    navigate('/delivery/login');
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Top Courier Profile Summary Card */}
        <div
          onClick={() => navigate('/delivery/profile')}
          className="bg-white rounded-3xl p-5 shadow-2xs border border-slate-200/80 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all hover:shadow-xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-rose-600 to-pink-700 flex items-center justify-center text-white text-lg font-black shadow-2xs">
              {initials}
            </div>
            <div>
              <h2 className="text-slate-900 text-base font-black tracking-tight">{displayName}</h2>
              {displayMobile && <p className="text-slate-500 text-xs font-semibold">{displayMobile}</p>}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                  {isOnline ? '🟢 On-Duty' : '⚪ Offline'}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  ★ 4.8 Rating
                </span>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-100">
            Edit →
          </span>
        </div>

        {/* Menu Navigation Items */}
        <div className="space-y-2">
          {menuItems.map((item) => {
            const isLogout = item.id === "menu-6";
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.route)}
                className={`w-full bg-white rounded-3xl p-4 shadow-2xs border border-slate-200/80 flex items-center gap-3.5 hover:shadow-xs transition-all active:scale-[0.99] min-h-[48px] ${
                  isLogout ? "hover:bg-rose-50/50" : "hover:bg-slate-50/50"
                }`}>
                <span className="flex-shrink-0">
                  {getMenuIcon(item.id)}
                </span>
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-xs sm:text-sm font-black ${isLogout ? "text-rose-600" : "text-slate-900"}`}>
                    {item.title}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium truncate">
                    {item.subtitle}
                  </p>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isLogout ? "text-rose-400" : "text-slate-300"}>
                  <path d="M9 18L15 12L9 6" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* Safe Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-2xl">
              🚪
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Confirm Sign Out</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Are you sure you want to log out of your delivery partner session?
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-3 text-xs font-bold text-slate-700 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                className="flex-1 py-3 text-xs font-black text-white bg-rose-600 rounded-2xl hover:bg-rose-700 transition-all shadow-xs min-h-[44px]"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <DeliveryBottomNav />
    </div>
  );
}

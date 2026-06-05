import { ReactNode, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SellerHeader from './SellerHeader';
import SellerSidebar from './SellerSidebar';
import { useSellerSocketContext, SellerNotification } from '../../../context/SellerSocketContext';
import SellerNotificationAlert from './SellerNotificationAlert';
import { useAuth } from '../../../context/AuthContext';
import { getSellerProfile } from '../../../services/api/auth/sellerAuthService';

interface SellerLayoutProps {
  children: ReactNode;
}

export default function SellerLayout({ children }: SellerLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<SellerNotification | null>(null);

  // Consume shared socket context (single connection for the whole seller panel)
  const { lastNotification, clearNotification } = useSellerSocketContext();

  // Refresh the seller's approval status on panel load so that a seller approved
  // by admin while logged in becomes unblocked (e.g. can add products) without a
  // manual re-login. (#admin-approval)
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    getSellerProfile()
      .then((res) => {
        if (
          active &&
          res?.success &&
          res.data?.status &&
          (user as any)?.status !== res.data.status
        ) {
          updateUser({ ...(user as any), status: res.data.status });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show popup whenever a new notification arrives
  useEffect(() => {
    if (lastNotification) {
      setActiveNotification(lastNotification);
    }
  }, [lastNotification]);

  // Lock background scroll while the mobile sidebar drawer is open.
  // `overflow: hidden` alone doesn't stop touch/momentum scroll on iOS Safari,
  // so we freeze the page with position: fixed and restore the scroll position
  // on close. (Desktop keeps scrolling — the sidebar isn't an overlay there.)
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    if (!(isSidebarOpen && isMobile)) return;

    const scrollY = window.scrollY;
    const { body } = document;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isSidebarOpen]);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const closeNotification = () => {
    setActiveNotification(null);
    clearNotification(); // also clear from context so SellerOrders picks it up cleanly
  };

  // Gate the whole panel until the seller is approved. A Pending/Rejected seller
  // sees a blocking notice instead of any functional page. (#pending-disable)
  // Default to approved when status is missing so we never lock out valid sellers.
  const status = (user as any)?.status;
  const isApproved = !status || status === 'Approved';

  if (!isApproved) {
    const rejected = status === 'Rejected';
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-md w-full p-8">
          <img src="/logo.png?v=4" alt="Hello Local" className="h-16 w-auto mx-auto mb-4 object-contain" />
          <div className={`mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${rejected ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {rejected ? <><path d="M18 6 6 18M6 6l12 12" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
            </svg>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            {rejected ? 'Account Not Approved' : 'Awaiting Admin Approval'}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">
            {rejected
              ? 'Your seller account application was not approved. Please contact support for assistance.'
              : 'Your seller account is under review. All features will be enabled once an admin approves your account.'}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold transition-colors"
            >
              Check Again
            </button>
            <button
              onClick={() => { logout(); navigate('/seller/login'); }}
              className="w-full py-2.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-sm font-semibold transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Real-time Notification Alert (popup) */}
      <SellerNotificationAlert
        notification={activeNotification}
        onClose={closeNotification}
      />

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar – fixed */}
      <div
        className={`fixed left-0 top-0 h-screen z-50 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SellerSidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 w-full ${
          isSidebarOpen ? 'ml-64' : 'ml-0'
        }`}
      >
        <SellerHeader onMenuClick={toggleSidebar} isSidebarOpen={isSidebarOpen} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-neutral-50">
          {children}
        </main>
      </div>
    </div>
  );
}

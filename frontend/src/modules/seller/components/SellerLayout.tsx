import { ReactNode, useState, useEffect } from 'react';
import SellerHeader from './SellerHeader';
import SellerSidebar from './SellerSidebar';
import { useSellerSocketContext, SellerNotification } from '../../../context/SellerSocketContext';
import SellerNotificationAlert from './SellerNotificationAlert';

interface SellerLayoutProps {
  children: ReactNode;
}

export default function SellerLayout({ children }: SellerLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<SellerNotification | null>(null);

  // Consume shared socket context (single connection for the whole seller panel)
  const { lastNotification, clearNotification } = useSellerSocketContext();

  // Show popup whenever a new notification arrives
  useEffect(() => {
    if (lastNotification) {
      setActiveNotification(lastNotification);
    }
  }, [lastNotification]);

  // Lock background scroll while the mobile sidebar drawer is open
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    document.body.style.overflow = isSidebarOpen && isMobile ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isSidebarOpen]);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  const closeNotification = () => {
    setActiveNotification(null);
    clearNotification(); // also clear from context so SellerOrders picks it up cleanly
  };

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

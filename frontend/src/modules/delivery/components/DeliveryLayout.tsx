import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryBottomNav from './DeliveryBottomNav';
import { DeliveryStatusProvider, useDeliveryStatus } from '../context/DeliveryStatusContext';
import { DeliveryUserProvider, useDeliveryUser } from '../context/DeliveryUserContext';
import { getDeliveryProfile } from '../../../services/api/delivery/deliveryService';
import { useDeliveryOrderNotifications } from '../../../hooks/useDeliveryOrderNotifications';
import OrderNotificationCard from './OrderNotificationCard';
import { AnimatePresence } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';

const DISABLED_MESSAGE = 'In-house delivery is currently unavailable. New delivery assignments are temporarily disabled.';

/** Shown while the admin has switched in-house delivery off (drain mode). */
function InHouseDeliveryDisabledBanner({ activeDeliveries, message, onOpenActive }: {
  activeDeliveries: number;
  message?: string;
  onOpenActive: () => void;
}) {
  return (
    <div role="status" className="mx-3 mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-2xs">
      <p className="text-xs sm:text-sm font-black">In-house delivery paused</p>
      <p className="mt-0.5 text-[11px] sm:text-xs font-medium leading-relaxed">{message || DISABLED_MESSAGE}</p>
      <p className="mt-1 text-[11px] font-medium text-amber-800">
        Your wallet, earnings, history and COD settlements remain available.
      </p>
      {activeDeliveries > 0 && (
        <button
          onClick={onOpenActive}
          className="mt-2 min-h-[44px] w-full rounded-xl bg-amber-600 px-3 text-xs font-black text-white hover:bg-amber-700"
        >
          Finish your {activeDeliveries} active deliver{activeDeliveries === 1 ? 'y' : 'ies'}
        </button>
      )}
    </div>
  );
}

interface DeliveryLayoutContentProps {
  children: ReactNode;
}

function DeliveryLayoutContent({ children }: DeliveryLayoutContentProps) {
  const navigate = useNavigate();
  const { isOnline, inHouseDeliveryEnabled, activeDeliveries, serviceMessage, applyServiceState } = useDeliveryStatus();
  const { setUserName } = useDeliveryUser();
  const { showToast } = useToast();
  const {
    currentNotification,
    acceptOrder,
    rejectOrder,
  } = useDeliveryOrderNotifications({ offersEnabled: inHouseDeliveryEnabled, onServiceState: applyServiceState });

  const handleAccept = async (orderId: string) => {
    const result: any = await acceptOrder(orderId, navigate);
    if (result && !result.success && result.reason?.startsWith('IN_HOUSE_DELIVERY')) {
      applyServiceState(false);
      showToast(result.message || DISABLED_MESSAGE, 'error');
    }
    return result;
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await getDeliveryProfile();
        if (profile?.name) {
          setUserName(profile.name);
        }
      } catch (error) {
        console.error('Failed to fetch profile in layout:', error);
      }
    };

    fetchProfile();
  }, [setUserName]);

  return (
    <div className={`flex flex-col min-h-screen bg-neutral-100 transition-all duration-300 ${!isOnline ? 'grayscale' : ''}`}>
      <main className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        {!inHouseDeliveryEnabled && (
          <InHouseDeliveryDisabledBanner
            activeDeliveries={activeDeliveries}
            message={serviceMessage}
            onOpenActive={() => navigate('/delivery/orders/pending')}
          />
        )}
        {children}
      </main>
      <DeliveryBottomNav />

      {/* Order Notification Card */}
      <AnimatePresence>
        {inHouseDeliveryEnabled && currentNotification && (
          <OrderNotificationCard
            key={currentNotification.orderId}
            notification={currentNotification}
            onAccept={handleAccept}
            onReject={rejectOrder}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface DeliveryLayoutProps {
  children: ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
  return (
    <DeliveryStatusProvider>
      <DeliveryUserProvider>
        <DeliveryLayoutContent>{children}</DeliveryLayoutContent>
      </DeliveryUserProvider>
    </DeliveryStatusProvider>
  );
}





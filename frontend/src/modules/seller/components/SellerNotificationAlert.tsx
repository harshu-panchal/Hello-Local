import React, { useState, useEffect, useRef } from 'react';
import { SellerNotification } from '../../../context/SellerSocketContext';
import { updateOrderStatus } from '../../../services/api/orderService';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';

interface SellerNotificationAlertProps {
  notification: SellerNotification | null;
  onClose: () => void;
}

const SellerNotificationAlert: React.FC<SellerNotificationAlertProps> = ({ notification, onClose }) => {
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const handleStatusUpdate = async (status: string) => {
    if (!notification) return;
    setLoading(true);
    try {
      await updateOrderStatus(notification.orderId, { status: status as any });
      showToast(
        status === 'Accepted'
          ? `Order #${notification.orderNumber} accepted!`
          : `Order #${notification.orderNumber} rejected`,
        status === 'Accepted' ? 'success' : 'info'
      );
      onClose();
      if (status === 'Accepted') {
        navigate(`/seller/orders/${notification.orderId}`);
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update order status', 'error');
    } finally {
      setLoading(false);
      setShowRejectConfirm(false);
    }
  };

  useEffect(() => {
    if (notification) {
      // Play sound when notification arrives
      if (audioRef.current) {
        audioRef.current.volume = volume;
        audioRef.current.play().catch((err) => console.error('Error playing sound:', err));
      }
    }
  }, [notification, volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  if (!notification) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <audio
        ref={audioRef}
        src="/assets/sound/seller_alert.mp3"
        loop
      />

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-200">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${notification.type === 'NEW_ORDER' ? 'bg-gradient-to-r from-[#2D1B69] via-[#351E7C] to-[#4F39F6]' : 'bg-indigo-600'} text-white`}>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-2xl">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black">
                {notification.type === 'NEW_ORDER' ? 'New Order Received!' : 'Order Status Updated'}
              </h2>
              <p className="text-xs text-purple-200 font-bold">#{notification.orderNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close notification"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 max-h-[65vh] overflow-y-auto space-y-4">
          {/* Volume Control */}
          <div className="bg-slate-50 p-3 rounded-2xl flex items-center gap-3 border border-slate-200/80">
            <span className="text-slate-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 accent-purple-600 cursor-pointer min-h-[32px]"
            />
            <span className="text-[11px] font-bold text-slate-600 min-w-[32px] text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Customer Info */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Customer Information</h3>
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-1">
              <p className="font-bold text-slate-900 text-sm sm:text-base">{notification.customer.name}</p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                <span>📞</span>
                <span>{notification.customer.phone}</span>
              </p>
              <div className="text-xs text-slate-600 flex items-start gap-1.5 pt-1">
                <span>📍</span>
                <span>
                  {notification.customer.address.address}, {notification.customer.address.city}, {notification.customer.address.pincode}
                  {notification.customer.address.landmark && <span className="block text-slate-400 text-[11px]">Landmark: {notification.customer.address.landmark}</span>}
                </span>
              </div>
            </div>
          </section>

          {/* Order Details */}
          <section className="space-y-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Order Items</h3>
            <div className="space-y-2 bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80">
              {notification.items.map((item, index) => (
                <div key={index} className="flex justify-between items-start py-1.5 border-b border-slate-200/60 last:border-0 text-xs">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{item.productName}</p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Qty: {item.quantity} × ₹{item.price.toFixed(2)}
                      {item.variation && <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-md font-bold text-[10px]">{item.variation}</span>}
                    </p>
                  </div>
                  <p className="font-bold text-slate-900">₹{item.total.toFixed(2)}</p>
                </div>
              ))}

              <div className="flex justify-between items-center pt-2.5 mt-1 border-t border-slate-300">
                <span className="text-xs font-bold text-slate-700">Total (Your Items)</span>
                <span className="text-base sm:text-lg font-black text-purple-700">₹{notification.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </section>

          {/* Rejection Confirmation Prompt */}
          {showRejectConfirm && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs space-y-2 animate-in fade-in">
              <p className="font-bold text-rose-800">Are you sure you want to reject this order?</p>
              <p className="text-rose-600">The customer will be notified and the order will be cancelled.</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRejectConfirm(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-700 min-h-[36px]"
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusUpdate('Rejected')}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold min-h-[36px]"
                >
                  {loading ? 'Rejecting...' : 'Yes, Reject'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200">
          {notification.type === 'NEW_ORDER' ? (
            !showRejectConfirm && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleStatusUpdate('Accepted')}
                  disabled={loading}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-xs sm:text-sm text-white shadow-xs bg-purple-600 hover:bg-purple-700 active:scale-98 transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {loading ? 'Please wait...' : '✓ Accept Order'}
                </button>
                <button
                  onClick={() => setShowRejectConfirm(true)}
                  disabled={loading}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-xs sm:text-sm text-white shadow-xs bg-rose-600 hover:bg-rose-700 active:scale-98 transition-all disabled:opacity-50 min-h-[44px]"
                >
                  Reject Order
                </button>
              </div>
            )
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-2xl font-bold text-xs sm:text-sm text-white shadow-xs bg-purple-600 hover:bg-purple-700 active:scale-98 transition-all min-h-[44px]"
            >
              Acknowledge & Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SellerNotificationAlert;

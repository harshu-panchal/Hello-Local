import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { getTodayOrders } from '../../../services/api/delivery/deliveryService';
import { useToast } from '../../../context/ToastContext';

export default function DeliveryOrders() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      const data = await getTodayOrders();
      setOrders(data || []);

      if (isManualRefresh) {
        showToast('Orders refreshed successfully', 'success');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load orders';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Ready for pickup':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Picked up':
      case 'Picked Up':
        return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'Out for delivery':
      case 'Out for Delivery':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'Delivered':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'Cancelled':
      case 'Returned':
        return 'bg-rose-100 text-rose-800 border border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse">
          <div className="h-8 bg-slate-200 rounded-xl w-1/3" />
          <div className="h-32 bg-slate-200 rounded-2xl" />
          <div className="h-32 bg-slate-200 rounded-2xl" />
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Header & Refresh */}
        <div className="flex items-center justify-between">
          <h2 className="text-slate-900 text-xl font-black tracking-tight">Today's Orders</h2>
          <button
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
            {error}
          </div>
        )}

        {orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => navigate(`/delivery/orders/${order.id}`)}
                className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 cursor-pointer active:scale-[0.99] transition-all hover:shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-black text-sm tracking-tight truncate">{order.orderId}</p>
                    <p className="text-slate-700 text-xs font-semibold truncate">{order.customerName}</p>
                    <p className="text-slate-400 text-[11px] font-medium">{order.customerPhone}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0 ${getStatusColor(order.status)}`}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-2.5 space-y-1.5">
                  <p className="text-slate-600 text-xs line-clamp-2 font-medium">📍 {order.address}</p>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 font-medium">
                      📦 {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-900 font-black text-sm">₹{Number(order.totalAmount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {order.estimatedDeliveryTime && (
                    <p className="text-[11px] text-slate-400 font-medium">
                      ⏱️ ETA: {order.estimatedDeliveryTime} {order.distance ? `• ${order.distance}` : ''}
                    </p>
                  )}
                  <p className="text-slate-400 text-[10px] font-medium pt-0.5">
                    {new Date(order.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 min-h-[300px] flex flex-col items-center justify-center text-center shadow-2xs border border-slate-200/80 space-y-2">
            <span className="text-3xl">🛵</span>
            <h4 className="text-sm font-bold text-slate-800">No assigned orders today</h4>
            <p className="text-xs text-slate-500 max-w-xs">
              When the platform assigns new orders to you, they will appear here in real time.
            </p>
          </div>
        )}
      </div>
      <DeliveryBottomNav />
    </div>
  );
}

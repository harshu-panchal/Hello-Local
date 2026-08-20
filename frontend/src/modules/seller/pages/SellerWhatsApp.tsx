import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerCard } from '../components/common/SellerCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';

export default function SellerWhatsApp() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const phone = (user as any)?.mobile || (user as any)?.phone || '9876543210';
  const formattedPhone = phone.startsWith('+91') ? phone : `+91 ${phone.replace(/(\d{5})(\d{5})/, '$1 $2')}`;

  const handleConnect = () => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
    }, 1000);
  };

  const handleDisconnect = () => {
    if (window.confirm('Are you sure you want to disconnect WhatsApp integration?')) {
      setIsConnected(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <SellerPageHeader
        title="WhatsApp Business Integration"
        subtitle="Automate instant order receipts, delivery updates, and customer chat."
        breadcrumbs={[{ label: "WhatsApp" }]}
      />

      {/* Main Connection Card */}
      <SellerCard>
        {!isConnected ? (
          /* UNCONNECTED VIEW */
          <div className="py-6 flex flex-col items-center text-center space-y-6 max-w-lg mx-auto">
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-100 via-teal-50 to-purple-100 flex items-center justify-center border border-emerald-200 shadow-inner">
              <span className="text-4xl select-none">💬</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Link Your WhatsApp Business
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                Connect your phone number to automatically send order notifications, receipt PDFs, and live updates to local buyers.
              </p>
            </div>

            {/* Feature Bullets */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-lg">📦</span>
                <h5 className="text-xs font-bold text-slate-900">Instant Receipts</h5>
                <p className="text-[11px] text-slate-500">Auto-dispatch PDF bills upon checkout.</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-lg">⚡</span>
                <h5 className="text-xs font-bold text-slate-900">Live Status</h5>
                <p className="text-[11px] text-slate-500">Notify customers when order is out for delivery.</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-lg">🤝</span>
                <h5 className="text-xs font-bold text-slate-900">Direct Support</h5>
                <p className="text-[11px] text-slate-500">Buyers can chat directly with your store.</p>
              </div>
            </div>

            <SellerButton
              variant="primary"
              size="lg"
              onClick={handleConnect}
              isLoading={isConnecting}
              className="w-full sm:w-auto px-8"
            >
              Connect {formattedPhone}
            </SellerButton>
          </div>
        ) : (
          /* CONNECTED VIEW */
          <div className="space-y-6">
            {/* Status Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl shadow-xs flex-shrink-0">
                  💬
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-slate-900">{formattedPhone}</h4>
                    <SellerStatusBadge status="Active" size="sm" />
                  </div>
                  <p className="text-xs text-emerald-800 font-bold">WhatsApp Business Connected & Operational</p>
                </div>
              </div>

              <SellerButton
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                Disconnect
              </SellerButton>
            </div>

            {/* Notification Automation Triggers */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Automated Message Triggers</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">New Order Confirmation</p>
                    <p className="text-[11px] text-slate-500">Sent when online order is placed</p>
                  </div>
                  <span className="text-emerald-600 font-bold text-xs">Enabled ✓</span>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">POS Bill / Invoice</p>
                    <p className="text-[11px] text-slate-500">Sent on counter checkout</p>
                  </div>
                  <span className="text-emerald-600 font-bold text-xs">Enabled ✓</span>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Out for Delivery Alert</p>
                    <p className="text-[11px] text-slate-500">Includes live delivery tracking link</p>
                  </div>
                  <span className="text-emerald-600 font-bold text-xs">Enabled ✓</span>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Daily Sales Summary</p>
                    <p className="text-[11px] text-slate-500">Sent to owner at store close</p>
                  </div>
                  <span className="text-emerald-600 font-bold text-xs">Enabled ✓</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SellerCard>
    </div>
  );
}

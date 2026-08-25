import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { getDeliveryAppPolicy } from '../../../services/api/delivery/deliveryService';
import { useToast } from '../../../context/ToastContext';

interface PolicyData {
  policy: string;
  version: string;
  build: string;
  platform: string;
  lastUpdated?: string;
}

export default function DeliveryAbout() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [policyData, setPolicyData] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPolicy = async (showNotification = false) => {
    try {
      const data = await getDeliveryAppPolicy();
      setPolicyData(data);
      if (showNotification) {
        showToast('App details & policy refreshed', 'success');
      }
    } catch (err) {
      console.error('Failed to load delivery policy', err);
      if (showNotification) {
        showToast('Failed to refresh policy details', 'error');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPolicy();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPolicy(true);
  };

  const handleCopyPolicy = () => {
    if (!policyData?.policy) return;
    navigator.clipboard.writeText(policyData.policy);
    showToast('Legal policy copied to clipboard', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-white shadow-2xs border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
              aria-label="Back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-800">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <div>
              <h1 className="text-slate-900 text-base font-black tracking-tight">About & Policies</h1>
              <p className="text-[11px] text-slate-500 font-semibold">Terms of Service & App Info</p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black shadow-2xs hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50 min-h-[40px]"
          >
            <span className={`inline-block ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Brand App Info Banner */}
        <div className="bg-white rounded-3xl p-6 shadow-2xs border border-slate-200/80 text-center space-y-3">
          <div className="w-18 h-18 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-center mx-auto shadow-2xs p-3">
            <img
              src="/logo.png?v=4"
              alt="Hello Local"
              className="h-full w-auto object-contain drop-shadow-xs"
            />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Hello Local Delivery Partner</h2>
            <p className="text-xs font-bold text-rose-600">Hyperlocal Delivery Fleet Network</p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Empowering fast 10-minute order fulfillments
            </p>
          </div>
        </div>

        {/* Legal Policies & Partner Terms */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📜</span>
              <h3 className="text-xs sm:text-sm font-black text-slate-900">Delivery Partner Terms & Policy</h3>
            </div>
            {policyData?.policy && (
              <button
                onClick={handleCopyPolicy}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-xl transition-colors min-h-[32px] flex items-center gap-1 border border-rose-100"
              >
                <span>📋</span> Copy
              </button>
            )}
          </div>
          <div className="p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-xs text-slate-400 font-medium">Loading platform policy...</p>
              </div>
            ) : (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 max-h-72 overflow-y-auto text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                {policyData?.policy || 'No official policy currently published.'}
              </div>
            )}
          </div>
        </div>

        {/* App Version & Build Metadata */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2">
            <span className="text-base">⚙️</span>
            <h3 className="text-xs sm:text-sm font-black text-slate-900">Application Information</h3>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">App Version</span>
              <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-xl">
                v{policyData?.version || '1.0.0'}
              </span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Build Release</span>
              <span className="text-xs font-black text-slate-800 font-mono">
                {policyData?.build || '2026.08.25'}
              </span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Platform</span>
              <span className="text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100">
                PWA / Android Fleet
              </span>
            </div>
            <div className="p-4 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Support Desk</span>
              <button
                onClick={() => navigate('/delivery/help')}
                className="text-xs font-black text-rose-600 hover:underline flex items-center gap-1"
              >
                Help & FAQs →
              </button>
            </div>
          </div>
        </div>

        {/* Copyright Footer */}
        <div className="text-center pt-2">
          <p className="text-[11px] font-semibold text-slate-400">
            © 2026 Hello Local Technologies Pvt. Ltd. All rights reserved.
          </p>
        </div>
      </div>

      <DeliveryBottomNav />
    </div>
  );
}

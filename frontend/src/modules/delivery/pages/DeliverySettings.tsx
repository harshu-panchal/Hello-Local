import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { updateSettings, getDeliveryProfile, deleteDeliveryAccount } from '../../../services/api/delivery/deliveryService';
import { useToast } from '../../../context/ToastContext';

export default function DeliverySettings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchSettings = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const profile = await getDeliveryProfile();
      if (profile?.settings) {
        setNotificationsEnabled(profile.settings.notifications ?? true);
        setLocationEnabled(profile.settings.location ?? true);
        setSoundEnabled(profile.settings.sound ?? true);
      }

      if (isManualRefresh) {
        showToast('Settings synced successfully', 'success');
      }
    } catch (error: any) {
      console.error("Failed to fetch settings", error);
      showToast(error.message || 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSettingChange = async (key: string, value: boolean, title: string) => {
    // Optimistic update
    if (key === 'notifications') setNotificationsEnabled(value);
    if (key === 'location') setLocationEnabled(value);
    if (key === 'sound') setSoundEnabled(value);

    try {
      await updateSettings({ [key]: value });
      showToast(`${title} ${value ? 'enabled' : 'disabled'}`, 'success');
    } catch (error: any) {
      console.error("Failed to update settings", error);
      // Revert on failure
      if (key === 'notifications') setNotificationsEnabled(!value);
      if (key === 'location') setLocationEnabled(!value);
      if (key === 'sound') setSoundEnabled(!value);
      showToast(error.message || `Failed to update ${title}`, 'error');
    }
  };

  const handleDeleteDelivery = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    try {
      setDeleting(true);
      const res = await deleteDeliveryAccount();
      if (res?.success) {
        showToast('Delivery partner account deleted', 'success');
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/delivery/login';
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Failed to delete delivery account', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const settingsOptions = [
    {
      id: 'notifications',
      title: 'Push Notifications',
      description: 'Receive notifications for new order assignments',
      value: notificationsEnabled,
      onChange: (val: boolean) => handleSettingChange('notifications', val, 'Push Notifications'),
    },
    {
      id: 'location',
      title: 'Location Tracking',
      description: 'Allow app to share live GPS for customer and store tracking',
      value: locationEnabled,
      onChange: (val: boolean) => handleSettingChange('location', val, 'Location Tracking'),
    },
    {
      id: 'sound',
      title: 'Sound Alerts',
      description: 'Play high-priority sound alarm for incoming orders',
      value: soundEnabled,
      onChange: (val: boolean) => handleSettingChange('sound', val, 'Sound Alerts'),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse max-w-lg mx-auto">
          <div className="h-8 bg-slate-200 rounded-xl w-1/3" />
          <div className="h-44 bg-slate-200 rounded-3xl" />
          <div className="h-32 bg-slate-200 rounded-3xl" />
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Header with Live Refresh */}
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
            <h2 className="text-slate-900 text-xl font-black tracking-tight">App Settings</h2>
          </div>

          <button
            onClick={() => fetchSettings(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Preferences */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-slate-900 font-black text-sm">Device & Alert Preferences</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {settingsOptions.map((option) => (
              <div key={option.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-xs sm:text-sm font-bold">{option.title}</p>
                  <p className="text-slate-500 text-[11px] font-medium mt-0.5">{option.description}</p>
                </div>
                <button
                  onClick={() => option.onChange(!option.value)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none min-h-[44px] min-w-[48px] justify-center ${
                    option.value ? 'bg-rose-600' : 'bg-slate-300'
                  }`}
                  aria-label={`Toggle ${option.title}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                      option.value ? 'translate-x-3' : '-translate-x-3'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Legal & App Details */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-slate-900 font-black text-sm">General & Support</h3>
          </div>
          <div className="divide-y divide-slate-100">
            <button
              onClick={() => showToast('Only English is currently available', 'info')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left min-h-[48px]"
            >
              <div>
                <p className="text-slate-900 text-xs sm:text-sm font-bold">App Language</p>
                <p className="text-slate-500 text-[11px] font-medium mt-0.5">English (Default)</p>
              </div>
              <span className="text-xs font-bold text-slate-400">Change ›</span>
            </button>

            <button
              onClick={() => navigate('/delivery/privacy')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left min-h-[48px]"
            >
              <div>
                <p className="text-slate-900 text-xs sm:text-sm font-bold">Privacy Policy & Terms</p>
                <p className="text-slate-500 text-[11px] font-medium mt-0.5">View platform service terms and courier policies</p>
              </div>
              <span className="text-xs font-bold text-slate-400">›</span>
            </button>

            <button
              onClick={() => navigate('/delivery/support')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left min-h-[48px]"
            >
              <div>
                <p className="text-slate-900 text-xs sm:text-sm font-bold">Help & Support Desk</p>
                <p className="text-slate-500 text-[11px] font-medium mt-0.5">Contact helpline or browse FAQs</p>
              </div>
              <span className="text-xs font-bold text-slate-400">›</span>
            </button>

            <button
              onClick={() => {
                setDeleteConfirmText('');
                setShowDeleteModal(true);
              }}
              className="w-full p-4 flex items-center justify-between hover:bg-rose-50 transition-colors text-left min-h-[48px] text-rose-600 border-t border-slate-100"
            >
              <div>
                <p className="text-xs sm:text-sm font-bold text-rose-600">Delete Partner Account</p>
                <p className="text-rose-400 text-[11px] font-medium mt-0.5">Deactivate delivery profile and unregister device</p>
              </div>
              <span className="text-xs font-bold text-rose-400">›</span>
            </button>
          </div>
        </div>

        {/* App Version */}
        <div className="pt-2 text-center">
          <p className="text-slate-400 text-xs font-semibold">Hello Local Partner App • Version 1.0.0</p>
        </div>
      </div>

      {/* Delete Delivery Partner Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-200/80 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center text-xl mx-auto shadow-2xs">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">Delete Delivery Account?</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                This action will deactivate your driver fleet profile and release your registered mobile number. You cannot delete your account if you have pending cash collections or assigned orders.
              </p>
            </div>

            <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
              <label className="text-[11px] font-bold text-slate-600 block">
                Type <span className="text-rose-600 font-black">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-rose-500/20 uppercase"
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deleting}
                onClick={handleDeleteDelivery}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 rounded-full shadow-xs transition-colors"
              >
                {deleting ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeliveryBottomNav />
    </div>
  );
}

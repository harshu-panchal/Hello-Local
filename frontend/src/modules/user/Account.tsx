import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getProfile, CustomerProfile } from '../../services/api/customerService';
import { useAuth } from '../../context/AuthContext';
import { useThemeContext } from '../../context/ThemeContext';
import { UserEmptyState } from './components/common';
import {
  ArrowLeftIcon,
  UserNavIcon,
  OrdersNavIcon,
  LocationPinIcon,
  HeartNavIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  ReceiptIcon,
  PhoneCallIcon,
} from './components/common/UserIcons';

export default function Account() {
  const navigate = useNavigate();
  const { user, logout: authLogout } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showGstModal, setShowGstModal] = useState(false);
  const [gstNumber, setGstNumber] = useState('');
  const [gstError, setGstError] = useState('');
  const { currentTheme } = useThemeContext();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getProfile();
        if (response.success) {
          setProfile(response.data);
        } else {
          setError('Failed to load profile');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load profile');
        if (err.response?.status === 401) {
          authLogout();
        }
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [user, navigate, authLogout]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      const date = new Date(dateString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    } catch {
      return dateString;
    }
  };

  const handleLogout = () => {
    authLogout();
    navigate('/login');
  };

  const handleGstSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const gst = gstNumber.trim().toUpperCase();
    if (!gst) {
      setGstError('GST number is required');
      return;
    }
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst)) {
      setGstError('Invalid GST number format (e.g. 22ABCDE1234F1Z5)');
      return;
    }
    setGstError('');
    setShowGstModal(false);
  };

  // Unauthenticated view
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-8 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 p-6 sm:p-8 shadow-2xs text-center">
          <div className="w-16 h-16 mx-auto mb-3.5 rounded-full bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] shadow-xs">
            <UserNavIcon size={30} />
          </div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-xl font-bold tracking-tight text-[#FF8A00]">Hello</span>
            <span className="text-xl font-bold tracking-tight text-[#FF2E7A]">Local</span>
          </div>
          <p className="text-xs text-slate-500 mb-5 font-medium leading-relaxed">
            Login with your mobile number to view saved addresses, past orders, and manage your account.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full py-2.5 bg-[#FF2E7A] hover:bg-[#E02269] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-xs transition-all touch-target-min"
          >
            Login / Sign Up
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  const displayName = profile?.name || user?.name || 'Customer';
  const displayPhone = profile?.phone || user?.phone || '';
  const displayEmail = profile?.email || user?.email || '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 md:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors touch-target-min"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              My Account
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start space-y-3.5 lg:space-y-0">
          {/* Left Column: Profile Card & Quick Actions */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-3.5">
            {/* Profile Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-2xs flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-full bg-[#FFF1F4] border border-[#FFE4EA] text-[#FF2E7A] flex items-center justify-center text-xl font-bold shadow-2xs flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {displayName}
                  </h2>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-200 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>

                {displayPhone && (
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    +91 {displayPhone}
                  </p>
                )}
                {displayEmail && (
                  <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                    {displayEmail}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Action Tiles */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/orders')}
                className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs hover:bg-slate-50 text-left transition-colors flex items-center gap-2.5 touch-target-min"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
                  <OrdersNavIcon size={18} />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900">Your Orders</p>
                  <p className="text-[10px] text-slate-400 font-medium">Track & review</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/faq')}
                className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs hover:bg-slate-50 text-left transition-colors flex items-center gap-2.5 touch-target-min"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
                  <PhoneCallIcon size={18} />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900">Need Help?</p>
                  <p className="text-[10px] text-slate-400 font-medium">FAQs & support</p>
                </div>
              </button>
            </div>
          </div>

          {/* Right Column: Account Menu Options */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3.5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => navigate('/address-book')}
                className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors text-left touch-target-min"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-[#FF2E7A]">
                    <LocationPinIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">Address Book</p>
                    <p className="text-[10px] text-slate-400 font-medium">Manage saved delivery locations</p>
                  </div>
                </div>
                <ChevronRightIcon size={14} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/wishlist')}
                className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors text-left touch-target-min"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-[#FF2E7A]">
                    <HeartNavIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">Your Wishlist</p>
                    <p className="text-[10px] text-slate-400 font-medium">Shortlisted favorite items</p>
                  </div>
                </div>
                <ChevronRightIcon size={14} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setShowGstModal(true)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors text-left touch-target-min"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-[#FF2E7A]">
                    <ReceiptIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">GST Details</p>
                    <p className="text-[10px] text-slate-400 font-medium">Add GSTIN for tax invoice input credit</p>
                  </div>
                </div>
                <ChevronRightIcon size={14} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/about-us')}
                className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors text-left touch-target-min"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-[#FF2E7A]">
                    <ShieldCheckIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">About Hello Local</p>
                    <p className="text-[10px] text-slate-400 font-medium">Terms, policy & brand mission</p>
                  </div>
                </div>
                <ChevronRightIcon size={14} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-between p-3.5 hover:bg-[#FFF1F4] transition-colors text-left touch-target-min"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FFF1F4] flex items-center justify-center text-[#FF2E7A]">
                    <UserNavIcon size={16} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-[#FF2E7A]">Log Out</p>
                    <p className="text-[10px] text-[#FF2E7A]/70 font-medium">Sign out from this device</p>
                  </div>
                </div>
                <ChevronRightIcon size={14} className="text-[#FF2E7A]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* GST Details Modal */}
      {showGstModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl border border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Add GST Details</h3>
            <p className="text-xs text-slate-500 mb-3.5 font-medium">
              Identify your business to get a GST invoice on your purchases.
            </p>

            <form onSubmit={handleGstSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => {
                    setGstNumber(e.target.value.toUpperCase());
                    if (gstError) setGstError('');
                  }}
                  placeholder="e.g. 22ABCDE1234F1Z5"
                  maxLength={15}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 uppercase"
                />
                {gstError && <p className="text-[10px] text-rose-500 mt-1 font-bold">{gstError}</p>}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowGstModal(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!gstNumber.trim()}
                  className="flex-1 py-2 text-xs font-bold text-white bg-[#FF2E7A] rounded-full shadow-xs hover:bg-[#E02269] transition-colors disabled:opacity-50"
                >
                  Save GSTIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

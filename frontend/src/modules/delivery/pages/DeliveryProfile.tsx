import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { useDeliveryUser } from '../context/DeliveryUserContext';
import { getDeliveryProfile, updateProfile } from '../../../services/api/delivery/deliveryService';
import { useToast } from '../../../context/ToastContext';

export default function DeliveryProfile() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { setUserName } = useDeliveryUser();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [profileData, setProfileData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    vehicleNumber: '',
    vehicleType: 'Bike',
    joinDate: '',
    totalDeliveries: 0,
    rating: 4.8,
    accountName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    status: 'Active',
    hasDrivingLicense: false,
    hasNationalId: false,
  });

  const fetchProfile = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await getDeliveryProfile();
      setProfileData({
        name: data.name || '',
        phone: data.mobile || '',
        email: data.email || '',
        address: data.address || '',
        city: data.city || '',
        vehicleNumber: data.vehicleNumber || '',
        vehicleType: data.vehicleType || 'Bike',
        joinDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A',
        totalDeliveries: data.totalDeliveredCount || 0,
        rating: 4.8,
        accountName: data.accountName || '',
        bankName: data.bankName || '',
        accountNumber: data.accountNumber || '',
        ifscCode: data.ifscCode || '',
        status: data.status || 'Active',
        hasDrivingLicense: Boolean(data.drivingLicense),
        hasNationalId: Boolean(data.nationalIdentityCard),
      });

      if (data.name) {
        setUserName(data.name);
      }

      if (isManualRefresh) {
        showToast('Profile & KYC details refreshed', 'success');
      }
    } catch (error: any) {
      console.error("Failed to fetch profile", error);
      showToast(error.message || 'Failed to load profile data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setUserName, showToast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleEdit = () => {
    setIsEditing(true);
    setFieldErrors({});
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFieldErrors({});
    fetchProfile();
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};

    const name = profileData.name.trim();
    if (!name) errors.name = 'Name is required';
    else if (name.length < 2) errors.name = 'Name must be at least 2 characters';
    else if (!/^[A-Za-z\s]+$/.test(name)) errors.name = 'Name must contain only letters and spaces';

    const email = profileData.email.trim();
    if (!email) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please enter a valid email address';

    const accountNumber = profileData.accountNumber.trim();
    if (accountNumber && !/^\d{9,18}$/.test(accountNumber)) errors.accountNumber = 'Account number must be 9–18 digits';

    const accountName = profileData.accountName.trim();
    if (accountName && !/^[A-Za-z\s]+$/.test(accountName)) errors.accountName = 'Account name must contain only letters and spaces';

    const bankName = profileData.bankName.trim();
    if (bankName && !/^[A-Za-z\s]+$/.test(bankName)) errors.bankName = 'Bank name must contain only letters and spaces';

    const ifscCode = profileData.ifscCode.trim();
    if (ifscCode && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/i.test(ifscCode)) errors.ifscCode = 'Invalid IFSC code (e.g. HDFC0001234)';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showToast('Please fix the validation errors before saving', 'error');
      return;
    }

    setFieldErrors({});
    try {
      setSaving(true);
      await updateProfile({
        name: profileData.name,
        email: profileData.email,
        address: profileData.address,
        city: profileData.city,
        vehicleNumber: profileData.vehicleNumber,
        vehicleType: profileData.vehicleType,
        accountName: profileData.accountName,
        bankName: profileData.bankName,
        accountNumber: profileData.accountNumber,
        ifscCode: profileData.ifscCode,
      });

      setUserName(profileData.name);
      setIsEditing(false);
      showToast('Profile updated successfully', 'success');
    } catch (error: any) {
      console.error("Failed to update profile", error);
      showToast(error.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'name' || field === 'accountName' || field === 'bankName') {
      value = value.replace(/[^A-Za-z\s]/g, '');
    }
    if (field === 'accountNumber') {
      value = value.replace(/\D/g, '');
    }
    setFieldErrors((prev) => { const e = { ...prev }; delete e[field]; return e; });
    setProfileData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse max-w-lg mx-auto">
          <div className="h-8 bg-slate-200 rounded-xl w-1/3" />
          <div className="h-44 bg-slate-200 rounded-3xl" />
          <div className="h-44 bg-slate-200 rounded-3xl" />
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  const initials = profileData.name
    ? profileData.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'DP';

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
            <h2 className="text-slate-900 text-xl font-black tracking-tight">Delivery Profile</h2>
          </div>

          <button
            onClick={() => fetchProfile(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-3xl p-6 shadow-2xs border border-slate-200/80 text-center space-y-3">
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-600 to-pink-700 flex items-center justify-center text-white text-2xl font-black shadow-sm mb-3">
              {initials}
            </div>

            {isEditing ? (
              <div className="w-full max-w-xs space-y-2">
                <div>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`w-full text-center text-slate-900 text-base font-bold px-3 py-2 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px] ${
                      fieldErrors.name ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                    placeholder="Full Name"
                  />
                  {fieldErrors.name && <p className="text-xs text-rose-600 text-center mt-1 font-semibold">{fieldErrors.name}</p>}
                </div>
                <input
                  type="tel"
                  value={profileData.phone}
                  disabled
                  className="w-full text-center text-slate-400 text-xs font-semibold px-3 py-2 border border-slate-200 rounded-2xl bg-slate-50 cursor-not-allowed min-h-[40px]"
                />
              </div>
            ) : (
              <>
                <h3 className="text-slate-900 text-lg font-black">{profileData.name}</h3>
                <p className="text-slate-500 text-xs font-semibold">{profileData.phone}</p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    ★ {profileData.rating} Rating
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                    {profileData.status} Partner
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* KYC Verification Status */}
        <div className="bg-white rounded-3xl p-5 shadow-2xs border border-slate-200/80 space-y-3">
          <h3 className="text-slate-900 font-black text-sm">KYC & Document Verification</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-2.5">
              <span className="text-xl">🪪</span>
              <div>
                <p className="text-xs font-bold text-slate-800">Driving License</p>
                <span className="text-[10px] font-black text-rose-700">
                  {profileData.hasDrivingLicense ? '✓ Verified' : 'Uploaded'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-2.5">
              <span className="text-xl">📄</span>
              <div>
                <p className="text-xs font-bold text-slate-800">National ID / Aadhaar</p>
                <span className="text-[10px] font-black text-rose-700">
                  {profileData.hasNationalId ? '✓ Verified' : 'Uploaded'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Personal & Vehicle Information */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-slate-900 font-black text-sm">Personal & Vehicle Information</h3>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Email Address</p>
              {isEditing ? (
                <div>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px] ${
                      fieldErrors.email ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                  {fieldErrors.email && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.email}</p>}
                </div>
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.email || 'Not Set'}</p>
              )}
            </div>

            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Residential Address</p>
              {isEditing ? (
                <textarea
                  value={profileData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={2}
                  className="w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none min-h-[50px]"
                />
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.address || 'Not Set'}</p>
              )}
            </div>

            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Vehicle License Number</p>
              {isEditing ? (
                <input
                  type="text"
                  value={profileData.vehicleNumber}
                  onChange={(e) => handleInputChange('vehicleNumber', e.target.value)}
                  className="w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px]"
                  placeholder="e.g. MH12AB1234"
                />
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.vehicleNumber || 'Not Set'}</p>
              )}
            </div>

            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Vehicle Type</p>
              {isEditing ? (
                <select
                  value={profileData.vehicleType}
                  onChange={(e) => handleInputChange('vehicleType', e.target.value)}
                  className="w-full text-slate-900 text-xs sm:text-sm font-bold px-3.5 py-2.5 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px]"
                >
                  <option value="Bike">Bike</option>
                  <option value="Scooter">Scooter</option>
                  <option value="Car">Car</option>
                  <option value="Cycle">Cycle</option>
                </select>
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.vehicleType}</p>
              )}
            </div>
          </div>
        </div>

        {/* Bank & Payout KYC Details */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-slate-900 font-black text-sm">Settlement Bank Details</h3>
            <span className="text-[10px] text-slate-400 font-bold">For Commission Payouts</span>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Account Holder Name</p>
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={profileData.accountName}
                    onChange={(e) => handleInputChange('accountName', e.target.value)}
                    className={`w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px] ${
                      fieldErrors.accountName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                    placeholder="e.g. Ravi Kumar"
                  />
                  {fieldErrors.accountName && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.accountName}</p>}
                </div>
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.accountName || 'Not Set'}</p>
              )}
            </div>

            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Bank Name</p>
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={profileData.bankName}
                    onChange={(e) => handleInputChange('bankName', e.target.value)}
                    className={`w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px] ${
                      fieldErrors.bankName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                    placeholder="e.g. HDFC Bank"
                  />
                  {fieldErrors.bankName && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.bankName}</p>}
                </div>
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.bankName || 'Not Set'}</p>
              )}
            </div>

            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">Account Number</p>
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={profileData.accountNumber}
                    onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                    maxLength={18}
                    className={`w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px] ${
                      fieldErrors.accountNumber ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                    placeholder="9–18 digits"
                  />
                  {fieldErrors.accountNumber && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.accountNumber}</p>}
                </div>
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">
                  {profileData.accountNumber ? `XXXX${profileData.accountNumber.slice(-4)}` : 'Not Set'}
                </p>
              )}
            </div>

            <div className="p-4">
              <p className="text-slate-500 text-xs font-bold mb-1">IFSC Code</p>
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={profileData.ifscCode}
                    onChange={(e) => handleInputChange('ifscCode', e.target.value.toUpperCase())}
                    maxLength={11}
                    className={`w-full text-slate-900 text-xs sm:text-sm font-semibold px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase min-h-[44px] ${
                      fieldErrors.ifscCode ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                    placeholder="e.g. HDFC0001234"
                  />
                  {fieldErrors.ifscCode && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.ifscCode}</p>}
                </div>
              ) : (
                <p className="text-slate-900 text-xs sm:text-sm font-medium">{profileData.ifscCode || 'Not Set'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 p-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Total Deliveries</p>
              <p className="text-slate-900 text-2xl font-black">{profileData.totalDeliveries}</p>
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Partner Since</p>
              <p className="text-slate-900 text-sm font-bold mt-1">{profileData.joinDate}</p>
            </div>
          </div>
        </div>

        {/* Edit / Save Action Bar */}
        {isEditing ? (
          <div className="flex gap-2.5 pt-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 bg-slate-200 text-slate-800 rounded-2xl py-3 text-xs font-bold hover:bg-slate-300 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-rose-600 text-white rounded-2xl py-3 text-xs font-black hover:bg-rose-700 transition-all shadow-xs active:scale-98 min-h-[44px]"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleEdit}
            className="w-full bg-rose-600 text-white rounded-2xl py-3.5 font-black text-xs sm:text-sm hover:bg-rose-700 transition-all shadow-xs active:scale-[0.98] min-h-[44px]"
          >
            ✏️ Edit Profile & Bank Details
          </button>
        )}
      </div>
      <DeliveryBottomNav />
    </div>
  );
}

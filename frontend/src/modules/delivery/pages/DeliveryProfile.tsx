import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { useDeliveryUser } from '../context/DeliveryUserContext';
import { getDeliveryProfile, updateProfile } from '../../../services/api/delivery/deliveryService';

export default function DeliveryProfile() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const { userName, setUserName } = useDeliveryUser();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [profileData, setProfileData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    vehicleNumber: '',
    vehicleType: 'Bike',
    joinDate: '',
    totalDeliveries: 0,
    rating: 0,
    accountName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
  });

  // Fetch profile data on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getDeliveryProfile();
        setProfileData({
          name: data.name,
          phone: data.mobile,
          email: data.email,
          address: data.address,
          vehicleNumber: data.vehicleNumber || '',
          vehicleType: data.vehicleType || 'Bike',
          joinDate: new Date(data.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          totalDeliveries: data.totalDeliveredCount || 0, // Assuming backend sends this or we need to fetch dashboard stats
          rating: 4.8, // Mock for now
          accountName: data.accountName || '',
          bankName: data.bankName || '',
          accountNumber: data.accountNumber || '',
          ifscCode: data.ifscCode || '',
        });
        setUserName(data.name);
      } catch (error) {
        console.error("Failed to fetch profile", error);
      }
    };
    fetchProfile();
  }, [setUserName]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFieldErrors({});
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
      return;
    }

    setFieldErrors({});
    try {
      await updateProfile({
        name: profileData.name,
        email: profileData.email,
        address: profileData.address,
        vehicleNumber: profileData.vehicleNumber,
        vehicleType: profileData.vehicleType,
        accountName: profileData.accountName,
        bankName: profileData.bankName,
        accountNumber: profileData.accountNumber,
        ifscCode: profileData.ifscCode,
      });
      setUserName(profileData.name);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update profile", error);
      setFieldErrors({ _global: 'Failed to update profile. Please try again.' });
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

  return (
    <div className="min-h-screen bg-neutral-100 pb-20">
      <DeliveryHeader />
      <div className="px-4 py-4">
        <div className="flex items-center mb-4">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 p-2 hover:bg-neutral-200 rounded-full transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M15 18L9 12L15 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h2 className="text-neutral-900 text-xl font-semibold">Profile</h2>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-neutral-200 mb-4">
          <div className="flex flex-col items-center mb-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mb-4">
              <span className="text-white text-3xl font-bold">
                {profileData.name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
            {isEditing ? (
              <div className="w-full max-w-xs">
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full text-center text-neutral-900 text-xl font-semibold mb-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${fieldErrors.name ? 'border-red-400' : 'border-neutral-300'}`}
                  placeholder="Full Name"
                />
                {fieldErrors.name && <p className="text-xs text-red-500 text-center mb-1">{fieldErrors.name}</p>}
                <input
                  type="tel"
                  value={profileData.phone}
                  disabled
                  className="w-full text-center text-neutral-400 text-sm px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-50 cursor-not-allowed"
                />
              </div>
            ) : (
              <>
                <h3 className="text-neutral-900 text-xl font-semibold mb-1">{profileData.name}</h3>
                <p className="text-neutral-600 text-sm">{profileData.phone}</p>
              </>
            )}
            <div className="flex items-center gap-1 mt-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  fill="#22c55e"
                />
              </svg>
              <span className="text-neutral-900 font-semibold">{profileData.rating}</span>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-200">
            <h3 className="text-neutral-900 font-semibold">Personal Information</h3>
          </div>
          <div className="divide-y divide-neutral-200">
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Email</p>
              {isEditing ? (
                <>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`w-full text-neutral-900 text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${fieldErrors.email ? 'border-red-400' : 'border-neutral-300'}`}
                  />
                  {fieldErrors.email && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.email}</p>}
                </>
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.email}</p>
              )}
            </div>
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Address</p>
              {isEditing ? (
                <textarea
                  value={profileData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  rows={2}
                  className="w-full text-neutral-900 text-sm px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.address}</p>
              )}
            </div>
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Vehicle Number</p>
              {isEditing ? (
                <input
                  type="text"
                  value={profileData.vehicleNumber}
                  onChange={(e) => handleInputChange('vehicleNumber', e.target.value)}
                  className="w-full text-neutral-900 text-sm px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.vehicleNumber}</p>
              )}
            </div>
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Vehicle Type</p>
              {isEditing ? (
                <select
                  value={profileData.vehicleType}
                  onChange={(e) => handleInputChange('vehicleType', e.target.value)}
                  className="w-full text-neutral-900 text-sm px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="Bike">Bike</option>
                  <option value="Scooter">Scooter</option>
                  <option value="Car">Car</option>
                  <option value="Cycle">Cycle</option>
                </select>
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.vehicleType}</p>
              )}
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden mt-4">
          <div className="p-4 border-b border-neutral-200">
            <h3 className="text-neutral-900 font-semibold">Bank Details</h3>
          </div>
          <div className="divide-y divide-neutral-200">
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Account Holder Name</p>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={profileData.accountName}
                    onChange={(e) => handleInputChange('accountName', e.target.value)}
                    className={`w-full text-neutral-900 text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${fieldErrors.accountName ? 'border-red-400' : 'border-neutral-300'}`}
                    placeholder="Letters only (e.g. Ravi Kumar)"
                  />
                  {fieldErrors.accountName && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.accountName}</p>}
                </>
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.accountName || 'Not Set'}</p>
              )}
            </div>
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Bank Name</p>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={profileData.bankName}
                    onChange={(e) => handleInputChange('bankName', e.target.value)}
                    className={`w-full text-neutral-900 text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${fieldErrors.bankName ? 'border-red-400' : 'border-neutral-300'}`}
                    placeholder="e.g. HDFC Bank"
                  />
                  {fieldErrors.bankName && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.bankName}</p>}
                </>
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.bankName || 'Not Set'}</p>
              )}
            </div>
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">Account Number</p>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={profileData.accountNumber}
                    onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                    maxLength={18}
                    className={`w-full text-neutral-900 text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${fieldErrors.accountNumber ? 'border-red-400' : 'border-neutral-300'}`}
                    placeholder="9–18 digits"
                  />
                  {fieldErrors.accountNumber && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.accountNumber}</p>}
                </>
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.accountNumber ? `XXXX${profileData.accountNumber.slice(-4)}` : 'Not Set'}</p>
              )}
            </div>
            <div className="p-4">
              <p className="text-neutral-500 text-xs mb-1">IFSC Code</p>
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={profileData.ifscCode}
                    onChange={(e) => handleInputChange('ifscCode', e.target.value.toUpperCase())}
                    maxLength={11}
                    className={`w-full text-neutral-900 text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${fieldErrors.ifscCode ? 'border-red-400' : 'border-neutral-300'}`}
                    placeholder="e.g. HDFC0001234"
                  />
                  {fieldErrors.ifscCode && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.ifscCode}</p>}
                </>
              ) : (
                <p className="text-neutral-900 text-sm">{profileData.ifscCode || 'Not Set'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mt-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-neutral-500 text-xs mb-1">Total Deliveries</p>
              <p className="text-neutral-900 text-2xl font-bold">{profileData.totalDeliveries}</p>
            </div>
            <div className="text-center">
              <p className="text-neutral-500 text-xs mb-1">Joined On</p>
              <p className="text-neutral-900 text-sm font-semibold">{profileData.joinDate}</p>
            </div>
          </div>
        </div>

        {/* Edit/Save/Cancel Buttons */}
        {fieldErrors._global && (
          <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{fieldErrors._global}</div>
        )}
        {isEditing ? (
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCancel}
              className="flex-1 bg-neutral-200 text-neutral-900 rounded-xl py-3 font-semibold hover:bg-neutral-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-orange-500 text-white rounded-xl py-3 font-semibold hover:bg-orange-600 transition-colors"
            >
              Save Changes
            </button>
          </div>
        ) : (
          <button
            onClick={handleEdit}
            className="w-full mt-4 bg-orange-500 text-white rounded-xl py-3 font-semibold hover:bg-orange-600 transition-colors"
          >
            Edit Profile
          </button>
        )}
      </div>
      <DeliveryBottomNav />
    </div>
  );
}


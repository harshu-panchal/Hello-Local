import React, { useState, useEffect } from 'react';
import { getSellerProfile, updateSellerProfile } from '../../../services/api/auth/sellerAuthService';
import { useAuth } from '../../../context/AuthContext';
import { getCategories, Category } from '../../../services/api/categoryService';
import GoogleMapsAutocomplete from '../../../components/GoogleMapsAutocomplete';
import LocationPickerMap from '../../../components/LocationPickerMap';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerTabs } from '../components/common/SellerTabs';
import { SellerCard } from '../components/common/SellerCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerFormField } from '../components/common/SellerFormField';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';

export default function SellerAccountSettings() {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [sellerData, setSellerData] = useState({
    sellerName: '',
    email: '',
    mobile: '',
    storeName: '',
    category: '',
    address: '',
    city: '',
    searchLocation: '',
    latitude: '',
    longitude: '',
    serviceRadiusKm: '10',
    panCard: '',
    taxName: '',
    taxNumber: '',
    accountName: '',
    bankName: '',
    branch: '',
    accountNumber: '',
    ifsc: '',
    profile: '',
    logo: '',
    storeBanner: '',
    storeDescription: '',
    commission: 0,
    status: '',
  });

  useEffect(() => {
    fetchProfile();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await getCategories();
      if (res.success) setCategories(res.data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await getSellerProfile();
      if (response.success) {
        const data = response.data;
        const locationCoords = data.location?.coordinates || [];
        setSellerData({
          ...data,
          latitude: data.latitude || (locationCoords[1]?.toString() || ''),
          longitude: data.longitude || (locationCoords[0]?.toString() || ''),
          searchLocation: data.searchLocation || data.address || '',
          serviceRadiusKm: (data.serviceRadiusKm || 10).toString(),
        });
      } else {
        setError(response.message || 'Failed to fetch profile');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error loading profile');
    } finally {
      setLoading(false);
    }
  };

  const validateField = (name: string, value: string): string => {
    const v = (value || '').trim();
    switch (name) {
      case 'sellerName':
        if (!v) return 'Seller name is required';
        if (!/^[A-Za-z\s]+$/.test(v)) return 'Name should contain only alphabets';
        return '';
      case 'email':
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
        return '';
      case 'mobile':
        if (v && !/^[6-9]\d{9}$/.test(v)) return 'Enter a valid 10-digit mobile number starting with 6-9';
        return '';
      case 'storeName':
        if (!v) return 'Store name is required';
        return '';
      case 'city':
        if (v && !/^[A-Za-z\s]+$/.test(v)) return 'City should contain only alphabets';
        return '';
      case 'accountName':
        if (v && !/^[A-Za-z\s]+$/.test(v)) return 'Account name should contain only alphabets';
        return '';
      case 'bankName':
        if (v && !/^[A-Za-z\s]+$/.test(v)) return 'Bank name should contain only alphabets';
        return '';
      case 'accountNumber':
        if (v && !/^\d{9,18}$/.test(v)) return 'Account number should be 9 to 18 digits';
        return '';
      case 'ifsc':
        if (v && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v)) return 'Invalid IFSC (e.g. SBIN0000456)';
        return '';
      case 'panCard':
        if (v && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v)) return 'Invalid PAN (e.g. ASEFG1234D)';
        return '';
      case 'taxNumber':
        if (v && !/^\d{10,20}$/.test(v)) return 'Tax number should be 10 to 20 digits';
        return '';
      default:
        return '';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let finalValue = value;
    if (name === 'accountNumber') finalValue = value.replace(/\D/g, '').slice(0, 18);
    else if (name === 'ifsc' || name === 'panCard') finalValue = value.toUpperCase();
    else if (name === 'taxNumber') finalValue = value.replace(/\D/g, '').slice(0, 20);
    setSellerData((prev) => ({ ...prev, [name]: finalValue }));
    const err = validateField(name, finalValue);
    setFieldErrors((prev) => ({ ...prev, [name]: err }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaveLoading(true);
      setError('');
      setSuccessMsg(null);

      const fieldsToCheck = ['sellerName', 'email', 'mobile', 'storeName', 'city', 'accountName', 'bankName', 'accountNumber', 'ifsc', 'panCard', 'taxNumber'];
      const newErrors: Record<string, string> = {};
      fieldsToCheck.forEach((f) => {
        const msg = validateField(f, (sellerData as any)[f] || '');
        if (msg) newErrors[f] = msg;
      });
      if (Object.keys(newErrors).length > 0) {
        setFieldErrors(newErrors);
        setError('Please fix the highlighted fields before saving');
        setSaveLoading(false);
        return;
      }

      if (sellerData.searchLocation && (!sellerData.latitude || !sellerData.longitude)) {
        setError('Please select a valid location using the map picker');
        setSaveLoading(false);
        return;
      }

      const radius = parseFloat(sellerData.serviceRadiusKm);
      if (isNaN(radius) || radius < 0.1 || radius > 100) {
        setError('Service radius must be between 0.1 and 100 kilometers');
        setSaveLoading(false);
        return;
      }

      const updateData = {
        ...sellerData,
        serviceRadiusKm: radius,
      };

      const response = await updateSellerProfile(updateData);
      if (response.success) {
        setIsEditing(false);
        setSuccessMsg('Account settings updated successfully!');
        const data = response.data;
        const locationCoords = data.location?.coordinates || [];
        setSellerData({
          ...data,
          latitude: data.latitude || (locationCoords[1]?.toString() || ''),
          longitude: data.longitude || (locationCoords[0]?.toString() || ''),
          searchLocation: data.searchLocation || data.address || '',
          serviceRadiusKm: (data.serviceRadiusKm || 10).toString(),
        });
        if (updateUser) {
          updateUser({
            ...user,
            ...data,
            id: data._id || user?.id,
          });
        }
      } else {
        setError(response.message || 'Failed to update profile');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error updating profile');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLocationSelect = (place: { address: string; latitude: number; longitude: number }) => {
    setSellerData((prev) => ({
      ...prev,
      address: place.address,
      searchLocation: place.address,
      latitude: place.latitude.toString(),
      longitude: place.longitude.toString(),
    }));
  };

  const handleCoordinatesChange = (lat: number, lng: number) => {
    setSellerData((prev) => ({
      ...prev,
      latitude: lat.toString(),
      longitude: lng.toString(),
    }));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <SellerPageHeader
        title="Account & Store Settings"
        subtitle="Manage business identity, store location on Google Maps, and bank payout credentials."
        breadcrumbs={[
          { label: "Profile", path: "/seller/profile" },
          { label: "Account Settings" },
        ]}
        action={
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <SellerButton
                variant="primary"
                size="md"
                onClick={() => setIsEditing(true)}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                }
              >
                Edit Settings
              </SellerButton>
            ) : (
              <SellerButton
                variant="outline"
                size="md"
                onClick={() => {
                  setIsEditing(false);
                  fetchProfile();
                }}
              >
                Cancel
              </SellerButton>
            )}
          </div>
        }
      />

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold">
          ✓ {successMsg}
        </div>
      )}

      {/* Settings Tab Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 sm:p-3 shadow-xs">
        <SellerTabs
          tabs={[
            { id: 'profile', label: 'Owner Profile' },
            { id: 'store', label: 'Store Info' },
            { id: 'bank', label: 'Bank & Tax Details' },
            { id: 'location', label: 'Map & Delivery Radius' },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab)}
        />
      </div>

      {loading ? (
        <div className="h-64 bg-slate-200 rounded-3xl animate-pulse" />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* TAB 1: OWNER PROFILE */}
          {activeTab === 'profile' && (
            <SellerCard title="Owner & Personal Details">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SellerFormField label="Seller Full Name" error={fieldErrors.sellerName} required>
                  <input
                    type="text"
                    name="sellerName"
                    value={sellerData.sellerName}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="Email Address" error={fieldErrors.email} required>
                  <input
                    type="email"
                    name="email"
                    value={sellerData.email}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="Registered Mobile Number" error={fieldErrors.mobile} required>
                  <input
                    type="tel"
                    name="mobile"
                    value={sellerData.mobile}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="Verification Status">
                  <div className="pt-1.5">
                    <SellerStatusBadge status={sellerData.status || 'Approved'} size="md" />
                  </div>
                </SellerFormField>
              </div>
            </SellerCard>
          )}

          {/* TAB 2: STORE INFO */}
          {activeTab === 'store' && (
            <SellerCard title="Store Profile & Categorization">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SellerFormField label="Store Display Name" error={fieldErrors.storeName} required>
                  <input
                    type="text"
                    name="storeName"
                    value={sellerData.storeName}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="Primary Category">
                  <select
                    name="category"
                    value={sellerData.category}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </SellerFormField>

                <div className="md:col-span-2">
                  <SellerFormField label="Store Address">
                    <input
                      type="text"
                      name="address"
                      value={sellerData.address}
                      disabled={!isEditing}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                    />
                  </SellerFormField>
                </div>

                <SellerFormField label="City" error={fieldErrors.city}>
                  <input
                    type="text"
                    name="city"
                    value={sellerData.city}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <div className="md:col-span-2">
                  <SellerFormField label="Store Bio / Description">
                    <textarea
                      rows={3}
                      name="storeDescription"
                      value={sellerData.storeDescription}
                      disabled={!isEditing}
                      onChange={handleInputChange}
                      placeholder="Tell local buyers about your store specialities..."
                      className="w-full rounded-xl border border-slate-300 p-3 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50"
                    />
                  </SellerFormField>
                </div>
              </div>
            </SellerCard>
          )}

          {/* TAB 3: BANK & TAX */}
          {activeTab === 'bank' && (
            <SellerCard title="Bank Account & Tax Credentials">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SellerFormField label="Bank Account Holder Name" error={fieldErrors.accountName}>
                  <input
                    type="text"
                    name="accountName"
                    value={sellerData.accountName}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="Bank Name" error={fieldErrors.bankName}>
                  <input
                    type="text"
                    name="bankName"
                    value={sellerData.bankName}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="Account Number" error={fieldErrors.accountNumber}>
                  <input
                    type="text"
                    name="accountNumber"
                    value={sellerData.accountNumber}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="IFSC Code" error={fieldErrors.ifsc}>
                  <input
                    type="text"
                    name="ifsc"
                    value={sellerData.ifsc}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    placeholder="e.g. SBIN0000456"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="PAN Card Number" error={fieldErrors.panCard}>
                  <input
                    type="text"
                    name="panCard"
                    value={sellerData.panCard}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    placeholder="e.g. ABCDE1234F"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>

                <SellerFormField label="GST / Tax Number" error={fieldErrors.taxNumber}>
                  <input
                    type="text"
                    name="taxNumber"
                    value={sellerData.taxNumber}
                    disabled={!isEditing}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-mono text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                  />
                </SellerFormField>
              </div>
            </SellerCard>
          )}

          {/* TAB 4: LOCATION & MAP */}
          {activeTab === 'location' && (
            <SellerCard title="Store Location & Delivery Service Area">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <SellerFormField label="Search Location on Google Maps">
                      {isEditing ? (
                        <GoogleMapsAutocomplete
                          value={sellerData.searchLocation || sellerData.address}
                          onChange={(address, lat, lng) => {
                            setSellerData((prev) => ({
                              ...prev,
                              address,
                              searchLocation: address,
                              latitude: lat.toString(),
                              longitude: lng.toString(),
                            }));
                          }}
                          placeholder="Search landmark, street, or address..."
                          className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                        />
                      ) : (
                        <p className="text-xs sm:text-sm font-bold text-slate-800 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                          {sellerData.searchLocation || sellerData.address || 'Location not specified'}
                        </p>
                      )}
                    </SellerFormField>
                  </div>

                  <SellerFormField label="Service Radius (Kilometers)" required>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      max="100"
                      name="serviceRadiusKm"
                      value={sellerData.serviceRadiusKm}
                      disabled={!isEditing}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 disabled:bg-slate-50 min-h-[42px]"
                    />
                  </SellerFormField>

                  <SellerFormField label="Coordinates (Lat / Long)">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-600">
                      {sellerData.latitude && sellerData.longitude
                        ? `${parseFloat(sellerData.latitude).toFixed(5)}, ${parseFloat(sellerData.longitude).toFixed(5)}`
                        : 'No coordinates pinned'}
                    </div>
                  </SellerFormField>
                </div>

                {/* Map Picker */}
                {sellerData.latitude && sellerData.longitude && (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden h-72 sm:h-96">
                    <LocationPickerMap
                      initialLat={parseFloat(sellerData.latitude) || 19.033}
                      initialLng={parseFloat(sellerData.longitude) || 73.0297}
                      onLocationSelect={(lat, lng) => {
                        setSellerData((prev) => ({
                          ...prev,
                          latitude: lat.toString(),
                          longitude: lng.toString(),
                        }));
                      }}
                      height="100%"
                    />
                  </div>
                )}
              </div>
            </SellerCard>
          )}

          {/* Save Action Footer */}
          {isEditing && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <SellerButton
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setIsEditing(false);
                  fetchProfile();
                }}
              >
                Cancel
              </SellerButton>
              <SellerButton
                type="submit"
                variant="primary"
                size="lg"
                disabled={saveLoading}
                isLoading={saveLoading}
              >
                Save Settings
              </SellerButton>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

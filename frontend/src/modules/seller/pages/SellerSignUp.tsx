import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register, sendOTP, verifyOTP } from '../../../services/api/auth/sellerAuthService';
import OTPInput from '../../../components/OTPInput';
import GoogleMapsAutocomplete from '../../../components/GoogleMapsAutocomplete';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getHeaderCategoriesPublic, HeaderCategory } from '../../../services/api/headerCategoryService';
import LocationPickerMap from '../../../components/LocationPickerMap';
import { normalizeMobile } from '../../../utils/phone';
import LegalPolicyModal, { PolicyTab } from '../../../components/LegalPolicyModal';
import { SellerButton } from '../components/common/SellerButton';
import { SellerFormField } from '../components/common/SellerFormField';
import { SellerCard } from '../components/common/SellerCard';

export default function SellerSignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    sellerName: '',
    mobile: '',
    email: '',
    storeName: '',
    category: '',
    categories: [] as string[],
    address: '',
    city: '',
    panCard: '',
    taxName: '',
    taxNumber: '',
    searchLocation: '',
    latitude: '',
    longitude: '',
    serviceRadiusKm: '10',
    accountName: '',
    bankName: '',
    branch: '',
    accountNumber: '',
    ifsc: '',
  });
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<HeaderCategory[]>([]);
  const [policyTab, setPolicyTab] = useState<PolicyTab | null>(null);

  const validateField = (name: string, value: string): string => {
    const v = (value || '').trim();
    switch (name) {
      case 'sellerName':
        if (!v) return 'Seller name is required';
        if (!/^[A-Za-z\s]+$/.test(v)) return 'Name should contain only alphabets';
        return '';
      case 'mobile':
        if (!v) return 'Mobile number is required';
        if (!/^\d{10}$/.test(v)) return 'Enter a valid 10-digit mobile number';
        if (!/^[6-9]/.test(v)) return 'Mobile number must start with 6, 7, 8, or 9';
        return '';
      case 'email':
        if (!v) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
        return '';
      case 'storeName':
        if (!v) return 'Store name is required';
        return '';
      case 'city':
        if (!v) return 'City is required';
        if (!/^[A-Za-z\s]+$/.test(v)) return 'City should contain only alphabets';
        return '';
      case 'serviceRadiusKm': {
        const radius = parseFloat(v);
        if (!v) return 'Service radius is required';
        if (isNaN(radius) || radius < 0.1 || radius > 100) return 'Radius must be between 0.1 and 100 km';
        return '';
      }
      case 'panCard':
        if (v && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v)) return 'Invalid PAN (e.g. ASEFG1234D)';
        return '';
      case 'taxNumber':
        if (v && !/^\d{10,20}$/.test(v)) return 'Tax number should be 10 to 20 digits';
        return '';
      case 'ifsc':
        if (v && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v)) return 'Invalid IFSC (e.g. SBIN0000456)';
        return '';
      default:
        return '';
    }
  };

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await getHeaderCategoriesPublic();
        if (Array.isArray(res)) {
          setCategories(res.filter((cat) => cat.status === 'Published'));
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCats();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (name === 'mobile') {
      finalValue = normalizeMobile(value);
    } else if (name === 'serviceRadiusKm') {
      const cleanedValue = value.replace(/[^0-9.]/g, '');
      const parts = cleanedValue.split('.');
      finalValue = parts.length > 2 ? `${parts[0]}.${parts[1]}` : cleanedValue;
    } else if (name === 'panCard' || name === 'ifsc') {
      finalValue = value.toUpperCase();
    } else if (name === 'taxNumber') {
      finalValue = value.replace(/\D/g, '');
    }

    setFormData((prev) => ({ ...prev, [name]: finalValue }));
    const err = validateField(name, finalValue);
    setFieldErrors((prev) => ({ ...prev, [name]: err }));
  };

  const handleCategoryToggle = (categoryName: string) => {
    setFormData((prev) => {
      const current = prev.categories || [];
      const updated = current.includes(categoryName)
        ? current.filter((c) => c !== categoryName)
        : [...current, categoryName];
      return {
        ...prev,
        categories: updated,
        category: updated[0] || '',
      };
    });
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredFields = ['sellerName', 'mobile', 'email', 'storeName', 'city', 'serviceRadiusKm'];
    const newErrors: Record<string, string> = {};
    requiredFields.forEach((field) => {
      const msg = validateField(field, (formData as any)[field] || '');
      if (msg) newErrors[field] = msg;
    });

    if (!formData.address && !formData.searchLocation) {
      newErrors.address = 'Store address is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      const msg = 'Please fix highlighted errors before proceeding';
      setError(msg);
      showToast(msg, 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendOTP(formData.mobile);
      if (response.success) {
        setShowOTP(true);
        showToast('Verification OTP sent successfully!', 'success');
      } else {
        const msg = response.message || 'Failed to send OTP';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const verifyRes = await verifyOTP(formData.mobile, otp);
      if (verifyRes.success) {
        const registerPayload = {
          ...formData,
          serviceRadiusKm: parseFloat(formData.serviceRadiusKm) || 10,
        };
        const regRes = await register(registerPayload);
        if (regRes.success && regRes.data) {
          showToast('Registration successful! Welcome to HelloLocal.', 'success');
          login(regRes.data.token, {
            id: regRes.data.user.id,
            name: regRes.data.user.sellerName,
            email: regRes.data.user.email,
            phone: regRes.data.user.mobile,
            userType: 'Seller',
            storeName: regRes.data.user.storeName,
            status: regRes.data.user.status,
            address: (regRes.data.user as any)?.address || formData.address,
            city: (regRes.data.user as any)?.city || formData.city,
          });
          navigate('/seller', { replace: true });
        } else {
          const msg = regRes.message || 'Registration failed';
          setError(msg);
          showToast(msg, 'error');
        }
      } else {
        const msg = verifyRes.message || 'Invalid OTP code';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration verification failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-3xl w-full mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2D1B69] to-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md">
            HL
          </div>
          <span className="text-base font-black text-slate-900 tracking-tight">
            Hello<span className="text-purple-600">Local</span> Partner
          </span>
        </Link>
        <Link to="/seller/login" className="text-xs sm:text-sm font-bold text-purple-600 hover:underline min-h-[44px] flex items-center">
          Already a seller? Log In
        </Link>
      </div>

      {/* Main Registration Form */}
      <div className="max-w-3xl w-full mx-auto my-6 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 space-y-6">
        <div className="space-y-1 text-center max-w-md mx-auto">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Register Your Local Store
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Join HelloLocal and start accepting 10-minute grocery and retail orders in your area.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold text-center">
            {error}
          </div>
        )}

        {!showOTP ? (
          <form onSubmit={handleInitialSubmit} className="space-y-6">
            {/* Step 1: Owner Details */}
            <SellerCard title="1. Store Owner Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SellerFormField label="Full Name" error={fieldErrors.sellerName} required>
                  <input
                    type="text"
                    name="sellerName"
                    value={formData.sellerName}
                    onChange={handleInputChange}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                  />
                </SellerFormField>

                <SellerFormField label="Mobile (For OTP & Orders)" error={fieldErrors.mobile} required>
                  <input
                    type="tel"
                    name="mobile"
                    maxLength={10}
                    value={formData.mobile}
                    onChange={handleInputChange}
                    placeholder="10-digit number"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                  />
                </SellerFormField>

                <div className="md:col-span-2">
                  <SellerFormField label="Business Email" error={fieldErrors.email} required>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="rajesh.store@gmail.com"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>
                </div>
              </div>
            </SellerCard>

            {/* Step 2: Store & Category */}
            <SellerCard title="2. Store Details & Categories">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SellerFormField label="Store Display Name" error={fieldErrors.storeName} required>
                    <input
                      type="text"
                      name="storeName"
                      value={formData.storeName}
                      onChange={handleInputChange}
                      placeholder="e.g. Sharma Supermarket"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>

                  <SellerFormField label="City" error={fieldErrors.city} required>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="e.g. Navi Mumbai"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>
                </div>

                <SellerFormField label="Select Product Categories Sold">
                  <div className="flex flex-wrap gap-2 pt-1">
                    {categories.map((c) => {
                      const isSelected = formData.categories.includes(c.name);
                      return (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => handleCategoryToggle(c.name)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {c.name} {isSelected && '✓'}
                        </button>
                      );
                    })}
                  </div>
                </SellerFormField>
              </div>
            </SellerCard>

            {/* Step 3: Location & Delivery Radius */}
            <SellerCard title="3. Location & Delivery Radius">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <SellerFormField label="Store Address / Search on Map" error={fieldErrors.address} required>
                      <GoogleMapsAutocomplete
                        value={formData.searchLocation || formData.address}
                        onChange={(address, lat, lng) => {
                          setFormData((prev) => ({
                            ...prev,
                            address,
                            searchLocation: address,
                            latitude: lat.toString(),
                            longitude: lng.toString(),
                          }));
                        }}
                        placeholder="Search landmark, street, or full shop address..."
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                      />
                    </SellerFormField>
                  </div>

                  <SellerFormField label="Service Radius (KM)" error={fieldErrors.serviceRadiusKm} required>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      max="100"
                      name="serviceRadiusKm"
                      value={formData.serviceRadiusKm}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>
                </div>

                {formData.latitude && formData.longitude && (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden h-64">
                    <LocationPickerMap
                      initialLat={parseFloat(formData.latitude) || 19.033}
                      initialLng={parseFloat(formData.longitude) || 73.0297}
                      onLocationSelect={(lat, lng) => {
                        setFormData((prev) => ({
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

            {/* Submit Button */}
            <SellerButton
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              isLoading={loading}
              className="min-h-[44px]"
            >
              Verify Mobile & Complete Registration
            </SellerButton>
          </form>
        ) : (
          /* OTP Screen (4-Digit) */
          <div className="space-y-6 py-4 max-w-md mx-auto">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">Enter Verification Code</h3>
              <p className="text-xs text-slate-500">
                We sent a 4-digit OTP code to <strong>+91 {formData.mobile}</strong>
              </p>
            </div>

            <div className="flex justify-center py-2">
              <OTPInput length={4} onComplete={handleOTPComplete} disabled={loading} />
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowOTP(false)}
                className="text-xs font-bold text-slate-600 hover:underline min-h-[44px] flex items-center"
              >
                ← Back to Edit Details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Policies Footer */}
      <div className="max-w-3xl w-full mx-auto text-center space-y-2 text-[11px] text-slate-400 font-medium">
        <p>
          By creating an account, you agree to our{' '}
          <button onClick={() => setPolicyTab('terms')} className="text-slate-600 font-bold hover:underline">
            Seller Terms & Conditions
          </button>{' '}
          and{' '}
          <button onClick={() => setPolicyTab('privacy')} className="text-slate-600 font-bold hover:underline">
            Privacy Policy
          </button>
        </p>
      </div>

      {policyTab && (
        <LegalPolicyModal
          initialTab={policyTab}
          open={Boolean(policyTab)}
          onClose={() => setPolicyTab(null)}
        />
      )}
    </div>
  );
}

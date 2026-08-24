import { useState, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useLocation as useGlobalLocation } from '../../hooks/useLocation';
import { OrderAddress } from '../../types/order';
import { getAddresses, addAddress, updateAddress, Address } from '../../services/api/customerAddressService';
import GoogleMapsLocationPicker from '../../components/GoogleMapsLocationPicker';
import { ArrowLeftIcon, LocationPinIcon, HomeNavIcon, CloseIcon } from './components/common/UserIcons';

export default function CheckoutAddress() {
  const { cart } = useCart();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { location: globalLocation, updateLocation: updateGlobalLocation } = useGlobalLocation();

  const editAddress = (location.state as any)?.editAddress as OrderAddress | undefined;

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<OrderAddress>({
    name: editAddress?.name || '',
    phone: editAddress?.phone || '',
    flat: editAddress?.flat || '',
    street: editAddress?.street || '',
    city: editAddress?.city || '',
    pincode: editAddress?.pincode || '',
    state: editAddress?.state || '',
    landmark: editAddress?.landmark || '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof OrderAddress, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [orderingFor, setOrderingFor] = useState<'myself' | 'someone-else'>('myself');
  const [addressType, setAddressType] = useState<'home' | 'work' | 'hotel' | 'other'>('home');

  const [selectedLatitude, setSelectedLatitude] = useState<number>(0);
  const [selectedLongitude, setSelectedLongitude] = useState<number>(0);

  useEffect(() => {
    if (globalLocation?.latitude && globalLocation?.longitude && !selectedLatitude) {
      setSelectedLatitude(globalLocation.latitude);
      setSelectedLongitude(globalLocation.longitude);
    }
  }, [globalLocation, selectedLatitude]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  useEffect(() => {
    if (isAuthenticated) {
      const fetchAddresses = async () => {
        try {
          const response = await getAddresses();
          if (response.success && Array.isArray(response.data)) {
            setSavedAddresses(response.data);

            if (!editAddress) {
              const homeAddr = response.data.find(a => a.type === 'Home');
              if (homeAddr) {
                const parts = homeAddr.address.split(', ');
                setAddress({
                  name: homeAddr.fullName,
                  phone: homeAddr.phone,
                  flat: parts[0] || '',
                  street: parts[1] || '',
                  city: homeAddr.city,
                  state: homeAddr.state || '',
                  pincode: homeAddr.pincode,
                  landmark: homeAddr.landmark || '',
                  id: homeAddr._id,
                });
              }
            }
          }
        } catch (error) {
          console.error('Error fetching addresses:', error);
        }
      };
      fetchAddresses();
    }
  }, [isAuthenticated, editAddress]);

  useEffect(() => {
    if (!editAddress && savedAddresses.length > 0) {
      const typeLabel = addressType.charAt(0).toUpperCase() + addressType.slice(1) as any;
      const existingAddr = savedAddresses.find(a => a.type === typeLabel);

      if (existingAddr) {
        const parts = existingAddr.address.split(', ');
        setAddress({
          name: existingAddr.fullName,
          phone: existingAddr.phone,
          flat: parts[0] || '',
          street: parts[1] || '',
          city: existingAddr.city,
          state: existingAddr.state || '',
          pincode: existingAddr.pincode,
          landmark: existingAddr.landmark || '',
          id: existingAddr._id,
        });
      } else {
        setAddress(prev => ({
          ...prev,
          flat: '',
          street: '',
          city: '',
          state: '',
          pincode: '',
          landmark: '',
          id: undefined,
          _id: undefined,
        }));
      }
    }
  }, [addressType, savedAddresses, editAddress]);

  useEffect(() => {
    if (editAddress) {
      setAddress({
        name: editAddress.name || '',
        phone: editAddress.phone || '',
        flat: editAddress.flat || '',
        street: editAddress.street || '',
        city: editAddress.city || '',
        pincode: editAddress.pincode || '',
        state: editAddress.state || '',
        landmark: editAddress.landmark || '',
      });

      if ((editAddress as any).type) {
        setAddressType((editAddress as any).type.toLowerCase());
      }
    }
  }, [editAddress]);

  const validateField = (field: keyof OrderAddress, value: string): string => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'Name should only contain letters';
        return '';
      case 'phone':
        if (!value.trim()) return 'Mobile number is required';
        if (!/^[6-9]\d{9}$/.test(value.trim())) return 'Enter a valid 10-digit mobile number';
        return '';
      case 'flat':
        if (!value.trim()) return 'House/Flat details are required';
        return '';
      case 'street':
        if (!value.trim()) return 'Street/Area is required';
        if (value.trim().length < 3) return 'Street address is too short';
        return '';
      case 'city':
        if (!value.trim()) return 'City is required';
        if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'City should only contain letters';
        return '';
      case 'state':
        if (!value.trim()) return 'State is required';
        if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'State should only contain letters';
        return '';
      case 'pincode':
        if (!value.trim()) return 'Pincode is required';
        if (!/^\d{6}$/.test(value.trim())) return 'Enter a valid 6-digit PIN code';
        return '';
      default:
        return '';
    }
  };

  const handleInputChange = (field: keyof OrderAddress, value: string) => {
    setAddress(prev => ({ ...prev, [field]: value }));
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleSaveAddress = async () => {
    const fieldsToValidate: (keyof OrderAddress)[] = ['name', 'phone', 'flat', 'street', 'city', 'state', 'pincode'];
    const newErrors: Partial<Record<keyof OrderAddress, string>> = {};
    let hasError = false;

    fieldsToValidate.forEach(field => {
      const val = address[field] ? String(address[field]) : '';
      const error = validateField(field, val);
      if (error) {
        newErrors[field] = error;
        hasError = true;
      }
    });

    setErrors(newErrors);

    if (hasError) {
      showToast('Please fix the errors before continuing', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const finalLat = selectedLatitude || globalLocation?.latitude;
      const finalLng = selectedLongitude || globalLocation?.longitude;

      const formattedType = (addressType.charAt(0).toUpperCase() + addressType.slice(1)) as 'Home' | 'Work' | 'Hotel' | 'Other';

      const payload: Partial<Address> & { flat?: string; street?: string } = {
        fullName: address.name,
        phone: address.phone,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark || undefined,
        type: formattedType,
        address: `${address.flat}, ${address.street}`,
        latitude: finalLat,
        longitude: finalLng,
      };

      if (editAddress && (editAddress.id || editAddress._id)) {
        const addressId = editAddress.id || editAddress._id;
        await updateAddress(addressId!, payload);
      } else {
        await addAddress(payload);
      }

      if (finalLat && finalLng) {
        await updateGlobalLocation({
          latitude: finalLat,
          longitude: finalLng,
          address: `${address.flat}, ${address.street}, ${address.city}, ${address.state}`,
          city: address.city,
          state: address.state,
          pincode: address.pincode
        });
      }

      setTimeout(() => {
        setIsSaving(false);
        navigate('/checkout', { replace: true });
      }, 400);
    } catch (error) {
      console.error('Error saving address:', error);
      setIsSaving(false);
    }
  };

  const isFormValid =
    /^[A-Za-z\s]{2,}$/.test(address.name.trim()) &&
    /^[6-9]\d{9}$/.test(address.phone) &&
    address.flat.trim() !== '' &&
    address.street.trim().length >= 3 &&
    /^[A-Za-z\s]+$/.test(address.city.trim()) &&
    /^[A-Za-z\s]+$/.test((address.state || '').trim()) &&
    /^\d{6}$/.test(address.pincode);

  return (
    <div className="pb-28 md:pb-16 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-2xs">
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
            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              {editAddress ? 'Edit Address' : 'Add Delivery Address'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-4">
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start space-y-4 lg:space-y-0">
          {/* Left Column: Map & Address Type */}
          <div className="lg:col-span-6 xl:col-span-5 space-y-3.5 lg:sticky lg:top-20">
            {/* Map Location Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs overflow-hidden">
              <div className="flex items-center gap-1.5 mb-1.5">
                <LocationPinIcon size={16} className="text-[#FF2E7A]" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Pin Location on Map</h3>
              </div>
              <p className="text-[10px] text-slate-400 mb-2.5 font-medium">
                Drag the pin to adjust your exact doorstep location.
              </p>
              <div className="rounded-xl overflow-hidden border border-slate-200">
                <GoogleMapsLocationPicker
                  initialLat={selectedLatitude || globalLocation?.latitude || 28.6139}
                  initialLng={selectedLongitude || globalLocation?.longitude || 77.2090}
                  onLocationSelect={(lat, lng, addr) => {
                    setSelectedLatitude(lat);
                    setSelectedLongitude(lng);
                    if (addr) {
                      setAddress(prev => ({
                        ...prev,
                        street: addr.street || prev.street,
                        city: addr.city || prev.city,
                        state: addr.state || prev.state,
                        pincode: addr.pincode || prev.pincode,
                        landmark: addr.landmark || prev.landmark
                      }));
                    }
                  }}
                  height="220px"
                />
              </div>
            </div>

            {/* Ordering For */}
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs">
              <p className="text-xs font-bold text-slate-900 mb-2">Who are you ordering for?</p>
              <div className="flex items-center gap-2">
                {[
                  { id: 'myself', label: 'Myself' },
                  { id: 'someone-else', label: 'Someone else' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOrderingFor(opt.id as any)}
                    className={`flex-1 py-1.5 px-3 rounded-xl border text-xs font-bold transition-all touch-target-min ${
                      orderingFor === opt.id
                        ? 'border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save Address As */}
            {orderingFor === 'myself' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-2xs">
                <label className="block text-xs font-bold text-slate-900 mb-2">
                  Save Address As <span className="text-[#FF2E7A]">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'home', label: 'Home' },
                    { id: 'work', label: 'Work' },
                    { id: 'hotel', label: 'Hotel' },
                    { id: 'other', label: 'Other' },
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setAddressType(type.id as typeof addressType)}
                      className={`py-1.5 px-1 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-0.5 touch-target-min ${
                        addressType === type.id
                          ? 'border-[#FF2E7A] bg-[#FFF1F4] text-[#FF2E7A] shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-xs">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Form Inputs */}
          <div className="lg:col-span-6 xl:col-span-7 space-y-3.5">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-[#FF2E7A]">*</span>
                </label>
                <input
                  type="text"
                  value={address.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                    errors.name ? 'border-rose-500' : 'border-slate-200'
                  }`}
                  placeholder="e.g. Rahul Sharma"
                />
                {errors.name && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile Number <span className="text-[#FF2E7A]">*</span>
                </label>
                <input
                  type="tel"
                  value={address.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value.replace(/\D/g, ''))}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                    errors.phone ? 'border-rose-500' : 'border-slate-200'
                  }`}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                />
                {errors.phone && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.phone}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Flat / House No. <span className="text-[#FF2E7A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={address.flat}
                    onChange={(e) => handleInputChange('flat', e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                      errors.flat ? 'border-rose-500' : 'border-slate-200'
                    }`}
                    placeholder="e.g. Flat 402, Tower B"
                  />
                  {errors.flat && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.flat}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Street / Area <span className="text-[#FF2E7A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => handleInputChange('street', e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                      errors.street ? 'border-rose-500' : 'border-slate-200'
                    }`}
                    placeholder="e.g. Main Market, Sector 14"
                  />
                  {errors.street && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.street}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    City <span className="text-[#FF2E7A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                      errors.city ? 'border-rose-500' : 'border-slate-200'
                    }`}
                    placeholder="City"
                  />
                  {errors.city && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.city}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    State <span className="text-[#FF2E7A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={address.state || ''}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                      errors.state ? 'border-rose-500' : 'border-slate-200'
                    }`}
                    placeholder="State"
                  />
                  {errors.state && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.state}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pincode <span className="text-[#FF2E7A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={address.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value.replace(/\D/g, ''))}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors ${
                      errors.pincode ? 'border-rose-500' : 'border-slate-200'
                    }`}
                    placeholder="6-digit PIN"
                    maxLength={6}
                  />
                  {errors.pincode && <p className="text-[10px] text-rose-500 mt-1 font-bold">{errors.pincode}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nearby Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={address.landmark || ''}
                  onChange={(e) => handleInputChange('landmark', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-[#FF2E7A]/25 focus:border-[#FF2E7A] transition-colors"
                  placeholder="e.g. Opposite City Hospital"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-40 shadow-lg user-safe-bottom">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5">
          <button
            type="button"
            onClick={handleSaveAddress}
            disabled={!isFormValid || isSaving}
            className={`w-full py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 touch-target-min flex items-center justify-center gap-1.5 ${
              isFormValid && !isSaving
                ? 'bg-[#FF2E7A] text-white hover:bg-[#E02269]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? 'Saving Address...' : 'Save & Deliver Here'}
          </button>
        </div>
      </div>
    </div>
  );
}

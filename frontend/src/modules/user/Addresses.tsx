import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAddresses, deleteAddress, Address } from '../../services/api/customerAddressService';
import { UserEmptyState } from './components/common';
import { ArrowLeftIcon, LocationPinIcon, PlusIcon } from './components/common/UserIcons';

export default function Addresses() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const res = await getAddresses();
      if (res.success && Array.isArray(res.data)) {
        setAddresses(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  const handleDelete = async (id: string | undefined) => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to delete this address?')) return;

    try {
      await deleteAddress(id);
      setAddresses((prev) => prev.filter((a) => a._id !== id));
    } catch (error) {
      console.error('Failed to delete address:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
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
              Saved Addresses
            </h1>
          </div>

          <button
            type="button"
            onClick={() => navigate('/checkout/address')}
            className="px-3.5 py-1.5 bg-[#FF2E7A] hover:bg-[#E02269] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-xs transition-opacity flex items-center gap-1 touch-target-min"
          >
            <PlusIcon size={14} />
            <span>Add New</span>
          </button>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-3.5 md:pt-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2.5">
            <div className="w-10 h-10 border-3 border-[#FF2E7A] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading addresses...</p>
          </div>
        ) : addresses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {addresses.map((addr) => (
              <div
                key={addr._id}
                className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
                    <LocationPinIcon size={16} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {addr.fullName}
                      </h3>
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {addr.type || 'Home'}
                      </span>
                      {addr.isDefault && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-200 px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed mb-0.5">
                      {addr.address}, {addr.city} - {addr.pincode}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      +91 {addr.phone}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(addr._id)}
                    className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] px-2.5 py-1 rounded-full hover:bg-[#FFF1F4] transition-colors touch-target-min"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate('/checkout/address', {
                        state: {
                          editAddress: {
                            id: addr._id,
                            _id: addr._id,
                            name: addr.fullName,
                            phone: addr.phone,
                            street: addr.address,
                            city: addr.city,
                            state: addr.state,
                            pincode: addr.pincode,
                            type: addr.type,
                            latitude: addr.latitude,
                            longitude: addr.longitude,
                          },
                        },
                      })
                    }
                    className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full transition-colors touch-target-min"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10">
            <UserEmptyState
              icon={<LocationPinIcon size={32} className="text-[#FF2E7A]" />}
              title="No saved addresses"
              description="Save your home, work, or other delivery addresses for faster checkout."
              actionText="Add New Address"
              onAction={() => navigate('/checkout/address')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Address,
  deleteAddress,
  getAddresses,
  updateAddress,
} from "../../services/api/customerAddressService";
import { useToast } from "../../context/ToastContext";
import { UserEmptyState } from "./components/common";
import { ArrowLeftIcon, LocationPinIcon, PlusIcon, ShareIcon } from "./components/common/UserIcons";

function buildAddressLine(address: Address) {
  const parts = [
    address.address,
    address.landmark,
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean);
  return parts.join(", ");
}

export default function AddressBook() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAddresses = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getAddresses();
      if (res.success && Array.isArray(res.data)) {
        setAddresses(res.data as Address[]);
      } else {
        setError(res.message || "Failed to load addresses");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load addresses"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const handleShare = async (address: Address) => {
    const text = `${address.fullName || "Address"}\n${buildAddressLine(
      address
    )}\nPhone: ${address.phone}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Saved address", text });
      } catch {
        // user cancelled; no-op
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showToast("Address copied to clipboard");
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      setBusyId(id);
      await deleteAddress(id);
      setAddresses((prev) => prev.filter((a) => a._id !== id));
      showToast("Address removed successfully");
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to delete address"
      );
      showToast("Failed to delete address", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleMakeDefault = async (id?: string) => {
    if (!id) return;
    try {
      setBusyId(id);
      await updateAddress(id, { isDefault: true });
      setAddresses((prev) =>
        prev.map((addr) => ({ ...addr, isDefault: addr._id === id }))
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to mark as default"
      );
    } finally {
      setBusyId(null);
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
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Address Book
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {addresses.length} saved addresses
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/checkout/address")}
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
        ) : error ? (
          <div className="bg-[#FFF1F4] text-[#FF2E7A] border border-[#FFE4EA] rounded-xl p-3.5 text-xs font-bold">
            {error}
          </div>
        ) : addresses.length === 0 ? (
          <div className="py-10">
            <UserEmptyState
              icon={<LocationPinIcon size={32} className="text-[#FF2E7A]" />}
              title="No saved addresses"
              description="Save your frequently used addresses for effortless fast delivery."
              actionText="Add New Address"
              onAction={() => navigate("/checkout/address")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {addresses.map((addr) => {
              const isBusy = busyId === addr._id;
              return (
                <div
                  key={addr._id || addr.phone}
                  className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A] flex-shrink-0">
                      <LocationPinIcon size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {addr.fullName || "Address"}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {addr.type || "Home"}
                        </span>
                        {addr.isDefault && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-[#16A34A] border border-emerald-200 px-2 py-0.5 rounded-full">
                            Default
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                        {buildAddressLine(addr)}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        +91 {addr.phone || "Not added"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleShare(addr)}
                      disabled={isBusy}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 touch-target-min"
                    >
                      <ShareIcon size={12} />
                      <span>Share</span>
                    </button>
                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleMakeDefault(addr._id)}
                        disabled={isBusy}
                        className="text-xs font-bold text-[#16A34A] hover:bg-emerald-100 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full transition-colors touch-target-min"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(addr._id)}
                      disabled={isBusy}
                      className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] hover:bg-[#FFF1F4] px-2.5 py-1 rounded-full transition-colors touch-target-min"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

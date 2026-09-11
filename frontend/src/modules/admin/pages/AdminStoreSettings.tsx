import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import {
  getAdminStoreSettings,
  updateAdminStoreSettings,
} from "../../../services/api/admin/adminSettingsService";
import SellerServiceMap from "../components/SellerServiceMap";

export default function AdminStoreSettings() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Form State
  const [storeName, setStoreName] = useState("Hello Local Admin Store");
  const [sellerName, setSellerName] = useState("Hello Local Admin");
  const [email, setEmail] = useState("admin-store@hellolocal.com");
  const [mobile, setMobile] = useState("9999999999");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [serviceableArea, setServiceableArea] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [latitude, setLatitude] = useState<number>(19.076);
  const [longitude, setLongitude] = useState<number>(72.8777);
  const [serviceRadiusKm, setServiceRadiusKm] = useState<number>(10);
  const [storeId, setStoreId] = useState<string>("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await getAdminStoreSettings();
      if (res.success && res.data) {
        const d = res.data;
        setStoreId(d._id);
        setStoreName(d.storeName || "Hello Local Admin Store");
        setSellerName(d.sellerName || "Hello Local Admin");
        setEmail(d.email || "admin-store@hellolocal.com");
        setMobile(d.mobile || "9999999999");
        setAddress(d.address || "");
        setCity(d.city || "");
        setServiceableArea(d.serviceableArea || "");
        setSearchLocation(d.searchLocation || "");
        setLatitude(typeof d.latitude === "number" ? d.latitude : 19.076);
        setLongitude(typeof d.longitude === "number" ? d.longitude : 72.8777);
        setServiceRadiusKm(
          typeof d.serviceRadiusKm === "number" ? d.serviceRadiusKm : 10
        );
      }
    } catch (err: any) {
      console.error("Failed to load admin store settings:", err);
      showToast(err.message || "Failed to load admin store settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!storeName.trim()) {
      showToast("Store name is required", "error");
      return;
    }

    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      showToast("Please enter a valid latitude between -90 and 90", "error");
      return;
    }

    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      showToast("Please enter a valid longitude between -180 and 180", "error");
      return;
    }

    try {
      setSaving(true);
      const res = await updateAdminStoreSettings({
        storeName: storeName.trim(),
        sellerName: sellerName.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        address: address.trim(),
        city: city.trim(),
        serviceableArea: serviceableArea.trim(),
        searchLocation: searchLocation.trim(),
        latitude,
        longitude,
        serviceRadiusKm,
      });

      if (res.success) {
        showToast("Admin Store settings saved successfully!", "success");
      } else {
        showToast(res.message || "Failed to update store settings", "error");
      }
    } catch (err: any) {
      console.error("Failed to update store settings:", err);
      showToast(err.message || "Failed to update store settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser", "error");
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(parseFloat(pos.coords.latitude.toFixed(6)));
        setLongitude(parseFloat(pos.coords.longitude.toFixed(6)));
        setDetectingLocation(false);
        showToast("Location updated from your current GPS position!", "success");
      },
      (err) => {
        console.error("Geolocation error:", err);
        setDetectingLocation(false);
        showToast("Unable to fetch location: " + err.message, "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-neutral-500">
            Loading store configuration...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <nav className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-1">
            <Link to="/admin" className="hover:text-rose-600 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span>Settings</span>
            <span>/</span>
            <span className="text-neutral-900 font-semibold">
              Admin Store Settings
            </span>
          </nav>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Admin Store & Warehouse Configuration
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Configure the default identity, address, map location, and service
            radius for direct admin catalog products.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Save Store Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Info Banner */}
        <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
          <svg
            className="w-5 h-5 text-rose-600 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-xs sm:text-sm text-rose-900 leading-relaxed">
            <span className="font-bold">How Admin Store is used:</span> Whenever
            products are added by an administrator without specifying an
            external vendor, they are automatically tied to this Admin Store.
            Customers will see this store name, and delivery distances/charges
            are measured from these coordinates.
            {storeId && (
              <span className="block mt-1 text-xs text-rose-700 font-mono">
                Store ID: {storeId}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form Inputs (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Store Profile Card */}
            <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-neutral-50/80 border-b border-neutral-200 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-rose-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider">
                  Store Profile & Contact
                </h2>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                      Store Display Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="e.g. Hello Local Direct"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                      Manager / Contact Person
                    </label>
                    <input
                      type="text"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      placeholder="e.g. Hello Local Admin"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin-store@hellolocal.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                      Contact Phone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="9999999999"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Warehouse Address Card */}
            <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-neutral-50/80 border-b border-neutral-200 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-rose-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider">
                  Physical Address & Coverage
                </h2>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                    Warehouse / Store Address
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Plot 44, Sector 18, Vashi Warehouse Complex"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                      City
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Navi Mumbai"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                      Serviceable Regions / Areas
                    </label>
                    <input
                      type="text"
                      value={serviceableArea}
                      onChange={(e) => setServiceableArea(e.target.value)}
                      placeholder="e.g. Vashi, Nerul, Belapur, Sanpada"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                    Search / Landmark Location
                  </label>
                  <input
                    type="text"
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    placeholder="e.g. Near Vashi Railway Station"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Coordinates, Service Radius & Map Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden flex flex-col h-full">
              <div className="px-5 py-4 bg-neutral-50/80 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-rose-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider">
                    Geofence & Coordinates
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleDetectGPS}
                  disabled={detectingLocation}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Detect GPS"
                >
                  {detectingLocation ? (
                    <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                  <span>Detect GPS</span>
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Coordinates Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) =>
                        setLatitude(parseFloat(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) =>
                        setLongitude(parseFloat(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Service Radius Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                      Delivery Service Radius
                    </label>
                    <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                      {serviceRadiusKm} km
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="0.5"
                    value={serviceRadiusKm}
                    onChange={(e) =>
                      setServiceRadiusKm(parseFloat(e.target.value) || 1)
                    }
                    className="w-full accent-rose-600 cursor-pointer h-2 bg-neutral-200 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[11px] text-neutral-400 mt-1">
                    <span>1 km</span>
                    <span>25 km</span>
                    <span>50 km</span>
                  </div>
                </div>

                {/* Live Map Preview */}
                <div className="pt-2">
                  <span className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
                    Live Coverage Map Preview
                  </span>
                  <div className="h-[260px] rounded-xl overflow-hidden border border-neutral-200 shadow-inner">
                    <SellerServiceMap
                      latitude={latitude}
                      longitude={longitude}
                      radiusKm={serviceRadiusKm}
                      storeName={storeName || "Admin Store"}
                    />
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1.5 text-center">
                    The circle represents the delivery radius where admin
                    products are served.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-200">
          <Link
            to="/admin"
            className="px-5 py-2.5 text-sm font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

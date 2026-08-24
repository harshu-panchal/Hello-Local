import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAllSellers, type Seller as SellerType } from "../../../services/api/sellerService";
import SellerServiceMap from "../components/SellerServiceMap";
import { useToast } from "../../../context/ToastContext";

interface Seller {
  _id: string;
  sellerName: string;
  storeName: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  searchLocation?: string;
  latitude?: string;
  longitude?: string;
  serviceRadiusKm?: number;
  status: "Approved" | "Pending" | "Rejected";
}

export default function AdminSellerLocation() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Approved" | "Pending" | "Rejected">("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch sellers
  const fetchSellers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllSellers();

      if (response.success && Array.isArray(response.data)) {
        const mappedSellers: Seller[] = response.data.map((seller: SellerType) => ({
          _id: seller._id,
          sellerName: seller.sellerName || "Unknown Seller",
          storeName: seller.storeName || "Store",
          email: seller.email || "",
          phone: seller.mobile || "",
          address: seller.address,
          city: seller.city,
          searchLocation: seller.searchLocation,
          latitude: seller.latitude,
          longitude: seller.longitude,
          serviceRadiusKm: seller.serviceRadiusKm || 10,
          status: seller.status || "Pending",
        }));

        // Filter sellers with coordinates
        const sellersWithLocation = mappedSellers.filter(
          (seller) =>
            seller.latitude &&
            seller.longitude &&
            !isNaN(parseFloat(seller.latitude)) &&
            !isNaN(parseFloat(seller.longitude))
        );

        setSellers(sellersWithLocation);
        if (sellersWithLocation.length > 0) {
          setSelectedSeller(sellersWithLocation[0]);
        }
      } else {
        setSellers([]);
      }
    } catch (err: any) {
      console.error("Error fetching sellers for location map:", err);
      const msg = err.response?.data?.message || "Failed to load seller locations";
      setError(msg);
      showToast(msg, "error");
      setSellers([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  // Filter sellers
  const filteredSellers = useMemo(() => {
    return sellers.filter((seller) => {
      const matchesSearch =
        debouncedSearch.trim() === "" ||
        seller.sellerName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.storeName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.city?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.address?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.phone.includes(debouncedSearch);

      const matchesStatus = statusFilter === "All" || seller.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sellers, debouncedSearch, statusFilter]);

  const handleSellerClick = (seller: Seller) => {
    setSelectedSeller(seller);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Seller Locations & Geofence Map
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Geospatial observability and delivery coverage radar for registered vendors
          </p>
        </div>

        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500">
          <Link
            to="/admin/dashboard"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">Seller Locations</span>
        </nav>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          {/* Search */}
          <div className="md:col-span-8">
            <label htmlFor="searchSellerInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              Search Sellers & Stores
            </label>
            <div className="relative">
              <input
                id="searchSellerInput"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by store name, owner, city, or address..."
                className="w-full pl-9 pr-8 py-2.5 border border-neutral-300 rounded-xl text-xs sm:text-sm font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-4">
            <label htmlFor="statusFilterSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              Account Status
            </label>
            <select
              id="statusFilterSelect"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full px-3 py-2.5 border border-neutral-300 rounded-xl text-xs sm:text-sm font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
            >
              <option value="All">All Statuses ({sellers.length})</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending (Under Review)</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Map & List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Map Section (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden flex flex-col">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Coverage Radar Map
            </h2>
            {selectedSeller && (
              <span className="text-xs bg-rose-800/80 px-2.5 py-0.5 rounded-full font-semibold">
                Radius: {selectedSeller.serviceRadiusKm || 10} km
              </span>
            )}
          </div>

          <div className="h-[380px] sm:h-[540px] w-full relative bg-neutral-100">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500 space-y-2">
                <div className="w-8 h-8 border-3 border-rose-700 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-semibold">Loading geospatial map tiles...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-6 text-center space-y-2">
                <p className="text-sm font-bold text-red-600">{error}</p>
                <button
                  type="button"
                  onClick={fetchSellers}
                  className="px-3.5 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-lg text-xs font-bold"
                >
                  Retry Loading
                </button>
              </div>
            ) : selectedSeller && selectedSeller.latitude && selectedSeller.longitude ? (
              <SellerServiceMap
                latitude={parseFloat(selectedSeller.latitude)}
                longitude={parseFloat(selectedSeller.longitude)}
                radiusKm={selectedSeller.serviceRadiusKm || 10}
                storeName={selectedSeller.storeName}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-neutral-200/70 flex items-center justify-center mb-2 text-neutral-400">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-neutral-800">No seller selected</p>
                <p className="text-xs text-neutral-500 mt-0.5">Select a store from the list on the right to view its radar</p>
              </div>
            )}
          </div>

          {/* Selected Seller Metadata Card */}
          {selectedSeller && (
            <div className="p-4 sm:p-5 border-t border-neutral-200 bg-rose-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-neutral-900 text-sm sm:text-base">
                    {selectedSeller.storeName}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      selectedSeller.status === "Approved"
                        ? "bg-rose-100 text-rose-800"
                        : selectedSeller.status === "Pending"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {selectedSeller.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 mt-0.5">
                  <span className="font-semibold text-neutral-800">Proprietor:</span> {selectedSeller.sellerName} • 📞 {selectedSeller.phone}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  📍 {selectedSeller.address || "No address specified"}{selectedSeller.city ? `, ${selectedSeller.city}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/admin/manage-seller/list")}
                className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors whitespace-nowrap min-h-[40px] flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Manage Store KYC</span>
              </button>
            </div>
          )}
        </div>

        {/* Sellers List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden flex flex-col">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Stores with GPS ({filteredSellers.length})
            </h2>
          </div>

          <div className="max-h-[580px] overflow-y-auto divide-y divide-neutral-100">
            {loading ? (
              [1, 2, 3, 4].map((idx) => (
                <div key={idx} className="p-4 animate-pulse space-y-2">
                  <div className="h-4 bg-neutral-200 rounded w-32" />
                  <div className="h-3 bg-neutral-200 rounded w-48" />
                  <div className="h-3 bg-neutral-200 rounded w-24" />
                </div>
              ))
            ) : filteredSellers.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-xs">
                <p className="font-semibold text-neutral-700">No stores found</p>
                <p className="mt-1">
                  {debouncedSearch
                    ? `No matches for "${debouncedSearch}"`
                    : "No vendors with GPS coordinates recorded"}
                </p>
              </div>
            ) : (
              filteredSellers.map((seller) => (
                <div
                  key={seller._id}
                  onClick={() => handleSellerClick(seller)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedSeller?._id === seller._id
                      ? "bg-rose-50/80 border-l-4 border-rose-700"
                      : "hover:bg-neutral-50/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-neutral-900 text-xs sm:text-sm">
                      {seller.storeName}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                        seller.status === "Approved"
                          ? "bg-rose-50 text-rose-700 border border-rose-100"
                          : seller.status === "Pending"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {seller.status}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 font-medium">
                    {seller.sellerName} • 📞 {seller.phone}
                  </p>

                  {seller.address && (
                    <p className="text-[11px] text-neutral-500 mt-1 line-clamp-1">
                      📍 {seller.address}{seller.city ? `, ${seller.city}` : ""}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                    <span>
                      {parseFloat(seller.latitude || "0").toFixed(4)}, {parseFloat(seller.longitude || "0").toFixed(4)}
                    </span>
                    <span className="font-sans font-bold text-rose-700">
                      {seller.serviceRadiusKm || 10} km radar
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Operations
      </footer>
    </div>
  );
}

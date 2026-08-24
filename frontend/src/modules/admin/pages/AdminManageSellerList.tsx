import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getAllSellers,
  updateSellerStatus,
  deleteSeller,
  updateSeller,
  type Seller as SellerType,
} from "../../../services/api/sellerService";
import SellerServiceMap from "../components/SellerServiceMap";
import { useToast } from "../../../context/ToastContext";

interface Seller {
  _id: string;
  id?: number;
  name: string;
  sellerName: string;
  storeName: string;
  phone: string;
  mobile: string;
  email: string;
  logo?: string;
  balance: number;
  commission: number;
  categories: string[];
  status: "Approved" | "Pending" | "Rejected";
  needApproval: boolean;
  category?: string;
  address?: string;
  city?: string;
  serviceableArea?: string;
  panCard?: string;
  taxName?: string;
  taxNumber?: string;
  searchLocation?: string;
  latitude?: string;
  longitude?: string;
  serviceRadiusKm?: number;
  accountName?: string;
  bankName?: string;
  branch?: string;
  accountNumber?: string;
  ifsc?: string;
  profile?: string;
  idProof?: string;
  addressProof?: string;
  requireProductApproval?: boolean;
  viewCustomerDetails?: boolean;
}

const mapSellerToFrontend = (seller: SellerType): Seller => {
  return {
    _id: seller._id,
    id: parseInt(seller._id.slice(-6), 16) || 0,
    name: seller.sellerName,
    sellerName: seller.sellerName,
    storeName: seller.storeName,
    phone: seller.mobile,
    mobile: seller.mobile,
    email: seller.email,
    logo: seller.logo || "",
    balance: seller.balance || 0,
    commission: seller.commission || 0,
    categories: seller.categories || [],
    status: seller.status,
    needApproval: seller.status === "Pending",
    category: seller.category,
    address: seller.address,
    city: seller.city,
    serviceableArea: seller.serviceableArea,
    panCard: seller.panCard,
    taxName: seller.taxName,
    taxNumber: seller.taxNumber,
    searchLocation: seller.searchLocation,
    latitude: seller.latitude,
    longitude: seller.longitude,
    serviceRadiusKm: seller.serviceRadiusKm,
    accountName: seller.accountName,
    bankName: seller.bankName,
    branch: seller.branch,
    accountNumber: seller.accountNumber,
    ifsc: seller.ifsc,
    profile: seller.profile,
    idProof: seller.idProof,
    addressProof: seller.addressProof,
    requireProductApproval: seller.requireProductApproval,
    viewCustomerDetails: seller.viewCustomerDetails,
  };
};

const FALLBACK_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="8" fill="#FFF1F2"/>
        <path d="M20 19c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Zm0 2.5c-3.333 0-10 1.667-10 5v1.5c0 .552.448 1 1 1h18c.552 0 1-.448 1-1V26.5c0-3.333-6.667-5-10-5Z" fill="#BE123C"/>
    </svg>`
  );

export default function AdminManageSellerList() {
  const { showToast } = useToast();

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Modals
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdatingRadius, setIsUpdatingRadius] = useState(false);
  const [newRadius, setNewRadius] = useState<number>(10);

  // Deletion Modal
  const [deleteTarget, setDeleteTarget] = useState<Seller | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch sellers
  const fetchSellers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await getAllSellers();
      if (response.success && response.data) {
        const mappedSellers = response.data.map(mapSellerToFrontend);
        setSellers(mappedSellers);
      } else {
        setError("Failed to fetch sellers");
      }
    } catch (err: any) {
      console.error("Error fetching sellers:", err);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        setError("Please login as admin to view sellers.");
      } else {
        const msg = err.response?.data?.message || "Failed to fetch sellers. Please try again.";
        setError(msg);
        showToast(msg, "error");
      }
      setSellers([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filtered sellers
  const filteredSellers = useMemo(() => {
    return sellers.filter((seller) => {
      const matchesStatus =
        statusFilter === "All Status" || seller.status === statusFilter;
      const matchesSearch =
        debouncedSearch.trim() === "" ||
        seller.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.storeName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        seller.phone.includes(debouncedSearch) ||
        seller.mobile.includes(debouncedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [sellers, statusFilter, debouncedSearch]);

  // Sorted sellers
  const sortedSellers = useMemo(() => {
    if (!sortColumn) return filteredSellers;

    return [...filteredSellers].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "id":
          aValue = a._id;
          bValue = b._id;
          break;
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "storeName":
          aValue = a.storeName.toLowerCase();
          bValue = b.storeName.toLowerCase();
          break;
        case "balance":
          aValue = a.balance;
          bValue = b.balance;
          break;
        case "commission":
          aValue = a.commission;
          bValue = b.commission;
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredSellers, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedSellers.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedSellers = sortedSellers.slice(startIndex, endIndex);

  // CSV Export
  const handleExport = () => {
    if (sortedSellers.length === 0) {
      showToast("No sellers available to export", "info");
      return;
    }

    const headers = ["Id", "Seller Name", "Store Name", "Phone", "Email", "Balance", "Commission (%)", "Status"];
    const csvContent = [
      headers.join(","),
      ...sortedSellers.map((seller) =>
        [
          `"${seller._id}"`,
          `"${(seller.name || "").replace(/"/g, '""')}"`,
          `"${(seller.storeName || "").replace(/"/g, '""')}"`,
          `"${seller.phone || ""}"`,
          `"${seller.email || ""}"`,
          seller.balance,
          seller.commission,
          seller.status,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `hellolocal_sellers_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Seller directory exported successfully", "success");
  };

  const handleEdit = (sellerId: string) => {
    const seller = sellers.find((s) => s._id === sellerId);
    if (seller) {
      setEditingSeller(seller);
      setNewRadius(seller.serviceRadiusKm || 10);
      setIsEditModalOpen(true);
    }
  };

  const handleUpdateRadius = async () => {
    if (!editingSeller) return;

    try {
      setIsUpdatingRadius(true);
      const response = await updateSeller(editingSeller._id, { serviceRadiusKm: newRadius });
      if (response.success) {
        setEditingSeller({ ...editingSeller, serviceRadiusKm: newRadius });
        setSellers((prev) =>
          prev.map((s) => (s._id === editingSeller._id ? { ...s, serviceRadiusKm: newRadius } : s))
        );
        showToast("Service radius updated successfully", "success");
      }
    } catch (error: any) {
      console.error("Error updating radius:", error);
      showToast(error.response?.data?.message || "Failed to update service radius", "error");
    } finally {
      setIsUpdatingRadius(false);
    }
  };

  const handleApprove = async (sellerId: string) => {
    try {
      const response = await updateSellerStatus(sellerId, "Approved");
      if (response.success) {
        setSellers((prev) =>
          prev.map((s) =>
            s._id === sellerId ? { ...s, status: "Approved", needApproval: false } : s
          )
        );
        showToast("Seller account approved successfully!", "success");
        setIsEditModalOpen(false);
        setEditingSeller(null);
      } else {
        showToast("Failed to approve seller", "error");
      }
    } catch (err: any) {
      console.error("Error approving seller:", err);
      showToast(err.response?.data?.message || "Failed to approve seller", "error");
    }
  };

  const handleReject = async (sellerId: string) => {
    try {
      const response = await updateSellerStatus(sellerId, "Rejected");
      if (response.success) {
        setSellers((prev) =>
          prev.map((s) =>
            s._id === sellerId ? { ...s, status: "Rejected", needApproval: false } : s
          )
        );
        showToast("Seller application rejected", "info");
        setIsEditModalOpen(false);
        setEditingSeller(null);
      } else {
        showToast("Failed to reject seller", "error");
      }
    } catch (err: any) {
      console.error("Error rejecting seller:", err);
      showToast(err.response?.data?.message || "Failed to reject seller", "error");
    }
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingSeller(null);
  };

  // Safe delete handler
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteSeller(deleteTarget._id);
      if (response.success) {
        showToast("Seller deleted successfully", "success");
        setDeleteTarget(null);
        if (editingSeller?._id === deleteTarget._id) {
          handleCloseEditModal();
        }
        fetchSellers();
      } else {
        showToast("Failed to delete seller", "error");
      }
    } catch (err: any) {
      console.error("Error deleting seller:", err);
      const msg = err.response?.data?.message || "Failed to delete seller";
      showToast(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewCategories = (seller: Seller) => {
    setSelectedSeller(seller);
    setIsCategoryModalOpen(true);
  };

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setSelectedSeller(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Manage Sellers & Approvals
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Review vendor KYC applications, manage serviceability radii, and monitor store metrics
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
          <span className="text-neutral-700 font-medium">Sellers</span>
        </nav>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        {/* Banner with Action Buttons */}
        <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Active Sellers ({sortedSellers.length})
          </h2>
          <button
            type="button"
            onClick={handleExport}
            className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px]"
            title="Export CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>

        {/* Controls & Filter Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600">Show</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs font-medium text-neutral-600">entries</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[38px]"
              >
                <option value="All Status">All Status</option>
                <option value="Approved">Approved</option>
                <option value="Pending">Pending (Needs Approval)</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search store, seller, phone..."
              className="pl-8 pr-7 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none w-full sm:w-64 min-h-[38px]"
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-20"
                  onClick={() => handleSort("id")}
                >
                  <div className="flex items-center gap-1">
                    <span>ID</span>
                    <span className="text-neutral-400">{sortColumn === "id" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("storeName")}
                >
                  <div className="flex items-center gap-1">
                    <span>Store Name</span>
                    <span className="text-neutral-400">{sortColumn === "storeName" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    <span>Seller Contact</span>
                    <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-3 w-16 text-center">Logo</th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24 text-right"
                  onClick={() => handleSort("balance")}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Balance</span>
                    <span className="text-neutral-400">{sortColumn === "balance" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24 text-center"
                  onClick={() => handleSort("commission")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Comm (%)</span>
                    <span className="text-neutral-400">{sortColumn === "commission" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-3 w-28 text-center">Categories</th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-center"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="text-neutral-400">{sortColumn === "status" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-10" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-32" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36" /></td>
                    <td className="py-3.5 px-3"><div className="h-9 w-9 bg-neutral-200 rounded mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-10 mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-6 bg-neutral-200 rounded w-18 mx-auto" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-20 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
                    <button
                      type="button"
                      onClick={fetchSellers}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : displayedSellers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No sellers found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm
                        ? `No sellers matching "${searchTerm}"`
                        : "No seller accounts currently registered"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedSellers.map((seller) => (
                  <tr key={seller._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-500">
                      #{seller._id.slice(-5).toUpperCase()}
                    </td>
                    <td className="py-3 px-4 font-bold text-neutral-900">
                      {seller.storeName}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-neutral-800">{seller.name}</div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {seller.phone || seller.mobile} • {seller.email}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <img
                        src={seller.logo && seller.logo.trim() !== "" ? seller.logo : FALLBACK_LOGO}
                        alt={seller.storeName}
                        className="w-9 h-9 object-cover rounded-lg border border-neutral-200 mx-auto"
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.dataset.fallbackApplied === "true") return;
                          img.dataset.fallbackApplied = "true";
                          img.src = FALLBACK_LOGO;
                        }}
                      />
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-neutral-800">
                      ₹{seller.balance.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-neutral-700">
                      {seller.commission.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleViewCategories(seller)}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold rounded-lg transition-colors touch-target-min"
                      >
                        View ({seller.categories.length})
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          seller.status === "Approved"
                            ? "bg-rose-50 text-rose-700 border border-rose-100"
                            : seller.status === "Pending"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}
                      >
                        {seller.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(seller._id)}
                          className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors touch-target-min"
                          title="View & Edit Seller KYC"
                          aria-label={`View KYC for ${seller.storeName}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(seller)}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors touch-target-min"
                          title="Delete seller"
                          aria-label={`Delete ${seller.storeName}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-neutral-600 font-medium">
            Showing {sortedSellers.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(endIndex, sortedSellers.length)} of {sortedSellers.length} entries
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === 1
                  ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                  : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
              }`}
              aria-label="Previous page"
            >
              ‹ Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((page, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsis && <span className="px-1 text-neutral-400">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg font-bold min-h-[36px] transition-colors ${
                          currentPage === page
                            ? "bg-rose-700 text-white"
                            : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                currentPage === totalPages || totalPages === 0
                  ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                  : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
              }`}
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>

      {/* View Categories Modal */}
      {isCategoryModalOpen && selectedSeller && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={handleCloseCategoryModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-700 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Authorized Categories</h3>
                <p className="text-xs text-rose-100 mt-0.5">
                  {selectedSeller.storeName} ({selectedSeller.name})
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCategoryModal}
                className="text-white hover:text-rose-200 p-1 text-lg font-bold"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {selectedSeller.categories.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedSeller.categories.map((category, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3.5 py-2.5 bg-rose-50/70 border border-rose-100 rounded-xl"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-rose-700 flex-shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-xs font-semibold text-rose-950">{category}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-neutral-400 text-xs font-medium">
                  No specific categories assigned to this seller.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
              <button
                type="button"
                onClick={handleCloseCategoryModal}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition-colors min-h-[38px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Seller / KYC Inspection Modal */}
      {isEditModalOpen && editingSeller && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={handleCloseEditModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold">
                  Seller KYC & Store Settings — {editingSeller.storeName}
                </h3>
                <p className="text-xs text-rose-100 mt-0.5">
                  Review applicant credentials and configure serviceability geofence
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-white hover:text-rose-200 p-1 text-xl font-bold"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Approval Bar */}
              <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Account Status:</span>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                      editingSeller.status === "Approved"
                        ? "bg-rose-100 text-rose-800"
                        : editingSeller.status === "Pending"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {editingSeller.status}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {editingSeller.status !== "Approved" && (
                    <button
                      type="button"
                      onClick={() => handleApprove(editingSeller._id)}
                      className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors min-h-[38px] flex items-center gap-1.5"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Approve Seller</span>
                    </button>
                  )}
                  {editingSeller.status !== "Rejected" && (
                    <button
                      type="button"
                      onClick={() => handleReject(editingSeller._id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors min-h-[38px] flex items-center gap-1.5"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>Reject Seller</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Basic Info */}
              <div className="bg-neutral-50/70 border border-neutral-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3">
                  Basic Business Credentials
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Legal Contact</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.name}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Store Trade Name</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.storeName}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Email Address</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.email}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Mobile Phone</label>
                    <p className="font-bold text-neutral-900 font-mono mt-0.5">{editingSeller.phone || editingSeller.mobile}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Primary Category</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.category || "General"}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Platform Commission</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.commission.toFixed(2)}%</p>
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div className="bg-neutral-50/70 border border-neutral-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3">
                  Store Physical Location
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-neutral-500 font-semibold">Full Address</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.address || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">City</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.city || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">Serviceable Area</label>
                    <p className="font-bold text-neutral-900 mt-0.5">{editingSeller.serviceableArea || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 font-semibold">GPS Coordinates</label>
                    <p className="font-bold text-neutral-900 font-mono mt-0.5">
                      {editingSeller.latitude && editingSeller.longitude
                        ? `${editingSeller.latitude}, ${editingSeller.longitude}`
                        : "Not specified"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Service Area Map & Geofence */}
              <div className="bg-neutral-50/70 border border-neutral-200/80 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                    Service Area Geofence Radar
                  </h4>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-neutral-700">Radius (km):</label>
                    <input
                      type="number"
                      min="0.1"
                      max="100"
                      step="0.5"
                      value={newRadius}
                      onChange={(e) => setNewRadius(parseFloat(e.target.value))}
                      className="w-20 px-2.5 py-1 border border-neutral-300 rounded-lg text-xs font-bold bg-white text-center"
                    />
                    <button
                      type="button"
                      onClick={handleUpdateRadius}
                      disabled={isUpdatingRadius || newRadius === editingSeller.serviceRadiusKm}
                      className="px-3 py-1 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors min-h-[32px]"
                    >
                      {isUpdatingRadius ? "Updating..." : "Save Radius"}
                    </button>
                  </div>
                </div>

                {editingSeller.latitude && editingSeller.longitude ? (
                  <div className="h-[280px] w-full rounded-xl overflow-hidden border border-neutral-200">
                    <SellerServiceMap
                      latitude={parseFloat(editingSeller.latitude)}
                      longitude={parseFloat(editingSeller.longitude)}
                      radiusKm={newRadius}
                      storeName={editingSeller.storeName}
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-neutral-200 rounded-xl">
                    <p className="text-xs font-semibold text-neutral-600">No GPS coordinates recorded for this store.</p>
                  </div>
                )}
              </div>

              {/* Banking & Taxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-neutral-50/70 border border-neutral-200/80 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3">
                    Tax / GST Details
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-neutral-500 font-semibold">PAN Card: </span>
                      <span className="font-mono font-bold text-neutral-900">{editingSeller.panCard || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-semibold">Tax Type: </span>
                      <span className="font-bold text-neutral-900">{editingSeller.taxName || "GST"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-semibold">GSTIN / Number: </span>
                      <span className="font-mono font-bold text-neutral-900">{editingSeller.taxNumber || "N/A"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-50/70 border border-neutral-200/80 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3">
                    Settlement Bank Account
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-neutral-500 font-semibold">Account Holder: </span>
                      <span className="font-bold text-neutral-900">{editingSeller.accountName || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-semibold">Bank Name: </span>
                      <span className="font-bold text-neutral-900">{editingSeller.bankName || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-semibold">Account No: </span>
                      <span className="font-mono font-bold text-neutral-900">{editingSeller.accountNumber || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-semibold">IFSC Code: </span>
                      <span className="font-mono font-bold text-neutral-900">{editingSeller.ifsc || "N/A"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex justify-end">
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="px-5 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition-colors min-h-[38px]"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accessible Safe Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteSellerModalTitle"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 id="deleteSellerModalTitle" className="text-base font-bold text-neutral-900">
                Delete Seller Account?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete <strong className="text-neutral-800">"{deleteTarget.storeName}"</strong>? Sellers with active catalog products or pending in-flight orders cannot be removed.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 transition-colors min-h-[44px] flex items-center justify-center gap-1.5 shadow-sm shadow-rose-700/20"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  "Yes, Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Quick-Commerce Operations
      </footer>
    </div>
  );
}

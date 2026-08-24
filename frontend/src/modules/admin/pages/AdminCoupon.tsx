import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { uploadImage } from "../../../services/api/uploadService";
import {
  validateImageFile,
  createImagePreview,
} from "../../../utils/imageUpload";
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  type Coupon,
} from "../../../services/api/admin/adminCouponService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminCoupon() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  // Form State
  const [formData, setFormData] = useState({
    userType: "All Users",
    numberOfTimes: "Single Time Valid",
    couponImageUrl: "",
    couponExpiryDate: "",
    couponCode: "",
    couponTitle: "",
    couponStatus: "Published",
    couponMinOrderAmount: "",
    couponValue: "",
    couponType: "Percentage",
    couponDescription: "",
  });

  const [couponImageFile, setCouponImageFile] = useState<File | null>(null);
  const [couponImagePreview, setCouponImagePreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>("");

  // Table State
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"code" | "discountValue" | "minimumPurchase" | "endDate" | "isActive">("endDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Deletion Modal State
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Status Toggling State
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch coupons from API
  const fetchCouponsList = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setTableError(null);
      const response = await getCoupons({ limit: 1000 });
      if (response.success && Array.isArray(response.data)) {
        setCoupons(response.data);
      } else {
        setCoupons([]);
      }
    } catch (err: any) {
      console.error("Error fetching coupons:", err);
      const msg = err.response?.data?.message || "Failed to load coupons";
      setTableError(msg);
      showToast(msg, "error");
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, showToast]);

  useEffect(() => {
    fetchCouponsList();
  }, [fetchCouponsList]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setFormError(validation.error || "Invalid image file");
      showToast(validation.error || "Invalid image file", "error");
      return;
    }

    setCouponImageFile(file);
    setFormError("");

    try {
      const preview = await createImagePreview(file);
      setCouponImagePreview(preview);
    } catch {
      setFormError("Failed to create image preview");
    }
  };

  const generateCouponCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, couponCode: code }));
  };

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validations
    if (
      !formData.couponTitle.trim() ||
      !formData.couponCode.trim() ||
      !formData.couponExpiryDate ||
      !formData.couponMinOrderAmount ||
      !formData.couponValue ||
      !formData.couponDescription.trim()
    ) {
      setFormError("Please fill in all required fields");
      showToast("Please fill in all required fields", "error");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (formData.couponExpiryDate < todayStr) {
      setFormError("Coupon expiry date cannot be in the past");
      showToast("Coupon expiry date cannot be in the past", "error");
      return;
    }

    const discountVal = parseFloat(formData.couponValue);
    if (isNaN(discountVal) || discountVal <= 0) {
      setFormError("Discount value must be greater than 0");
      showToast("Discount value must be greater than 0", "error");
      return;
    }

    if (formData.couponType === "Percentage" && discountVal > 100) {
      setFormError("Percentage discount cannot exceed 100%");
      showToast("Percentage discount cannot exceed 100%", "error");
      return;
    }

    setSubmitting(true);

    try {
      // Upload coupon image if provided
      if (couponImageFile) {
        await uploadImage(couponImageFile, "hellolocal/coupons");
      }

      const couponData = {
        code: formData.couponCode.trim().toUpperCase(),
        description: `${formData.couponTitle.trim()} - ${formData.couponDescription.trim()}`,
        discountType: formData.couponType === "Percentage" ? ("Percentage" as const) : ("Fixed" as const),
        discountValue: discountVal,
        minimumPurchase: parseFloat(formData.couponMinOrderAmount) || 0,
        startDate: todayStr,
        endDate: formData.couponExpiryDate,
        usageLimit: formData.numberOfTimes === "Single Time Valid" ? 1 : undefined,
        applicableTo: "All" as const,
        isActive: formData.couponStatus === "Published",
      };

      const response = await createCoupon(couponData);

      if (response.success) {
        showToast(`Coupon "${couponData.code}" created successfully`, "success");
        fetchCouponsList();

        // Reset form
        setFormData({
          userType: "All Users",
          numberOfTimes: "Single Time Valid",
          couponImageUrl: "",
          couponExpiryDate: "",
          couponCode: "",
          couponTitle: "",
          couponStatus: "Published",
          couponMinOrderAmount: "",
          couponValue: "",
          couponType: "Percentage",
          couponDescription: "",
        });
        setCouponImageFile(null);
        setCouponImagePreview("");
      } else {
        const msg = response.message || "Failed to create coupon";
        setFormError(msg);
        showToast(msg, "error");
      }
    } catch (error: any) {
      const msg =
        error.response?.data?.message ||
        error.message ||
        "Failed to create coupon. Please try again.";
      setFormError(msg);
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Status Toggle
  const handleToggleStatus = async (coupon: Coupon) => {
    try {
      setTogglingId(coupon._id);
      const newStatus = !coupon.isActive;
      const response = await updateCoupon(coupon._id, { isActive: newStatus });

      if (response.success) {
        setCoupons((prev) =>
          prev.map((c) => (c._id === coupon._id ? { ...c, isActive: newStatus } : c))
        );
        showToast(
          `Coupon "${coupon.code}" marked as ${newStatus ? "Active" : "Inactive"}`,
          "success"
        );
      }
    } catch (err: any) {
      console.error("Error toggling coupon status:", err);
      showToast(err.response?.data?.message || "Failed to update coupon status", "error");
    } finally {
      setTogglingId(null);
    }
  };

  // Safe Delete Confirmation
  const confirmDeleteCoupon = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      const response = await deleteCoupon(deleteTarget._id);
      if (response.success) {
        setCoupons((prev) => prev.filter((c) => c._id !== deleteTarget._id));
        showToast(`Coupon "${deleteTarget.code}" deleted successfully`, "success");
        setDeleteTarget(null);
      }
    } catch (error: any) {
      console.error("Error deleting coupon:", error);
      showToast(error.response?.data?.message || "Failed to delete coupon", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (column: "code" | "discountValue" | "minimumPurchase" | "endDate" | "isActive") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filter coupons by search query
  const filteredCoupons = useMemo(() => {
    return coupons.filter((coupon) => {
      const matchSearch =
        debouncedSearch.trim() === "" ||
        coupon.code.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (coupon.description && coupon.description.toLowerCase().includes(debouncedSearch.toLowerCase()));

      return matchSearch;
    });
  }, [coupons, debouncedSearch]);

  // Sort coupons
  const sortedCoupons = useMemo(() => {
    return [...filteredCoupons].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "code":
          aValue = a.code.toLowerCase();
          bValue = b.code.toLowerCase();
          break;
        case "discountValue":
          aValue = a.discountValue;
          bValue = b.discountValue;
          break;
        case "minimumPurchase":
          aValue = a.minimumPurchase || 0;
          bValue = b.minimumPurchase || 0;
          break;
        case "endDate":
          aValue = new Date(a.endDate).getTime();
          bValue = new Date(b.endDate).getTime();
          break;
        case "isActive":
          aValue = a.isActive ? 1 : 0;
          bValue = b.isActive ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredCoupons, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedCoupons.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedCoupons = sortedCoupons.slice(startIndex, endIndex);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Coupons & Promo Codes
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Create and manage promotional discount vouchers for consumer checkout
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
          <span className="text-neutral-700 font-medium">Coupons</span>
        </nav>
      </div>

      {/* Add Coupon Form Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Add New Promotion Coupon
          </h2>
        </div>

        <form onSubmit={handleAddCoupon} className="p-4 sm:p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* User Type */}
            <div>
              <label htmlFor="userTypeSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                User Target <span className="text-red-500">*</span>
              </label>
              <select
                id="userTypeSelect"
                name="userType"
                value={formData.userType}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                disabled={submitting}
              >
                <option value="All Users">All Customers</option>
                <option value="Specific User">Specific User Group</option>
              </select>
            </div>

            {/* Validity Limit */}
            <div>
              <label htmlFor="numberOfTimesSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Redemption Frequency <span className="text-red-500">*</span>
              </label>
              <select
                id="numberOfTimesSelect"
                name="numberOfTimes"
                value={formData.numberOfTimes}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                disabled={submitting}
              >
                <option value="Single Time Valid">Single Time (One use per user)</option>
                <option value="Multi Time Valid">Multi Time (Multiple uses allowed)</option>
              </select>
            </div>

            {/* Coupon Image */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Promo Banner Image (Optional)
              </label>
              <label className="block border-2 border-dashed border-neutral-300 rounded-xl p-2.5 text-center cursor-pointer hover:border-rose-600 transition-colors min-h-[44px]">
                {couponImagePreview ? (
                  <div className="flex items-center justify-between gap-2 px-2">
                    <img
                      src={couponImagePreview}
                      alt="Coupon preview"
                      className="h-7 w-12 rounded object-cover"
                    />
                    <span className="text-xs text-neutral-600 truncate max-w-[120px]">
                      {couponImageFile?.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setCouponImageFile(null);
                        setCouponImagePreview("");
                      }}
                      className="text-xs text-red-600 font-bold hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-500 font-medium">
                    📁 Choose Banner File (Max 5MB)
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={submitting}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Expiry Date */}
            <div>
              <label htmlFor="couponExpiryDateInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Expiry Date <span className="text-red-500">*</span>
              </label>
              <input
                id="couponExpiryDateInput"
                type="date"
                name="couponExpiryDate"
                value={formData.couponExpiryDate}
                onChange={handleInputChange}
                required
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Coupon Code */}
            <div>
              <label htmlFor="couponCodeInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Coupon Code <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="couponCodeInput"
                  type="text"
                  name="couponCode"
                  value={formData.couponCode}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. WELCOME50"
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold uppercase tracking-wider bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={generateCouponCode}
                  className="px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-1 shadow-sm"
                  title="Generate Random Code"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Auto</span>
                </button>
              </div>
            </div>

            {/* Coupon Title */}
            <div>
              <label htmlFor="couponTitleInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Coupon Title <span className="text-red-500">*</span>
              </label>
              <input
                id="couponTitleInput"
                type="text"
                name="couponTitle"
                value={formData.couponTitle}
                onChange={handleInputChange}
                required
                placeholder="e.g. Flat 50% Off on First Order"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status */}
            <div>
              <label htmlFor="couponStatusSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Publish Status <span className="text-red-500">*</span>
              </label>
              <select
                id="couponStatusSelect"
                name="couponStatus"
                value={formData.couponStatus}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="Published">Published (Active)</option>
                <option value="Draft">Draft (Inactive)</option>
              </select>
            </div>

            {/* Min Order Amount */}
            <div>
              <label htmlFor="couponMinOrderAmountInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Min Order Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                id="couponMinOrderAmountInput"
                type="number"
                name="couponMinOrderAmount"
                value={formData.couponMinOrderAmount}
                onChange={handleInputChange}
                required
                min="0"
                step="1"
                placeholder="e.g. 199"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Discount Type */}
            <div>
              <label htmlFor="couponTypeSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Discount Type <span className="text-red-500">*</span>
              </label>
              <select
                id="couponTypeSelect"
                name="couponType"
                value={formData.couponType}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="Percentage">Percentage (%)</option>
                <option value="Fixed">Fixed Amount (₹)</option>
              </select>
            </div>

            {/* Discount Value */}
            <div>
              <label htmlFor="couponValueInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Discount Value <span className="text-red-500">*</span>
              </label>
              <input
                id="couponValueInput"
                type="number"
                name="couponValue"
                value={formData.couponValue}
                onChange={handleInputChange}
                required
                min="0"
                step="0.01"
                placeholder={formData.couponType === "Percentage" ? "e.g. 20" : "e.g. 100"}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="couponDescriptionInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
              Coupon Terms & Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="couponDescriptionInput"
              name="couponDescription"
              value={formData.couponDescription}
              onChange={handleInputChange}
              required
              rows={2}
              placeholder="e.g. Get 20% discount up to ₹100 on orders above ₹199."
              className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-sm flex items-center justify-center gap-2 min-h-[44px] ${
              submitting
                ? "bg-neutral-400 cursor-not-allowed text-white"
                : "bg-rose-700 hover:bg-rose-800 text-white"
            }`}
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Creating Coupon...</span>
              </>
            ) : (
              <span>Create Coupon</span>
            )}
          </button>
        </form>
      </div>

      {/* View Coupons Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
        <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold tracking-tight">
            Active & Draft Promo Codes ({sortedCoupons.length})
          </h2>
        </div>

        {/* Controls Bar */}
        <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
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

          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search coupon code or description..."
              className="pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none w-full sm:w-64 min-h-[40px]"
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
                <th className="py-3 px-4 w-16 text-center">Sr.</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                  onClick={() => handleSort("code")}
                >
                  <div className="flex items-center gap-1">
                    <span>Coupon Code</span>
                    <span className="text-neutral-400">{sortColumn === "code" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32"
                  onClick={() => handleSort("discountValue")}
                >
                  <div className="flex items-center gap-1">
                    <span>Discount</span>
                    <span className="text-neutral-400">{sortColumn === "discountValue" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-32">Type</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-36"
                  onClick={() => handleSort("minimumPurchase")}
                >
                  <div className="flex items-center gap-1">
                    <span>Min Purchase</span>
                    <span className="text-neutral-400">{sortColumn === "minimumPurchase" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32"
                  onClick={() => handleSort("endDate")}
                >
                  <div className="flex items-center gap-1">
                    <span>Expiry Date</span>
                    <span className="text-neutral-400">{sortColumn === "endDate" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28 text-center"
                  onClick={() => handleSort("isActive")}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    <span className="text-neutral-400">{sortColumn === "isActive" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-20 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-6 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-16" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-24" /></td>
                    <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16 mx-auto" /></td>
                    <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-8 mx-auto" /></td>
                  </tr>
                ))
              ) : tableError ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center">
                    <p className="text-sm font-bold text-red-600 mb-2">{tableError}</p>
                    <button
                      type="button"
                      onClick={fetchCouponsList}
                      className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Retry Loading
                    </button>
                  </td>
                </tr>
              ) : displayedCoupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">No coupons found</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {searchTerm ? `No coupons matching "${searchTerm}"` : "Create a new coupon above to get started"}
                    </p>
                  </td>
                </tr>
              ) : (
                displayedCoupons.map((coupon, idx) => (
                  <tr key={coupon._id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-mono font-bold text-neutral-400">
                      {startIndex + idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-neutral-900 bg-neutral-100 px-2 py-1 rounded-md text-xs border border-neutral-200">
                        {coupon.code}
                      </span>
                      {coupon.description && (
                        <div className="text-[11px] text-neutral-500 mt-1 line-clamp-1">
                          {coupon.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-rose-700 text-sm">
                      {coupon.discountType === "Percentage"
                        ? `${coupon.discountValue}% OFF`
                        : `₹${coupon.discountValue} OFF`}
                    </td>
                    <td className="py-3 px-4 text-neutral-600 font-medium">
                      {coupon.discountType}
                    </td>
                    <td className="py-3 px-4 font-medium text-neutral-800">
                      {coupon.minimumPurchase ? `₹${coupon.minimumPurchase}` : "No Minimum"}
                    </td>
                    <td className="py-3 px-4 text-neutral-600 font-mono">
                      {new Date(coupon.endDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(coupon)}
                        disabled={togglingId === coupon._id}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors min-h-[30px] ${
                          coupon.isActive
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200"
                        }`}
                        title="Click to toggle status"
                      >
                        {togglingId === coupon._id ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                        ) : null}
                        {coupon.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(coupon)}
                        className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
                        title="Delete coupon"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
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
            Showing {sortedCoupons.length > 0 ? startIndex + 1 : 0} to{" "}
            {Math.min(endIndex, sortedCoupons.length)} of {sortedCoupons.length} entries
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Delete Coupon Promo Code
                </h3>
                <p className="text-xs text-neutral-500">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Code:</span>{" "}
                <span className="font-mono font-bold text-rose-700">{deleteTarget.code}</span>
              </p>
              <p>
                <span className="font-bold">Discount:</span>{" "}
                {deleteTarget.discountType === "Percentage"
                  ? `${deleteTarget.discountValue}% OFF`
                  : `₹${deleteTarget.discountValue} OFF`}
              </p>
              <p>
                <span className="font-bold">Expiry Date:</span>{" "}
                {new Date(deleteTarget.endDate).toLocaleDateString("en-IN")}
              </p>
            </div>

            <p className="text-xs text-neutral-600">
              Customers will no longer be able to apply this promo code during checkout.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCoupon}
                disabled={isDeleting}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Coupon</span>
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

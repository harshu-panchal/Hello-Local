import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getAllShopAds,
  createShopAd,
  updateShopAd,
  deleteShopAd,
  toggleShopAdStatus,
  type ShopAd,
} from "../../../services/api/admin/adminShopAdService";
import { uploadImage } from "../../../services/api/uploadService";
import {
  adminGetAllAdRequests,
  adminApproveAdRequest,
  adminRejectAdRequest,
  adminVerifyPaymentAndActivate,
  adminGetAdRequestStats,
} from "../../../services/api/sellerAdRequestService";
import { useToast } from "../../../context/ToastContext";

type FormData = Partial<ShopAd>;

const initialForm: FormData = {
  shopName: "",
  tagline: "",
  description: "",
  imageUrl: "",
  badge: "PREMIUM",
  badgeColor: "#FF4B6E",
  ctaText: "Visit Shop",
  ctaLink: "",
  order: 0,
  isActive: true,
  contactInfo: { name: "", phone: "", email: "" },
  requestedBy: "",
  expiresAt: "",
  startDate: "",
};

export default function AdminShopAds() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<"ads" | "requests">(
    searchParams.get("tab") === "requests" ? "requests" : "ads"
  );

  // Data State
  const [ads, setAds] = useState<ShopAd[]>([]);
  const [adRequests, setAdRequests] = useState<any[]>([]);
  const [requestStats, setRequestStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals & Form State (Ads)
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState<ShopAd | null>(null);
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ShopAd | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Search & Filter State (Ads Tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Ad Request Modals & Actions
  const [approveModal, setApproveModal] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [detailsModal, setDetailsModal] = useState<any | null>(null);
  const [approvePrice, setApprovePrice] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [requestFilter, setRequestFilter] = useState("Pending");

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        search: debouncedSearch || undefined,
        status:
          filterStatus === "active"
            ? "active"
            : filterStatus === "inactive"
            ? "inactive"
            : undefined,
      };
      const res = await getAllShopAds(params);
      setAds(res.data || []);
    } catch {
      showToast("Failed to load shop ads", "error");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatus, showToast]);

  const fetchAdRequests = useCallback(async () => {
    try {
      const [reqRes, statsRes] = await Promise.all([
        adminGetAllAdRequests(requestFilter !== "All" ? requestFilter : undefined),
        adminGetAdRequestStats(),
      ]);
      if (reqRes.success) setAdRequests(reqRes.data || []);
      if (statsRes.success) setRequestStats(statsRes.data);
    } catch {
      showToast("Failed to load ad requests", "error");
    }
  }, [requestFilter, showToast]);

  useEffect(() => {
    fetchAds();
    fetchAdRequests();
  }, [fetchAds, fetchAdRequests]);

  // Handle deep linking for specific requests from notifications
  useEffect(() => {
    const requestId = searchParams.get("requestId");
    if (requestId && adRequests.length > 0) {
      const req = adRequests.find((r) => r._id === requestId);
      if (req) {
        setDetailsModal(req);
        setActiveTab("requests");
      }
    }
  }, [searchParams, adRequests]);

  const handleOpenCreate = () => {
    setEditingAd(null);
    setForm(initialForm);
    setShowModal(true);
  };

  const handleOpenEdit = (ad: ShopAd) => {
    setEditingAd(ad);
    setForm({
      shopName: ad.shopName,
      tagline: ad.tagline,
      description: ad.description || "",
      imageUrl: ad.imageUrl,
      badge: ad.badge || "PREMIUM",
      badgeColor: ad.badgeColor || "#FF4B6E",
      ctaText: ad.ctaText || "Visit Shop",
      ctaLink: ad.ctaLink || "",
      order: ad.order,
      isActive: ad.isActive,
      contactInfo: ad.contactInfo || { name: "", phone: "", email: "" },
      requestedBy: ad.requestedBy || "",
      startDate: ad.startDate ? new Date(ad.startDate).toISOString().split("T")[0] : "",
      expiresAt: ad.expiresAt ? new Date(ad.expiresAt).toISOString().split("T")[0] : "",
    });
    setShowModal(true);
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const result = await uploadImage(file, "hellolocal/shop-ads");
      const url = result.url || result.secureUrl;
      if (url) {
        setForm((prev) => ({ ...prev, imageUrl: url }));
        showToast("Image uploaded successfully", "success");
      } else {
        throw new Error("No URL returned");
      }
    } catch {
      showToast("Failed to upload image", "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shopName || !form.tagline || !form.imageUrl) {
      showToast("Shop name, tagline, and image are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        contactInfo: form.contactInfo,
        expiresAt: form.expiresAt || undefined,
        startDate: form.startDate || undefined,
      };

      if (editingAd) {
        await updateShopAd(editingAd._id, payload);
        showToast("Shop ad updated successfully!", "success");
      } else {
        await createShopAd(payload);
        showToast("Shop ad created successfully!", "success");
      }
      setShowModal(false);
      fetchAds();
      fetchAdRequests();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to save shop ad", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteShopAd(id);
      showToast("Shop ad deleted successfully", "success");
      setDeleteConfirm(null);
      fetchAds();
      fetchAdRequests();
    } catch {
      showToast("Failed to delete shop ad", "error");
    }
  };

  const handleToggle = async (id: string) => {
    try {
      setTogglingId(id);
      await toggleShopAdStatus(id);
      setAds((prev) =>
        prev.map((a) => (a._id === id ? { ...a, isActive: !a.isActive } : a))
      );
      showToast("Status updated", "success");
      fetchAdRequests();
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const handleExportAds = () => {
    if (ads.length === 0) {
      showToast("No ads available to export", "info");
      return;
    }

    const headers = [
      "ID",
      "Shop Name",
      "Tagline",
      "Badge",
      "Order",
      "Status",
      "Requested By",
      "Phone",
      "Start Date",
      "Expiry Date",
    ];

    const csvContent = [
      headers.join(","),
      ...ads.map((a) => [
        `"${a._id}"`,
        `"${a.shopName.replace(/"/g, '""')}"`,
        `"${a.tagline.replace(/"/g, '""')}"`,
        `"${a.badge || ""}"`,
        a.order,
        a.isActive ? "Active" : "Inactive",
        `"${a.requestedBy || ""}"`,
        `"${a.contactInfo?.phone || ""}"`,
        `"${a.startDate ? new Date(a.startDate).toLocaleDateString("en-IN") : ""}"`,
        `"${a.expiresAt ? new Date(a.expiresAt).toLocaleDateString("en-IN") : ""}"`,
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_shop_ads_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Shop ads exported successfully", "success");
  };

  const activeAdsCount = useMemo(() => ads.filter((a) => a.isActive).length, [ads]);
  const inactiveAdsCount = useMemo(() => ads.filter((a) => !a.isActive).length, [ads]);
  const expiringSoonCount = useMemo(
    () =>
      ads.filter(
        (a) =>
          a.expiresAt &&
          new Date(a.expiresAt) < new Date(Date.now() + 7 * 86400000)
      ).length,
    [ads]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>🎯</span> Shop Ad Carousel
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage promotional sponsored hero ads and inbound seller carousel placement requests
          </p>
        </div>

        <div className="flex items-center gap-3">
          <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500 hidden sm:block">
            <Link
              to="/admin/dashboard"
              className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
            >
              Dashboard
            </Link>
            <span className="mx-2 text-neutral-300">/</span>
            <span className="text-neutral-700 font-medium">Shop Ads</span>
          </nav>

          <button
            onClick={handleOpenCreate}
            id="admin-shop-ads-add-btn"
            className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors min-h-[40px] shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add New Ad</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-xl shrink-0">
            📢
          </div>
          <div>
            <div className="text-xl font-extrabold text-neutral-900 leading-tight">{ads.length}</div>
            <div className="text-xs font-medium text-neutral-500 mt-0.5">Total Ads</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center text-xl shrink-0">
            ✅
          </div>
          <div>
            <div className="text-xl font-extrabold text-rose-700 leading-tight">
              {activeAdsCount}/10
            </div>
            <div className="text-xs font-medium text-neutral-500 mt-0.5">Active Slots</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl shrink-0">
            ⏸
          </div>
          <div>
            <div className="text-xl font-extrabold text-amber-700 leading-tight">
              {inactiveAdsCount}
            </div>
            <div className="text-xs font-medium text-neutral-500 mt-0.5">Inactive Ads</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center text-xl shrink-0">
            ⚠️
          </div>
          <div>
            <div className="text-xl font-extrabold text-red-600 leading-tight">
              {expiringSoonCount}
            </div>
            <div className="text-xs font-medium text-neutral-500 mt-0.5">Expiring Soon</div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("ads")}
          className={`px-5 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "ads"
              ? "border-rose-700 text-rose-700"
              : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <span>📋 Manage Ads</span>
          <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full text-[11px]">
            {ads.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`px-5 py-2.5 text-xs sm:text-sm font-bold transition-all border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "requests"
              ? "border-rose-700 text-rose-700"
              : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <span>📢 Seller Ad Requests</span>
          {requestStats?.pending > 0 && (
            <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
              {requestStats.pending}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: MANAGE ADS */}
      {activeTab === "ads" && (
        <div className="space-y-4">
          {/* Controls Filter & CSV */}
          <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search shop, tagline, requester..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[40px]"
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
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[40px]"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <button
              onClick={handleExportAds}
              disabled={ads.length === 0}
              className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[40px] disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>

          {/* Cards Grid */}
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-rose-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-neutral-500 font-medium">Loading shop ads...</p>
            </div>
          ) : ads.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-12 text-center shadow-sm">
              <div className="text-4xl mb-2">📢</div>
              <h3 className="text-base font-bold text-neutral-800">No Shop Ads Found</h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? `No campaigns match "${searchQuery}"`
                  : "Create your first shop advertisement to showcase on the home carousel."}
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-4 bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm"
              >
                Add First Ad
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {ads.map((ad, index) => (
                <div
                  key={ad._id}
                  className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                >
                  {/* Banner Image Preview */}
                  <div className="relative h-44 bg-neutral-900 overflow-hidden">
                    <img
                      src={ad.imageUrl}
                      alt={ad.shopName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://placehold.co/400x160/1a1a2e/ffffff?text=No+Image";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Badge */}
                    {ad.badge && (
                      <div
                        className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white shadow"
                        style={{ backgroundColor: ad.badgeColor || "#FF4B6E" }}
                      >
                        {ad.badge}
                      </div>
                    )}

                    {/* Slot Order */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-md text-[10px] font-mono font-bold">
                      #{index + 1}
                    </div>

                    {/* Store Title in Banner */}
                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <div className="text-base font-extrabold truncate">{ad.shopName}</div>
                      <div className="text-xs text-white/90 truncate">{ad.tagline}</div>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5 text-xs text-neutral-600">
                      {ad.requestedBy && (
                        <div className="flex items-center gap-1.5">
                          <span>👤</span>
                          <span className="truncate">
                            Requester: <strong>{ad.requestedBy}</strong>
                          </span>
                        </div>
                      )}
                      {ad.contactInfo?.phone && (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span>📞</span>
                          <span>{ad.contactInfo.phone}</span>
                        </div>
                      )}
                      {ad.expiresAt && (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span>🗓</span>
                          <span
                            className={
                              new Date(ad.expiresAt) < new Date()
                                ? "text-red-600 font-bold"
                                : "text-neutral-500"
                            }
                          >
                            Expires: {new Date(ad.expiresAt).toLocaleDateString("en-IN")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions & Status Toggle */}
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(ad._id)}
                        disabled={togglingId === ad._id}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 min-h-[36px] ${
                          ad.isActive
                            ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                        }`}
                      >
                        {togglingId === ad._id ? (
                          <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : null}
                        <span>{ad.isActive ? "● Active" : "○ Inactive"}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(ad)}
                          className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                          title="Edit Ad"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(ad)}
                          className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                          title="Delete Ad"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SELLER AD REQUESTS */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          {/* Request Status Breakdown & 7-Day Schedule Overview */}
          {requestStats && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Pending", value: requestStats.pending, color: "text-amber-600 bg-amber-50" },
                  { label: "Approved", value: requestStats.approved, color: "text-blue-600 bg-blue-50" },
                  { label: "Payment Pending", value: requestStats.paymentPending, color: "text-purple-600 bg-purple-50" },
                  { label: "Live", value: requestStats.live, color: "text-emerald-600 bg-emerald-50" },
                  { label: "Rejected", value: requestStats.rejected, color: "text-red-600 bg-red-50" },
                  {
                    label: `Slots (${requestStats.activeAds}/${requestStats.maxAds})`,
                    value: `${requestStats.activeAds}/${requestStats.maxAds}`,
                    color: requestStats.activeAds >= requestStats.maxAds ? "text-red-600 bg-red-50" : "text-rose-700 bg-rose-50",
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-white p-3 rounded-2xl border border-neutral-200/80 text-center shadow-sm">
                    <div className={`text-xl font-extrabold ${s.color.split(" ")[0]}`}>{s.value}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* 7-Day Booking Schedule */}
              <div className="bg-white rounded-2xl border border-neutral-200/80 p-4 shadow-sm">
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>📅</span> Next 7 Days Slot Availability
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {requestStats?.dailyAvailability?.slice(0, 7).map((day: any) => (
                    <div
                      key={day.date}
                      className={`p-2.5 rounded-xl border text-center ${
                        day.slotsBooked >= 10
                          ? "bg-red-50/70 border-red-200"
                          : "bg-neutral-50/50 border-neutral-200/70"
                      }`}
                    >
                      <div className="text-[10px] font-bold text-neutral-400">
                        {new Date(day.date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div
                        className={`text-sm font-extrabold my-0.5 ${
                          day.slotsBooked >= 10 ? "text-red-600" : "text-neutral-800"
                        }`}
                      >
                        {day.slotsBooked}/10
                      </div>
                      <div className="w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            day.slotsBooked >= 10 ? "bg-red-500" : "bg-rose-700"
                          }`}
                          style={{ width: `${Math.min(100, (day.slotsBooked / 10) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2 pt-1">
            {["Pending", "Approved", "PaymentPending", "Live", "Rejected", "All"].map((f) => (
              <button
                key={f}
                onClick={() => setRequestFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[36px] ${
                  requestFilter === f
                    ? "bg-rose-700 text-white shadow-sm"
                    : "bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {f === "PaymentPending" ? "💳 Awaiting Payment" : f}
              </button>
            ))}
          </div>

          {/* Requests List */}
          {adRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-12 text-center shadow-sm">
              <div className="text-4xl mb-2">📭</div>
              <h3 className="text-base font-bold text-neutral-800">
                No {requestFilter !== "All" ? requestFilter : ""} Requests Found
              </h3>
            </div>
          ) : (
            <div className="space-y-3">
              {adRequests.map((req: any) => (
                <div
                  key={req._id}
                  className="bg-white rounded-2xl border border-neutral-200/80 p-4 sm:p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <img
                      src={req.imageUrl}
                      alt={req.shopName}
                      className="w-28 h-20 object-cover rounded-xl border border-neutral-200 shrink-0"
                      onError={(e: any) => {
                        e.target.src =
                          "https://placehold.co/120x80/1a1a2e/fff?text=Ad";
                      }}
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-extrabold text-neutral-900">
                          {req.shopName}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            req.status === "Pending"
                              ? "bg-amber-100 text-amber-800"
                              : req.status === "Approved"
                              ? "bg-blue-100 text-blue-800"
                              : req.status === "Live"
                              ? "bg-emerald-100 text-emerald-800"
                              : req.status === "Rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {req.status === "PaymentPending"
                            ? "💳 Awaiting Payment Verification"
                            : req.status}
                        </span>
                        {req.adPrice > 0 && (
                          <span className="bg-emerald-50 text-emerald-700 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                            ₹{req.adPrice}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-neutral-500 italic">{req.tagline}</p>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 pt-1">
                        <span className="bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-md">
                          📅 Scheduled:{" "}
                          {req.startDate
                            ? new Date(req.startDate).toLocaleDateString("en-IN")
                            : "ASAP"}
                        </span>
                        <span>👤 Seller: {req.sellerName}</span>
                        <span>
                          🕐 Sent: {new Date(req.createdAt).toLocaleDateString("en-IN")}
                        </span>
                      </div>

                      {req.status === "PaymentPending" && (
                        <div className="mt-2 p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs space-y-1">
                          <strong className="text-purple-900">💳 Payment Submitted</strong>
                          <div className="text-neutral-600">
                            Method: {req.paymentMethod || "N/A"} · Ref/UTR:{" "}
                            <span className="font-mono font-bold">
                              {req.paymentReference || "N/A"}
                            </span>
                          </div>
                          {req.paymentScreenshotUrl && (
                            <a
                              href={req.paymentScreenshotUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-700 hover:text-purple-900 font-bold inline-block"
                            >
                              📸 View Payment Screenshot ›
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => setDetailsModal(req)}
                      className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold transition-colors min-h-[38px]"
                    >
                      👁 View Details
                    </button>

                    {req.status === "Pending" && (
                      <>
                        <button
                          onClick={() => {
                            setRejectModal(req);
                            setRejectNote("");
                          }}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-colors min-h-[38px]"
                        >
                          ❌ Reject
                        </button>
                        <button
                          onClick={() => {
                            setApproveModal(req);
                            setApprovePrice(req.requestedPrice ? String(req.requestedPrice) : "");
                            setApproveNote("");
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors min-h-[38px] shadow-sm"
                        >
                          ✅ Approve & Request Payment
                        </button>
                      </>
                    )}

                    {req.status === "PaymentPending" && (
                      <>
                        <button
                          onClick={() => {
                            setRejectModal(req);
                            setRejectNote("");
                          }}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-colors min-h-[38px]"
                        >
                          ❌ Reject Payment
                        </button>
                        <button
                          onClick={() => setDetailsModal(req)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors min-h-[38px] shadow-sm"
                        >
                          🟢 Verify & Activate
                        </button>
                      </>
                    )}

                    {req.status === "Live" && (
                      <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs">
                        🟢 Live on Storefront
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-neutral-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">
                {editingAd ? "✏️ Edit Shop Advertisement" : "➕ Compose New Shop Ad"}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Banner Live Preview */}
              {form.imageUrl && (
                <div className="relative h-36 rounded-xl overflow-hidden bg-neutral-900 shadow">
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  {form.badge && (
                    <span
                      className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white shadow"
                      style={{ backgroundColor: form.badgeColor || "#FF4B6E" }}
                    >
                      {form.badge}
                    </span>
                  )}
                  <div className="absolute bottom-2.5 left-2.5 text-white">
                    <div className="text-sm font-extrabold">{form.shopName || "Shop Name"}</div>
                    <div className="text-xs text-white/90">{form.tagline || "Shop Tagline"}</div>
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adFormShopName" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Shop Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="adFormShopName"
                    type="text"
                    required
                    value={form.shopName || ""}
                    onChange={(e) => setForm((p) => ({ ...p, shopName: e.target.value }))}
                    placeholder="e.g. Gourmet Garden"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="adFormTagline" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Tagline <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="adFormTagline"
                    type="text"
                    required
                    value={form.tagline || ""}
                    onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                    placeholder="e.g. Exotic Organic Produce"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[42px]"
                  />
                </div>
              </div>

              {/* Image Upload Box */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Ad Image Banner <span className="text-red-500">*</span>
                </label>
                <label className="block border-2 border-dashed border-neutral-300 rounded-xl p-4 text-center cursor-pointer hover:border-rose-600 transition-colors bg-neutral-50/50">
                  {uploadingImage ? (
                    <div className="py-3 flex flex-col items-center gap-1.5">
                      <div className="w-5 h-5 border-2 border-rose-700 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-neutral-500">Uploading banner...</span>
                    </div>
                  ) : (
                    <div>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-1 text-neutral-400">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      <p className="text-xs font-bold text-neutral-700">Click to upload ad banner</p>
                      <p className="text-[10px] text-neutral-400">Recommended 800×300 PNG/JPG/WebP</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                  />
                </label>
              </div>

              {/* Badge & Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adFormBadgeText" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Badge Text
                  </label>
                  <input
                    id="adFormBadgeText"
                    type="text"
                    value={form.badge || ""}
                    onChange={(e) => setForm((p) => ({ ...p, badge: e.target.value }))}
                    placeholder="PREMIUM / EXCLUSIVE"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="adFormBadgeColor" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Badge Color
                  </label>
                  <input
                    id="adFormBadgeColor"
                    type="color"
                    value={form.badgeColor || "#FF4B6E"}
                    onChange={(e) => setForm((p) => ({ ...p, badgeColor: e.target.value }))}
                    className="w-full px-2 py-1 border border-neutral-300 rounded-xl h-[42px] cursor-pointer bg-white"
                  />
                </div>
              </div>

              {/* Schedule Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adFormStartDate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Scheduled Start Date
                  </label>
                  <input
                    id="adFormStartDate"
                    type="date"
                    value={form.startDate || ""}
                    onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label htmlFor="adFormExpiryDate" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Expires On
                  </label>
                  <input
                    id="adFormExpiryDate"
                    type="date"
                    value={(form.expiresAt as string) || ""}
                    onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none min-h-[42px]"
                  />
                </div>
              </div>

              {/* Requester Contact */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider block">
                  👤 Shopkeeper Contact
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="adFormRequester" className="block text-[10px] font-bold text-neutral-600 mb-1 uppercase">
                      Requester Name
                    </label>
                    <input
                      id="adFormRequester"
                      type="text"
                      value={form.requestedBy || ""}
                      onChange={(e) => setForm((p) => ({ ...p, requestedBy: e.target.value }))}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="adFormContactPhone" className="block text-[10px] font-bold text-neutral-600 mb-1 uppercase">
                      Phone Number
                    </label>
                    <input
                      id="adFormContactPhone"
                      type="tel"
                      value={form.contactInfo?.phone || ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          contactInfo: { ...p.contactInfo, phone: e.target.value },
                        }))
                      }
                      placeholder="+91 9876543210"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white focus:border-rose-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Active Toggle */}
              <div>
                <label htmlFor="adFormActiveCheckbox" className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    id="adFormActiveCheckbox"
                    type="checkbox"
                    checked={form.isActive ?? true}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded text-rose-700 focus:ring-rose-600 border-neutral-300"
                  />
                  <span className="text-xs font-bold text-neutral-800">
                    Active (Live on consumer storefront carousel)
                  </span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingAd ? "Update Ad" : "Create Ad"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
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
                <h3 className="font-bold text-neutral-900 text-base">Delete Shop Advertisement</h3>
                <p className="text-xs text-neutral-500">
                  This banner will be permanently removed from the carousel.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs space-y-1">
              <p>
                <span className="font-bold">Shop:</span> {deleteConfirm.shopName}
              </p>
              <p className="text-neutral-500 italic">{deleteConfirm.tagline}</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm._id)}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl min-h-[44px] shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {approveModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>✅</span> Approve Ad Request
            </h3>
            <p className="text-xs text-neutral-600">
              Shop: <strong>{approveModal.shopName}</strong>
              <br />
              Scheduled:{" "}
              <strong>
                {approveModal.startDate
                  ? new Date(approveModal.startDate).toLocaleDateString("en-IN")
                  : "Today"}
              </strong>
            </p>

            <div>
              <label htmlFor="modalApprovePriceInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase">
                Ad Price (₹) <span className="text-red-500">*</span>
              </label>
              <input
                id="modalApprovePriceInput"
                type="number"
                value={approvePrice}
                onChange={(e) => setApprovePrice(e.target.value)}
                placeholder="e.g. 799"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-bold bg-white focus:border-rose-600 outline-none min-h-[42px]"
              />
            </div>

            <div>
              <label htmlFor="modalApproveNoteTextarea" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase">
                Note to Seller (Optional)
              </label>
              <textarea
                id="modalApproveNoteTextarea"
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="Payment instructions or remarks..."
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs bg-white focus:border-rose-600 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveModal(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!approvePrice || parseFloat(approvePrice) <= 0) {
                    showToast("Please set a valid price", "error");
                    return;
                  }
                  try {
                    await adminApproveAdRequest(
                      approveModal._id,
                      parseFloat(approvePrice),
                      approveNote
                    );
                    showToast("✅ Request approved. Waiting for seller payment.", "success");
                    setApproveModal(null);
                    fetchAdRequests();
                  } catch (e: any) {
                    showToast(e?.response?.data?.message || "Failed to approve", "error");
                  }
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl min-h-[44px] shadow-sm"
              >
                Approve (Request Payment)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
              <span>❌</span> Reject Request
            </h3>
            <p className="text-xs text-neutral-600">
              Shop: <strong>{rejectModal.shopName}</strong>
            </p>

            <div>
              <label htmlFor="modalRejectNoteTextarea" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase">
                Reason for Rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                id="modalRejectNoteTextarea"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Image quality too low, please re-upload..."
                rows={3}
                className="w-full px-3 py-2 border border-red-300 rounded-xl text-xs bg-white focus:border-red-500 outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!rejectNote.trim()) {
                    showToast("Please provide a rejection reason", "error");
                    return;
                  }
                  try {
                    await adminRejectAdRequest(rejectModal._id, rejectNote);
                    showToast("Request rejected. Seller notified.", "success");
                    setRejectModal(null);
                    fetchAdRequests();
                    fetchAds();
                  } catch (e: any) {
                    showToast(e?.response?.data?.message || "Failed to reject", "error");
                  }
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl min-h-[44px] shadow-sm"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {detailsModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-neutral-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-base font-bold text-neutral-900">Ad Request Details</h2>
              <button
                type="button"
                onClick={() => setDetailsModal(null)}
                className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Banner Preview */}
            <div className="relative h-40 rounded-xl overflow-hidden bg-neutral-900">
              <img
                src={detailsModal.imageUrl}
                alt={detailsModal.shopName}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-3 left-3 text-white">
                <div className="text-base font-extrabold">{detailsModal.shopName}</div>
                <div className="text-xs text-white/90">{detailsModal.tagline}</div>
              </div>
            </div>

            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200/70">
                <div className="text-[10px] text-neutral-400 font-bold">Seller</div>
                <div className="font-bold text-neutral-800">{detailsModal.sellerName}</div>
              </div>
              <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200/70">
                <div className="text-[10px] text-neutral-400 font-bold">Scheduled</div>
                <div className="font-bold text-neutral-800">
                  {detailsModal.startDate
                    ? new Date(detailsModal.startDate).toLocaleDateString("en-IN")
                    : "ASAP"}
                </div>
              </div>
            </div>

            {/* Payment Proof */}
            {detailsModal.status === "PaymentPending" && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs space-y-2">
                <div className="font-bold text-purple-900">💳 Payment Proof</div>
                <div className="text-neutral-700">
                  Method: {detailsModal.paymentMethod || "N/A"} · Ref/UTR:{" "}
                  <span className="font-mono font-bold">
                    {detailsModal.paymentReference || "N/A"}
                  </span>
                </div>
                {detailsModal.paymentScreenshotUrl && (
                  <img
                    src={detailsModal.paymentScreenshotUrl}
                    alt="Payment proof"
                    className="w-full rounded-lg border border-purple-200 max-h-48 object-contain bg-white cursor-pointer"
                    onClick={() => window.open(detailsModal.paymentScreenshotUrl, "_blank")}
                  />
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setDetailsModal(null)}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl min-h-[44px]"
              >
                Close
              </button>

              {detailsModal.status === "PaymentPending" && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminVerifyPaymentAndActivate(detailsModal._id);
                      showToast("✅ Payment verified! Ad is now LIVE 🎉", "success");
                      setDetailsModal(null);
                      fetchAdRequests();
                      fetchAds();
                    } catch (e: any) {
                      showToast(e?.response?.data?.message || "Failed to activate", "error");
                    }
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl min-h-[44px] shadow-sm"
                >
                  🟢 Confirm & Make LIVE
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Shop Ad Carousel & Merchant Advertising Engine
      </footer>
    </div>
  );
}

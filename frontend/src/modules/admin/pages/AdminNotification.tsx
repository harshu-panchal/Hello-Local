import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getNotifications,
  createNotification,
  deleteNotification,
  type Notification as NotificationType,
  type CreateNotificationData,
} from "../../../services/api/admin/adminNotificationService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminNotification() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    recipientType: "All" as "All" | "Admin" | "Seller" | "Customer" | "Delivery",
    title: "",
    message: "",
  });

  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [messageError, setMessageError] = useState("");

  // Filters & Search State
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [totalPages, setTotalPages] = useState(1);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [filterRecipientType, setFilterRecipientType] = useState<string>("All");

  // Deletion Modal State
  const [deleteTarget, setDeleteTarget] = useState<NotificationType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !token) return;

    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
      };

      if (filterRecipientType !== "All") {
        params.recipientType = filterRecipientType;
      }

      const response = await getNotifications(params);

      if (response.success && Array.isArray(response.data)) {
        setNotifications(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages || 1);
          setTotalNotifications(response.pagination.total || 0);
        }
      } else {
        setNotifications([]);
      }
    } catch (err: any) {
      console.error("Error fetching notifications:", err);
      showToast(err.response?.data?.message || "Failed to load notifications", "error");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    currentPage,
    rowsPerPage,
    filterRecipientType,
    debouncedSearch,
    showToast,
  ]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "title") {
      setFormData((prev) => ({ ...prev, title: value.slice(0, 100) }));
      if (titleError) setTitleError("");
      return;
    }
    if (name === "message") {
      setFormData((prev) => ({ ...prev, message: value.slice(0, 1000) }));
      if (messageError) setMessageError("");
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const title = formData.title.trim();
    const message = formData.message.trim();

    if (!title) {
      setTitleError("Notification title is required");
      hasError = true;
    } else if (title.length < 3) {
      setTitleError("Title must be at least 3 characters");
      hasError = true;
    } else {
      setTitleError("");
    }

    if (!message) {
      setMessageError("Notification message is required");
      hasError = true;
    } else if (message.length < 10) {
      setMessageError("Message must be at least 10 characters");
      hasError = true;
    } else {
      setMessageError("");
    }

    if (hasError) return;

    setSubmitting(true);
    try {
      const notificationData: CreateNotificationData = {
        recipientType: formData.recipientType,
        title: title,
        message: message,
        type: "Info",
        priority: "Medium",
      };

      const response = await createNotification(notificationData);

      if (response.success) {
        showToast("Notification broadcast dispatched successfully!", "success");
        setTitleError("");
        setMessageError("");
        setFormData({
          recipientType: "All",
          title: "",
          message: "",
        });
        fetchNotifications();
      } else {
        showToast(response.message || "Failed to send notification", "error");
      }
    } catch (err: any) {
      console.error("Error sending notification:", err);
      showToast(err.response?.data?.message || "Error sending notification", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteNotification = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteNotification(deleteTarget._id);
      if (response.success) {
        setNotifications((prev) => prev.filter((n) => n._id !== deleteTarget._id));
        setTotalNotifications((prev) => Math.max(0, prev - 1));
        showToast("Notification deleted successfully", "success");
        setDeleteTarget(null);
        fetchNotifications();
      } else {
        showToast(response.message || "Failed to delete notification", "error");
      }
    } catch (err: any) {
      console.error("Error deleting notification:", err);
      showToast(err.response?.data?.message || "Error deleting notification", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "recipientType":
          aValue = a.recipientType;
          bValue = b.recipientType;
          break;
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "message":
          aValue = a.message.toLowerCase();
          bValue = b.message.toLowerCase();
          break;
        case "createdAt":
          aValue = new Date(a.createdAt || "").getTime();
          bValue = new Date(b.createdAt || "").getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [notifications, sortColumn, sortDirection]);

  const startIndex = (currentPage - 1) * rowsPerPage;

  const getRecipientDisplayName = (recipientType: string): string => {
    if (recipientType === "All") return "All Users";
    return recipientType;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Broadcast & Notifications
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Send platform-wide alerts, push announcements, and segment-targeted broadcasts
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
          <span className="text-neutral-700 font-medium">Notification</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Compose & Send Notification */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Compose Announcement
            </h2>
            <span className="text-xs bg-white/15 px-2.5 py-0.5 rounded-full font-medium">
              Multi-Device Push
            </span>
          </div>

          <form onSubmit={handleSendNotification} className="p-5 space-y-4">
            {/* User Type Selection */}
            <div>
              <label htmlFor="composeRecipientSelect" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Target Audience Group <span className="text-red-500">*</span>
              </label>
              <select
                id="composeRecipientSelect"
                name="recipientType"
                value={formData.recipientType}
                onChange={handleInputChange}
                disabled={submitting}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="All">All Users (Customers, Sellers & Couriers)</option>
                <option value="Customer">Customers Only</option>
                <option value="Seller">Sellers / Store Owners Only</option>
                <option value="Delivery">Delivery Couriers Only</option>
                <option value="Admin">Administrators Only</option>
              </select>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="composeTitleInput" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Notification Title <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] font-mono text-neutral-400">
                  {formData.title.length}/100
                </span>
              </div>
              <input
                id="composeTitleInput"
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                disabled={submitting}
                placeholder="e.g. Flash Weekend Deals Live Now!"
                maxLength={100}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px] ${
                  titleError ? "border-red-400 bg-red-50/20" : "border-neutral-300"
                }`}
              />
              {titleError && <p className="text-[11px] font-semibold text-red-500 mt-1">{titleError}</p>}
            </div>

            {/* Message Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="composeMessageTextarea" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Message Content <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] font-mono text-neutral-400">
                  {formData.message.length}/1000
                </span>
              </div>
              <textarea
                id="composeMessageTextarea"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                disabled={submitting}
                placeholder="Write your push notification message (min 10 characters)..."
                rows={5}
                maxLength={1000}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none resize-none ${
                  messageError ? "border-red-400 bg-red-50/20" : "border-neutral-300"
                }`}
              />
              {messageError && <p className="text-[11px] font-semibold text-red-500 mt-1">{messageError}</p>}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Broadcasting Notification...</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Dispatch Broadcast</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Panel: Sent History & Activity Log */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Broadcast History ({totalNotifications})
            </h2>
          </div>

          {/* Filters Bar */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Audience Filter */}
              <div>
                <label htmlFor="historyAudienceFilter" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Audience Filter
                </label>
                <select
                  id="historyAudienceFilter"
                  value={filterRecipientType}
                  onChange={(e) => {
                    setFilterRecipientType(e.target.value);
                    setCurrentPage(1);
                  }}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="All">All Audiences</option>
                  <option value="Customer">Customers</option>
                  <option value="Seller">Sellers</option>
                  <option value="Delivery">Delivery Couriers</option>
                  <option value="Admin">Admins</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="historySearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search Broadcasts
                </label>
                <div className="relative">
                  <input
                    id="historySearchInput"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by title, message..."
                    className="w-full pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Rows per page */}
            <div className="flex items-center justify-between pt-1">
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
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24"
                    onClick={() => handleSort("recipientType")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Audience</span>
                      <span className="text-neutral-400">{sortColumn === "recipientType" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                    onClick={() => handleSort("title")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Title & Message</span>
                      <span className="text-neutral-400">{sortColumn === "title" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32 text-right"
                    onClick={() => handleSort("createdAt")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Sent Date</span>
                      <span className="text-neutral-400">{sortColumn === "createdAt" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th className="py-3 px-3 w-20 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loading ? (
                  [1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-6 mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-48 mb-1" /><div className="h-3 bg-neutral-200 rounded w-32" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-20 ml-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-8 bg-neutral-200 rounded-lg w-12 mx-auto" /></td>
                    </tr>
                  ))
                ) : sortedNotifications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No broadcasts found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchTerm
                          ? `No notifications matching "${searchTerm}"`
                          : "Compose an announcement on the left to send your first broadcast"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedNotifications.map((notification, index) => (
                    <tr key={notification._id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-3 text-center font-mono font-bold text-neutral-400">
                        {startIndex + index + 1}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            notification.recipientType === "All"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : notification.recipientType === "Customer"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : notification.recipientType === "Seller"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {getRecipientDisplayName(notification.recipientType)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-neutral-900 line-clamp-1">
                          {notification.title}
                        </div>
                        <div className="text-neutral-500 text-[11px] line-clamp-2 mt-0.5">
                          {notification.message}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-neutral-500 text-[11px]">
                        {notification.createdAt
                          ? new Date(notification.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "-"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {notification.link && (
                            <button
                              type="button"
                              onClick={() => navigate(notification.link!)}
                              className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title={notification.actionLabel || "View Link"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(notification)}
                            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                            title="Delete notification"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-neutral-600 font-medium">
                Showing {sortedNotifications.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + sortedNotifications.length, totalNotifications)} of {totalNotifications}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === 1 || loading
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
                  disabled={currentPage === totalPages || totalPages === 0 || loading}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === totalPages || totalPages === 0 || loading
                      ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                      : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
                  }`}
                  aria-label="Next page"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
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
                  Delete Notification
                </h3>
                <p className="text-xs text-neutral-500">
                  This action will remove the notification record from the platform log.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Title:</span> {deleteTarget.title}
              </p>
              <p>
                <span className="font-bold">Audience:</span> {deleteTarget.recipientType}
              </p>
              <p className="line-clamp-2 text-neutral-500">
                <span className="font-bold text-neutral-700">Message:</span> {deleteTarget.message}
              </p>
            </div>

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
                onClick={confirmDeleteNotification}
                disabled={isDeleting}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Push Notification Engine
      </footer>
    </div>
  );
}

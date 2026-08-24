import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  updateFAQStatus,
  type FAQ,
  type CreateFAQData,
  type UpdateFAQData,
} from "../../../services/api/admin/adminContentService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminFAQ() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqCategory, setFaqCategory] = useState("General");
  const [faqs, setFaqs] = useState<FAQ[]>([]);

  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>("order");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [totalPages, setTotalPages] = useState(1);
  const [totalFAQs, setTotalFAQs] = useState(0);

  // Editing & Submission State
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form Validation State
  const [faqQuestionError, setFaqQuestionError] = useState("");
  const [faqAnswerError, setFaqAnswerError] = useState("");

  // Deletion Modal State
  const [deleteTarget, setDeleteTarget] = useState<FAQ | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch FAQs from backend
  const fetchFAQs = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        status: statusFilter !== "All" ? statusFilter : undefined,
        sortBy: sortColumn || undefined,
        sortOrder: sortDirection,
      };

      const response = await getFAQs(params);

      if (response.success && Array.isArray(response.data)) {
        setFaqs(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages || 1);
          setTotalFAQs(response.pagination.total || 0);
        }
      } else {
        setFaqs([]);
      }
    } catch (err: any) {
      console.error("Error fetching FAQs:", err);
      showToast(err.response?.data?.message || "Failed to load FAQs", "error");
      setFaqs([]);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    currentPage,
    rowsPerPage,
    debouncedSearch,
    statusFilter,
    sortColumn,
    sortDirection,
    showToast,
  ]);

  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleSaveFAQ = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    const q = faqQuestion.trim();
    const a = faqAnswer.trim();

    if (!q) {
      setFaqQuestionError("FAQ Question is required");
      hasError = true;
    } else if (q.length < 5) {
      setFaqQuestionError("Question must be at least 5 characters");
      hasError = true;
    } else if (q.length > 500) {
      setFaqQuestionError("Question must be under 500 characters");
      hasError = true;
    } else {
      setFaqQuestionError("");
    }

    if (!a) {
      setFaqAnswerError("FAQ Answer is required");
      hasError = true;
    } else if (a.length < 10) {
      setFaqAnswerError("Answer must be at least 10 characters");
      hasError = true;
    } else if (a.length > 2000) {
      setFaqAnswerError("Answer must be under 2000 characters");
      hasError = true;
    } else {
      setFaqAnswerError("");
    }

    if (hasError) return;

    try {
      setSubmitting(true);

      if (editingFAQ !== null) {
        const updateData: UpdateFAQData = {
          question: q,
          answer: a,
          category: faqCategory.trim() || "General",
        };

        const response = await updateFAQ(editingFAQ._id, updateData);

        if (response.success) {
          showToast("FAQ article updated successfully!", "success");
          setEditingFAQ(null);
          setFaqQuestion("");
          setFaqAnswer("");
          setFaqCategory("General");
          fetchFAQs();
        } else {
          showToast(response.message || "Failed to update FAQ", "error");
        }
      } else {
        const faqData: CreateFAQData = {
          question: q,
          answer: a,
          category: faqCategory.trim() || "General",
          status: "Active",
        };

        const response = await createFAQ(faqData);

        if (response.success) {
          showToast("New FAQ article added successfully!", "success");
          setFaqQuestion("");
          setFaqAnswer("");
          setFaqCategory("General");
          fetchFAQs();
        } else {
          showToast(response.message || "Failed to create FAQ", "error");
        }
      }
    } catch (err: any) {
      console.error("Error saving FAQ:", err);
      showToast(err.response?.data?.message || "Failed to save FAQ article", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (faq: FAQ) => {
    setFaqQuestion(faq.question);
    setFaqAnswer(faq.answer);
    setFaqCategory(faq.category || "General");
    setEditingFAQ(faq);
    setFaqQuestionError("");
    setFaqAnswerError("");
  };

  const handleCancelEdit = () => {
    setEditingFAQ(null);
    setFaqQuestion("");
    setFaqAnswer("");
    setFaqCategory("General");
    setFaqQuestionError("");
    setFaqAnswerError("");
  };

  const handleStatusToggle = async (faq: FAQ) => {
    const currentStatus = faq.status || (faq.isActive ? "Active" : "Inactive");
    const nextStatus: "Active" | "Inactive" =
      currentStatus === "Active" ? "Inactive" : "Active";

    try {
      setTogglingId(faq._id);
      const response = await updateFAQStatus(faq._id, nextStatus);

      if (response.success) {
        setFaqs((prev) =>
          prev.map((item) =>
            item._id === faq._id ? { ...item, status: nextStatus, isActive: nextStatus === "Active" } : item
          )
        );
        showToast(`FAQ status updated to ${nextStatus}`, "success");
      }
    } catch (err: any) {
      console.error("Error updating FAQ status:", err);
      showToast(err.response?.data?.message || "Failed to toggle status", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDeleteFAQ = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteFAQ(deleteTarget._id);
      if (response.success) {
        showToast("FAQ article deleted successfully", "success");
        setFaqs((prev) => prev.filter((item) => item._id !== deleteTarget._id));
        setTotalFAQs((prev) => Math.max(0, prev - 1));
        if (editingFAQ?._id === deleteTarget._id) {
          handleCancelEdit();
        }
        setDeleteTarget(null);
        fetchFAQs();
      } else {
        showToast(response.message || "Failed to delete FAQ", "error");
      }
    } catch (err: any) {
      console.error("Error deleting FAQ:", err);
      showToast(err.response?.data?.message || "Error deleting FAQ", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    if (faqs.length === 0) {
      showToast("No FAQ records available to export", "info");
      return;
    }

    const headers = ["ID", "Category", "FAQ Question", "FAQ Answer", "Status"];
    const csvContent = [
      headers.join(","),
      ...faqs.map((faq) =>
        [
          `"${faq._id}"`,
          `"${faq.category || "General"}"`,
          `"${faq.question.replace(/"/g, '""')}"`,
          `"${faq.answer.replace(/"/g, '""')}"`,
          faq.status || (faq.isActive ? "Active" : "Inactive"),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_faqs_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("FAQ knowledge base exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * rowsPerPage;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            FAQ & Knowledge Base
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage customer self-service articles, ordering FAQs, and store support topics
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
          <span className="text-neutral-700 font-medium">FAQ</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Add / Edit FAQ */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingFAQ ? "Edit Knowledge Article" : "Create FAQ Article"}
            </h2>
            {editingFAQ && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-xs text-white/80 hover:text-white underline font-medium"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveFAQ} className="p-5 space-y-4">
            {/* Category Input */}
            <div>
              <label htmlFor="faqCategoryInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Category / Section
              </label>
              <input
                id="faqCategoryInput"
                type="text"
                value={faqCategory}
                onChange={(e) => setFaqCategory(e.target.value)}
                placeholder="e.g. Orders, Payments, Delivery, Returns"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Question Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="faqQuestionInput" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  FAQ Question <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] font-mono text-neutral-400">
                  {faqQuestion.length}/500
                </span>
              </div>
              <input
                id="faqQuestionInput"
                type="text"
                value={faqQuestion}
                onChange={(e) => {
                  setFaqQuestion(e.target.value);
                  if (faqQuestionError) setFaqQuestionError("");
                }}
                placeholder="e.g. How fast will my HelloLocal order be delivered?"
                maxLength={500}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px] ${
                  faqQuestionError ? "border-red-400 bg-red-50/20" : "border-neutral-300"
                }`}
              />
              {faqQuestionError && (
                <p className="text-[11px] font-semibold text-red-500 mt-1">{faqQuestionError}</p>
              )}
            </div>

            {/* Answer Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="faqAnswerTextarea" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  FAQ Answer <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] font-mono text-neutral-400">
                  {faqAnswer.length}/2000
                </span>
              </div>
              <textarea
                id="faqAnswerTextarea"
                value={faqAnswer}
                onChange={(e) => {
                  setFaqAnswer(e.target.value);
                  if (faqAnswerError) setFaqAnswerError("");
                }}
                placeholder="Write a clear and comprehensive answer for the customer (min 10 characters)..."
                rows={6}
                maxLength={2000}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none resize-none ${
                  faqAnswerError ? "border-red-400 bg-red-50/20" : "border-neutral-300"
                }`}
              />
              {faqAnswerError && (
                <p className="text-[11px] font-semibold text-red-500 mt-1">{faqAnswerError}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {editingFAQ && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={submitting}
                  className="w-1/3 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className={`bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm ${
                  editingFAQ ? "w-2/3" : "w-full"
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Article...</span>
                  </>
                ) : (
                  <span>{editingFAQ ? "Update FAQ" : "Publish FAQ"}</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: View FAQs Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Published FAQs ({totalFAQs})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={faqs.length === 0}
              className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors min-h-[36px] disabled:opacity-50"
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

          {/* Filters Bar */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Status Filter */}
              <div>
                <label htmlFor="faqStatusFilter" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Filter by Status
                </label>
                <select
                  id="faqStatusFilter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active Only</option>
                  <option value="Inactive">Inactive Only</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="faqSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search FAQs
                </label>
                <div className="relative">
                  <input
                    id="faqSearchInput"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search question or answer..."
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
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                    onClick={() => handleSort("question")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Question & Answer</span>
                      <span className="text-neutral-400">{sortColumn === "question" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th className="py-3 px-3 w-24 text-center">Status</th>
                  <th className="py-3 px-4 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loading ? (
                  [1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-3"><div className="h-4 bg-neutral-200 rounded w-6 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-48 mb-1" /><div className="h-3 bg-neutral-200 rounded w-32" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : faqs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No FAQs found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchTerm
                          ? `No articles matching "${searchTerm}"`
                          : "Create your first FAQ article on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  faqs.map((faq, index) => {
                    const isActive = faq.status === "Active" || (faq.status === undefined && faq.isActive);

                    return (
                      <tr key={faq._id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="py-3 px-3 text-center font-mono font-bold text-neutral-400">
                          {startIndex + index + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-neutral-900 line-clamp-1">
                            {faq.question}
                          </div>
                          <div className="text-neutral-500 text-[11px] line-clamp-2 mt-0.5">
                            {faq.answer}
                          </div>
                          {faq.category && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                              {faq.category}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(faq)}
                            disabled={togglingId === faq._id}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                              isActive
                                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                            }`}
                            title="Click to toggle status"
                          >
                            {togglingId === faq._id ? (
                              <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                            ) : null}
                            {isActive ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEdit(faq)}
                              className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Edit FAQ"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(faq)}
                              className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Delete FAQ"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-neutral-200/80 bg-neutral-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-neutral-600 font-medium">
                Showing {faqs.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + faqs.length, totalFAQs)} of {totalFAQs}
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
                  Delete FAQ Article
                </h3>
                <p className="text-xs text-neutral-500">
                  This will permanently remove the FAQ from customer self-service.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Question:</span> {deleteTarget.question}
              </p>
              <p className="line-clamp-2 text-neutral-500">
                <span className="font-bold text-neutral-700">Answer:</span> {deleteTarget.answer}
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
                onClick={confirmDeleteFAQ}
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
        HelloLocal Admin Panel • Knowledge Base Operations
      </footer>
    </div>
  );
}

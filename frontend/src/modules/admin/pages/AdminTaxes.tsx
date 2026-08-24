import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  createTax,
  getTaxes,
  updateTax,
  deleteTax,
  updateTaxStatus,
  type Tax,
  type CreateTaxData,
  type UpdateTaxData,
} from "../../../services/api/admin/adminTaxService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminTaxes() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [taxTitle, setTaxTitle] = useState("");
  const [percentage, setPercentage] = useState("");
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"name" | "percentage" | "status" | "createdAt">("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form validation errors
  const [taxTitleError, setTaxTitleError] = useState("");
  const [percentageError, setPercentageError] = useState("");
  const [formError, setFormError] = useState("");

  // Deletion Modal
  const [deleteTarget, setDeleteTarget] = useState<Tax | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch taxes
  const fetchTaxes = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getTaxes({
        search: debouncedSearch || undefined,
        page: currentPage,
        limit: rowsPerPage,
        sortBy: sortColumn,
        sortOrder: sortDirection,
      });

      if (response.success && Array.isArray(response.data)) {
        setTaxes(response.data);
      } else {
        setTaxes([]);
      }
    } catch (err: any) {
      console.error("Error fetching taxes:", err);
      const msg = err.response?.data?.message || "Failed to load tax slabs. Please try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    debouncedSearch,
    currentPage,
    rowsPerPage,
    sortColumn,
    sortDirection,
    showToast,
  ]);

  useEffect(() => {
    fetchTaxes();
  }, [fetchTaxes]);

  // Sorter
  const handleSort = (column: "name" | "percentage" | "status" | "createdAt") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Add / Update Tax
  const handleAddTax = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    let hasError = false;

    const title = taxTitle.trim();
    if (!title) {
      setTaxTitleError("Tax title is required");
      hasError = true;
    } else if (title.length < 2) {
      setTaxTitleError("Tax title must be at least 2 characters");
      hasError = true;
    } else {
      setTaxTitleError("");
    }

    const percentageValue = parseFloat(percentage);
    if (!percentage.trim()) {
      setPercentageError("Percentage is required");
      hasError = true;
    } else if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
      setPercentageError("Enter a valid percentage between 0 and 100");
      hasError = true;
    } else {
      setPercentageError("");
    }

    if (hasError) return;

    try {
      setSubmitting(true);
      setError(null);

      if (editingTax) {
        const updateData: UpdateTaxData = {
          name: title,
          percentage: percentageValue,
        };

        const response = await updateTax(editingTax._id, updateData);
        if (response.success) {
          showToast("Tax slab updated successfully!", "success");
          handleCancelEdit();
          fetchTaxes();
        } else {
          setFormError(response.message || "Failed to update tax");
        }
      } else {
        const taxData: CreateTaxData = {
          name: title,
          percentage: percentageValue,
        };

        const response = await createTax(taxData);
        if (response.success) {
          showToast("Tax slab added successfully!", "success");
          handleCancelEdit();
          fetchTaxes();
        } else {
          setFormError(response.message || "Failed to add tax");
        }
      }
    } catch (err: any) {
      console.error("Error saving tax:", err);
      const msg = err.response?.data?.message || "Failed to save tax slab. Please try again.";
      setFormError(msg);
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (tax: Tax) => {
    setTaxTitle(tax.name);
    setPercentage(tax.percentage.toString());
    setEditingTax(tax);
    setTaxTitleError("");
    setPercentageError("");
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingTax(null);
    setTaxTitle("");
    setPercentage("");
    setTaxTitleError("");
    setPercentageError("");
    setFormError("");
  };

  // Toggle tax status
  const handleToggleStatus = async (tax: Tax) => {
    const nextStatus = tax.status === "Active" ? "Inactive" : "Active";
    try {
      const response = await updateTaxStatus(tax._id, nextStatus);
      if (response.success) {
        showToast(`Tax status updated to ${nextStatus}`, "success");
        fetchTaxes();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to update tax status.";
      showToast(msg, "error");
    }
  };

  // Safe delete handler
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteTax(deleteTarget._id);
      if (response.success) {
        showToast("Tax slab deleted successfully", "success");
        setDeleteTarget(null);
        if (editingTax?._id === deleteTarget._id) {
          handleCancelEdit();
        }
        fetchTaxes();
      }
    } catch (err: any) {
      console.error("Error deleting tax:", err);
      const msg = err.response?.data?.message || "Failed to delete tax rate";
      showToast(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Export CSV
  const handleExport = () => {
    if (taxes.length === 0) {
      showToast("No tax slabs available to export", "info");
      return;
    }

    const headers = ["ID", "Tax Title", "Percentage (%)", "Status", "Created At"];
    const csvContent = [
      headers.join(","),
      ...taxes.map((tax) =>
        [
          `"${tax._id}"`,
          `"${(tax.name || "").replace(/"/g, '""')}"`,
          tax.percentage,
          tax.status,
          tax.createdAt ? new Date(tax.createdAt).toLocaleDateString("en-IN") : "",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_taxes_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Tax catalogue exported successfully", "success");
  };

  const totalPages = Math.max(1, Math.ceil(taxes.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Tax Slabs & GST Rates
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Configure platform-wide GST brackets applied to products and cart billings
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
          <span className="text-neutral-700 font-medium">Taxes</span>
        </nav>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Left Panel: Add / Edit Tax */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingTax ? "Edit Tax Slab" : "Add Tax Slab"}
            </h2>
            {editingTax && (
              <span className="text-[10px] bg-rose-800/80 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                Editing
              </span>
            )}
          </div>

          <form onSubmit={handleAddTax} className="p-5 space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-start justify-between gap-2">
                <span>{formError}</span>
                <button
                  type="button"
                  onClick={() => setFormError("")}
                  className="text-red-500 hover:text-red-700 font-bold ml-1"
                >
                  ×
                </button>
              </div>
            )}

            {/* Tax Title */}
            <div>
              <label htmlFor="taxTitleInput" className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Tax Title <span className="text-rose-600">*</span>
              </label>
              <input
                id="taxTitleInput"
                type="text"
                value={taxTitle}
                onChange={(e) => {
                  setTaxTitle(e.target.value);
                  if (taxTitleError) setTaxTitleError("");
                  if (formError) setFormError("");
                }}
                placeholder="e.g. GST 5%, GST 18%, Exempt (0%)"
                maxLength={60}
                className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none transition-all ${
                  taxTitleError
                    ? "border-red-400 focus:ring-2 focus:ring-red-500/20"
                    : "border-neutral-300 focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
                }`}
                disabled={submitting}
                required
              />
              {taxTitleError ? (
                <p className="text-[11px] text-red-500 mt-1 font-medium">{taxTitleError}</p>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1">Descriptive name displayed during billing</p>
              )}
            </div>

            {/* Percentage */}
            <div>
              <label htmlFor="percentageInput" className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Percentage (%) <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="percentageInput"
                  type="number"
                  value={percentage}
                  onChange={(e) => {
                    setPercentage(e.target.value);
                    if (percentageError) setPercentageError("");
                    if (formError) setFormError("");
                  }}
                  placeholder="0, 5, 12, 18, 28"
                  min="0"
                  max="100"
                  step="0.01"
                  className={`w-full pl-3.5 pr-8 py-2.5 border rounded-xl text-sm outline-none transition-all ${
                    percentageError
                      ? "border-red-400 focus:ring-2 focus:ring-red-500/20"
                      : "border-neutral-300 focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
                  }`}
                  disabled={submitting}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-bold">
                  %
                </span>
              </div>
              {percentageError ? (
                <p className="text-[11px] text-red-500 mt-1 font-medium">{percentageError}</p>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1">Numerical tax rate between 0% and 100%</p>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-all active:scale-98 min-h-[44px] flex items-center justify-center gap-2 ${
                  submitting
                    ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                    : "bg-rose-700 hover:bg-rose-800 text-white shadow-rose-700/20"
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Tax Slab...</span>
                  </>
                ) : editingTax ? (
                  "Update Tax Slab"
                ) : (
                  "Add Tax Slab"
                )}
              </button>

              {editingTax && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={submitting}
                  className="w-full py-2 px-4 rounded-xl text-xs sm:text-sm font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors min-h-[44px]"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Panel: Tax Slabs Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Tax Directory ({taxes.length})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              className="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors touch-target-min"
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

          {/* Controls Bar */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
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
                placeholder="Search tax slabs..."
                className="pl-8 pr-7 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none w-full sm:w-56 min-h-[38px]"
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
            <table className="w-full text-left border-collapse min-w-[540px]">
              <thead>
                <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                  <th className="py-3 px-4 w-16 text-center">Sr</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Tax Title</span>
                      <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-32 text-center"
                    onClick={() => handleSort("percentage")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Percentage</span>
                      <span className="text-neutral-400">{sortColumn === "percentage" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
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
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-6 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-12 mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-16 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center">
                      <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
                      <button
                        type="button"
                        onClick={fetchTaxes}
                        className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                      >
                        Retry Loading
                      </button>
                    </td>
                  </tr>
                ) : taxes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No tax slabs found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchTerm
                          ? `No matches for "${searchTerm}"`
                          : "Add your first tax rate using the form on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  taxes.map((tax, index) => (
                    <tr key={tax._id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-neutral-500 font-bold">
                        {startIndex + index + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-neutral-900">
                        {tax.name}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-neutral-800">
                        {tax.percentage}%
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(tax)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-transform active:scale-95 touch-target-min ${
                            tax.status === "Active"
                              ? "bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100"
                              : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                          }`}
                          title="Click to toggle status"
                        >
                          {tax.status}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(tax)}
                            disabled={submitting}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors touch-target-min"
                            title="Edit tax"
                            aria-label={`Edit ${tax.name}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(tax)}
                            disabled={submitting}
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors touch-target-min"
                            title="Delete tax"
                            aria-label={`Delete ${tax.name}`}
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
              Showing {taxes.length > 0 ? startIndex + 1 : 0} to{" "}
              {Math.min(startIndex + rowsPerPage, taxes.length)} of {taxes.length} entries
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
      </div>

      {/* Accessible Safe Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteTaxModalTitle"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 id="deleteTaxModalTitle" className="text-base font-bold text-neutral-900">
                Delete Tax Slab?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete <strong className="text-neutral-800">"{deleteTarget.name}" ({deleteTarget.percentage}%)</strong>? Tax rates assigned to active products cannot be deleted.
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

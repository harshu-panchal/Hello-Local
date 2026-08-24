import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uploadImage } from "../../../services/api/uploadService";
import { validateImageFile, createImagePreview } from "../../../utils/imageUpload";
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  type Brand,
} from "../../../services/api/admin/adminProductService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

export default function AdminBrand() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  // Data states
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [brandName, setBrandName] = useState("");
  const [brandImageFile, setBrandImageFile] = useState<File | null>(null);
  const [brandImagePreview, setBrandImagePreview] = useState<string>("");
  const [brandImageUrl, setBrandImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Table & Filter states
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"id" | "name" | "createdAt">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Modal states
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Debounce Search Input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // 2. Fetch Brands on mount or debounced search change
  const fetchBrands = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getBrands({ search: debouncedSearch });
      if (response.success && Array.isArray(response.data)) {
        setBrands(response.data);
      } else {
        setBrands([]);
      }
    } catch (err: any) {
      console.error("Error fetching brands:", err);
      const msg = err.response?.data?.message || "Failed to load brands. Please try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, debouncedSearch, showToast]);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  // 3. True In-Memory Sorting & Pagination
  const sortedBrands = useMemo(() => {
    return [...brands].sort((a, b) => {
      let valA = "";
      let valB = "";

      if (sortColumn === "id") {
        valA = a._id || "";
        valB = b._id || "";
      } else if (sortColumn === "name") {
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
      } else if (sortColumn === "createdAt") {
        valA = (a as any).createdAt || "";
        valB = (b as any).createdAt || "";
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [brands, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedBrands.length / entriesPerPage));
  const startIndex = (currentPage - 1) * entriesPerPage;
  const displayedBrands = sortedBrands.slice(startIndex, startIndex + entriesPerPage);

  const handleSort = (column: "id" | "name" | "createdAt") => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // 4. File Processing Helper
  const processImageFile = async (file: File) => {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || "Invalid image file");
      return;
    }

    setBrandImageFile(file);
    setUploadError("");

    try {
      const preview = await createImagePreview(file);
      setBrandImagePreview(preview);
    } catch {
      setUploadError("Failed to create image preview");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleRemoveImage = () => {
    setBrandImageFile(null);
    setBrandImagePreview("");
    setBrandImageUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 5. Add / Update Brand
  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = brandName.trim();

    if (!name) {
      setUploadError("Please enter a brand name");
      return;
    }
    if (name.length < 2) {
      setUploadError("Brand name must be at least 2 characters");
      return;
    }
    if (name.length > 100) {
      setUploadError("Brand name must be under 100 characters");
      return;
    }
    if (!/^[A-Za-z0-9\s\-&.]+$/.test(name)) {
      setUploadError("Brand name can only contain letters, numbers, spaces, hyphens, ampersands, and dots");
      return;
    }
    if (!brandImageFile && !brandImageUrl && !editingId) {
      setUploadError("Brand image is required");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      let finalImageUrl = brandImageUrl;

      // Upload new brand image to hellolocal/brands folder
      if (brandImageFile) {
        const imageResult = await uploadImage(brandImageFile, "hellolocal/brands");
        finalImageUrl = imageResult.secureUrl;
      }

      const brandData = {
        name: name,
        image: finalImageUrl,
      };

      if (editingId) {
        const response = await updateBrand(editingId, brandData);
        if (response.success) {
          setBrands((prev) =>
            prev.map((brand) => (brand._id === editingId ? response.data : brand))
          );
          showToast("Brand updated successfully!", "success");
          handleCancelEdit();
        }
      } else {
        const response = await createBrand(brandData);
        if (response.success) {
          setBrands((prev) => [response.data, ...prev]);
          showToast("Brand created successfully!", "success");
          handleCancelEdit();
        }
      }
    } catch (err: any) {
      console.error("Error saving brand:", err);
      const msg = err.response?.data?.message || "Failed to save brand. Please try again.";
      setUploadError(msg);
      showToast(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (brand: Brand) => {
    setEditingId(brand._id);
    setBrandName(brand.name);
    setBrandImageUrl(brand.image || "");
    setBrandImagePreview("");
    setBrandImageFile(null);
    setUploadError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setBrandName("");
    setBrandImageFile(null);
    setBrandImagePreview("");
    setBrandImageUrl("");
    setUploadError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 6. Delete Brand with Modal
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteBrand(deleteTarget._id);
      if (response.success) {
        setBrands((prev) => prev.filter((b) => b._id !== deleteTarget._id));
        showToast("Brand deleted successfully", "success");
        setDeleteTarget(null);
      }
    } catch (err: any) {
      console.error("Error deleting brand:", err);
      const msg = err.response?.data?.message || "Failed to delete brand. Please try again.";
      showToast(msg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // 7. Sanitized CSV Export
  const handleExport = () => {
    if (brands.length === 0) {
      showToast("No brands available to export", "info");
      return;
    }

    const headers = ["ID", "Brand Name", "Image URL", "Created Date"];
    const csvRows = [
      headers.join(","),
      ...brands.map((b) => {
        const id = `"${(b._id || "").replace(/"/g, '""')}"`;
        const name = `"${(b.name || "").replace(/"/g, '""')}"`;
        const img = `"${(b.image || "").replace(/"/g, '""')}"`;
        const date = `"${((b as any).createdAt ? new Date((b as any).createdAt).toLocaleDateString("en-IN") : "").replace(/"/g, '""')}"`;
        return [id, name, img, date].join(",");
      }),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hellolocal_brands_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Brand list exported successfully", "success");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Brand Management
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Create, update, and manage verified manufacturer & brand catalogues
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
          <span className="text-neutral-700 font-medium">Brands</span>
        </nav>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Left Panel - Add / Edit Brand Form */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? "Edit Brand" : "Add New Brand"}
            </h2>
            {editingId && (
              <span className="text-[10px] bg-rose-800/80 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                Editing
              </span>
            )}
          </div>

          <form onSubmit={handleAddBrand} className="p-5 space-y-4">
            {uploadError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-start justify-between gap-2">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError("")}
                  className="text-red-500 hover:text-red-700 font-bold ml-1"
                >
                  ×
                </button>
              </div>
            )}

            {/* Brand Name Input */}
            <div>
              <label htmlFor="brandNameInput" className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Brand Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="brandNameInput"
                type="text"
                value={brandName}
                onChange={(e) => {
                  setBrandName(e.target.value);
                  if (uploadError) setUploadError("");
                }}
                placeholder="e.g. Amul, Nestle, Britannia"
                maxLength={100}
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors"
                disabled={uploading}
                required
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-[11px] text-neutral-400">Letters, numbers, hyphens, and dots allowed</span>
                <span className="text-[11px] text-neutral-400 font-mono">{brandName.length}/100</span>
              </div>
            </div>

            {/* Brand Image Upload Dropzone */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Brand Logo / Image {!editingId && <span className="text-rose-600">*</span>}
              </label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (!brandImagePreview && !brandImageUrl) {
                    fileInputRef.current?.click();
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all ${
                  isDragOver
                    ? "border-rose-600 bg-rose-50/50"
                    : "border-neutral-300 hover:border-rose-500 bg-neutral-50/50"
                } ${!brandImagePreview && !brandImageUrl ? "cursor-pointer" : ""}`}
              >
                {brandImagePreview ? (
                  <div className="space-y-2">
                    <img
                      src={brandImagePreview}
                      alt="Brand preview"
                      className="max-h-28 mx-auto rounded-xl object-contain bg-white p-1 shadow-2xs"
                    />
                    <p className="text-xs text-neutral-600 font-medium truncate max-w-xs mx-auto">
                      {brandImageFile?.name}
                    </p>
                    <div className="flex items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-rose-700 hover:text-rose-800 font-bold touch-target-min"
                      >
                        Change Image
                      </button>
                      <span className="text-neutral-300">•</span>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-xs text-red-600 hover:text-red-700 font-bold touch-target-min"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : brandImageUrl ? (
                  <div className="space-y-2">
                    <img
                      src={brandImageUrl}
                      alt="Current brand logo"
                      className="max-h-28 mx-auto rounded-xl object-contain bg-white p-1 shadow-2xs"
                    />
                    <p className="text-xs text-neutral-500">Current Logo</p>
                    <div className="flex items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-rose-700 hover:text-rose-800 font-bold touch-target-min"
                      >
                        Replace Image
                      </button>
                      <span className="text-neutral-300">•</span>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-xs text-red-600 hover:text-red-700 font-bold touch-target-min"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-3">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="mx-auto mb-2 text-neutral-400"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-xs font-bold text-neutral-700">
                      Click to browse or drag & drop brand logo
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      PNG, JPG, WEBP or SVG (Max 5MB)
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={uploading}
                className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-all active:scale-98 min-h-[44px] flex items-center justify-center gap-2 ${
                  uploading
                    ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                    : "bg-rose-700 hover:bg-rose-800 text-white shadow-rose-700/20"
                }`}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Brand...</span>
                  </>
                ) : editingId ? (
                  "Update Brand"
                ) : (
                  "Add Brand"
                )}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={uploading}
                  className="w-full py-2 px-4 rounded-xl text-xs sm:text-sm font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors min-h-[44px]"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Panel - Brands Table & Filtering */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Brand Directory ({brands.length})
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
            {/* Entries Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600">Show</span>
              <select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs font-medium text-neutral-600">entries</span>
            </div>

            {/* Debounced Search with Clear Button */}
            <div className="relative flex-1 sm:max-w-xs">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search brands..."
                className="w-full pl-8 pr-7 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
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

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24"
                    onClick={() => handleSort("id")}
                  >
                    <div className="flex items-center gap-1">
                      <span>ID</span>
                      <span className="text-neutral-400">{sortColumn === "id" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Brand Name</span>
                      <span className="text-neutral-400">{sortColumn === "name" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
                    </div>
                  </th>
                  <th className="py-3 px-4 w-28 text-center">Logo</th>
                  <th className="py-3 px-4 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loading ? (
                  [1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-12" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-32" /></td>
                      <td className="py-3.5 px-4"><div className="h-10 w-14 bg-neutral-200 rounded mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-4 text-center">
                      <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
                      <button
                        type="button"
                        onClick={fetchBrands}
                        className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-bold"
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : displayedBrands.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No brands found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchTerm ? `No matches for "${searchTerm}"` : "Add your first brand using the form on the left"}
                      </p>
                      {searchTerm && (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="mt-3 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold"
                        >
                          Clear Search
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  displayedBrands.map((brand) => (
                    <tr key={brand._id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">
                        {brand._id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-neutral-900">
                        {brand.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="w-16 h-12 bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden flex items-center justify-center mx-auto p-1">
                          {brand.image ? (
                            <img
                              src={brand.image}
                              alt={brand.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="10"%3ENo Logo%3C/text%3E%3C/svg%3E';
                              }}
                            />
                          ) : (
                            <span className="text-[10px] text-neutral-400 font-medium">No Image</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(brand)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors touch-target-min"
                            title="Edit brand"
                            aria-label={`Edit ${brand.name}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(brand)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors touch-target-min"
                            title="Delete brand"
                            aria-label={`Delete ${brand.name}`}
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
              Showing {brands.length > 0 ? startIndex + 1 : 0} to{" "}
              {Math.min(startIndex + entriesPerPage, sortedBrands.length)} of{" "}
              {sortedBrands.length} entries
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

      {/* 8. Accessible Safe Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteModalTitle"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 id="deleteModalTitle" className="text-base font-bold text-neutral-900">
                Delete Brand?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete <strong className="text-neutral-800">"{deleteTarget.name}"</strong>? This action cannot be undone if no products are associated with it.
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

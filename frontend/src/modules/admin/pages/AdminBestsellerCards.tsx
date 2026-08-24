import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getBestsellerCards,
  createBestsellerCard,
  updateBestsellerCard,
  deleteBestsellerCard,
  reorderBestsellerCards,
  type BestsellerCard,
  type BestsellerCardFormData,
} from "../../../services/api/admin/adminBestsellerCardService";
import { getCategories, type Category } from "../../../services/api/categoryService";
import { useToast } from "../../../context/ToastContext";

const MAX_ACTIVE_CARDS = 6;

export default function AdminBestsellerCards() {
  const { showToast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [order, setOrder] = useState<number | undefined>(undefined);
  const [isActive, setIsActive] = useState(true);

  // Data state
  const [cards, setCards] = useState<BestsellerCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingCards, setLoadingCards] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Deletion Modal state
  const [deleteTarget, setDeleteTarget] = useState<BestsellerCard | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchCards = useCallback(async () => {
    try {
      setLoadingCards(true);
      const params: any = {
        search: debouncedSearch || undefined,
        isActive:
          filterActive === "active"
            ? true
            : filterActive === "inactive"
            ? false
            : undefined,
      };
      const response = await getBestsellerCards(params);
      if (response.success && Array.isArray(response.data)) {
        setCards(response.data);
      } else {
        setCards([]);
      }
    } catch (err: any) {
      console.error("Error fetching bestseller cards:", err);
      showToast(err.response?.data?.message || "Failed to load bestseller cards", "error");
      setCards([]);
    } finally {
      setLoadingCards(false);
    }
  }, [debouncedSearch, filterActive, showToast]);

  const fetchCategories = async () => {
    try {
      const response = await getCategories();
      if (response.success && Array.isArray(response.data)) {
        const rootCategories = response.data.filter((cat) => !cat.parentId);
        setCategories(rootCategories);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const resetForm = () => {
    setName("");
    setSelectedCategory("");
    setOrder(undefined);
    setIsActive(true);
    setEditingId(null);
  };

  const activeCardsCount = cards.filter((c) => c.isActive).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast("Please enter a card name", "error");
      return;
    }
    if (!selectedCategory) {
      showToast("Please select a category", "error");
      return;
    }

    // Check max active cards limit
    if (isActive && !editingId) {
      if (activeCardsCount >= MAX_ACTIVE_CARDS) {
        showToast(
          `Maximum ${MAX_ACTIVE_CARDS} active bestseller cards allowed. Please deactivate an existing card first.`,
          "error"
        );
        return;
      }
    }

    if (isActive && editingId) {
      const existing = cards.find((c) => c._id === editingId);
      if (existing && !existing.isActive && activeCardsCount >= MAX_ACTIVE_CARDS) {
        showToast(
          `Maximum ${MAX_ACTIVE_CARDS} active bestseller cards allowed. Please deactivate an existing card first.`,
          "error"
        );
        return;
      }
    }

    const formData: BestsellerCardFormData = {
      name: name.trim(),
      category: selectedCategory,
      order: order !== undefined ? order : undefined,
      isActive,
    };

    try {
      setLoading(true);

      if (editingId) {
        const response = await updateBestsellerCard(editingId, formData);
        if (response.success) {
          showToast("Bestseller card updated successfully!", "success");
          resetForm();
          fetchCards();
        } else {
          showToast(response.message || "Failed to update card", "error");
        }
      } else {
        const response = await createBestsellerCard(formData);
        if (response.success) {
          showToast("New bestseller card created successfully!", "success");
          resetForm();
          fetchCards();
        } else {
          showToast(response.message || "Failed to create card", "error");
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to save bestseller card", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (card: BestsellerCard) => {
    setName(card.name);
    setSelectedCategory(
      typeof card.category === "string" ? card.category : card.category._id
    );
    setOrder(card.order);
    setIsActive(card.isActive);
    setEditingId(card._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusToggle = async (card: BestsellerCard) => {
    try {
      setTogglingId(card._id);
      const nextActive = !card.isActive;

      if (nextActive && activeCardsCount >= MAX_ACTIVE_CARDS) {
        showToast(
          `Maximum ${MAX_ACTIVE_CARDS} active cards allowed. Deactivate an active card first.`,
          "error"
        );
        return;
      }

      const response = await updateBestsellerCard(card._id, { isActive: nextActive });
      if (response.success) {
        setCards((prev) =>
          prev.map((c) => (c._id === card._id ? { ...c, isActive: nextActive } : c))
        );
        showToast(
          `Card "${card.name}" is now ${nextActive ? "Active" : "Inactive"}`,
          "success"
        );
      } else {
        showToast(response.message || "Failed to update status", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error updating status", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      const response = await deleteBestsellerCard(deleteTarget._id);
      if (response.success) {
        showToast("Bestseller card deleted successfully!", "success");
        setCards((prev) => prev.filter((c) => c._id !== deleteTarget._id));
        if (editingId === deleteTarget._id) resetForm();
        setDeleteTarget(null);
        fetchCards();
      } else {
        showToast(response.message || "Failed to delete card", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error deleting card", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === cards.length - 1)
    ) {
      return;
    }

    const newCards = [...cards];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newCards[index];
    newCards[index] = newCards[targetIndex];
    newCards[targetIndex] = temp;

    setCards(newCards);

    try {
      const orderPayload = newCards.map((c, idx) => ({
        id: c._id,
        order: idx,
      }));
      await reorderBestsellerCards(orderPayload);
      showToast("Card display sequence updated!", "success");
    } catch (err: any) {
      showToast("Failed to save reordered sequence", "error");
      fetchCards();
    }
  };

  const handleExport = () => {
    if (cards.length === 0) {
      showToast("No bestseller cards available to export", "info");
      return;
    }

    const headers = ["ID", "Name", "Category", "Display Order", "Status"];
    const csvContent = [
      headers.join(","),
      ...cards.map((c) => {
        const catName =
          typeof c.category === "string" ? c.category : c.category?.name || "";
        return [
          `"${c._id}"`,
          `"${c.name.replace(/"/g, '""')}"`,
          `"${catName.replace(/"/g, '""')}"`,
          c.order !== undefined ? c.order : "",
          c.isActive ? "Active" : "Inactive",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `hellolocal_bestseller_cards_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Bestseller cards exported successfully", "success");
  };

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedCards = cards.slice(startIndex, startIndex + rowsPerPage);
  const totalPages = Math.ceil(cards.length / rowsPerPage) || 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Bestseller Cards Merchandising
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Configure homepage category showcase cards with dynamic 2x2 product collages
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
          <span className="text-neutral-700 font-medium">Bestseller Cards</span>
        </nav>
      </div>

      {/* Capacity Indicator Banner */}
      <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
          <span className="text-xs font-bold text-rose-950">
            Active Showcase Slots: {activeCardsCount} / {MAX_ACTIVE_CARDS} Cards Active
          </span>
        </div>
        <p className="text-[11px] text-rose-800">
          Maximum {MAX_ACTIVE_CARDS} cards render simultaneously on consumer homepages.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Add / Edit Card */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? "Edit Bestseller Card" : "Add Bestseller Card"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-white/80 hover:text-white underline font-medium"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Card Name */}
            <div>
              <label htmlFor="bestsellerCardName" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Card Display Title <span className="text-red-500">*</span>
              </label>
              <input
                id="bestsellerCardName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fresh Vegetables, Dairy & Breakfast"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Linked Category */}
            <div>
              <label htmlFor="bestsellerCardCategory" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Target Category <span className="text-red-500">*</span>
              </label>
              <select
                id="bestsellerCardCategory"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              >
                <option value="">-- Select Root Category --</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-400 mt-1">
                Top 4 products will automatically populate the 2x2 collage thumbnail.
              </p>
            </div>

            {/* Display Order */}
            <div>
              <label htmlFor="bestsellerCardOrder" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                Sequence Order (Optional)
              </label>
              <input
                id="bestsellerCardOrder"
                type="number"
                min={0}
                value={order !== undefined ? order : ""}
                onChange={(e) => setOrder(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Auto-assigned to end if blank"
                className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
              />
            </div>

            {/* Active Toggle */}
            <div className="pt-1">
              <label htmlFor="bestsellerCardIsActive" className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="bestsellerCardIsActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-700 focus:ring-rose-600 border-neutral-300"
                />
                <span className="text-xs font-bold text-neutral-800">
                  Active (Show on consumer homepage)
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={loading}
                  className="w-1/3 border border-neutral-300 hover:bg-neutral-100 text-neutral-700 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className={`bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm ${
                  editingId ? "w-2/3" : "w-full"
                }`}
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Card...</span>
                  </>
                ) : (
                  <span>{editingId ? "Update Card" : "Save Bestseller Card"}</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: View Cards Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Showcase Cards Directory ({cards.length})
            </h2>
            <button
              type="button"
              onClick={handleExport}
              disabled={cards.length === 0}
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

          {/* Filter Controls */}
          <div className="p-4 border-b border-neutral-200/70 bg-neutral-50/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Status Filter */}
              <div>
                <label htmlFor="bestsellerFilterStatus" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Filter by Status
                </label>
                <select
                  id="bestsellerFilterStatus"
                  value={filterActive}
                  onChange={(e) => {
                    setFilterActive(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="all">All Showcase Cards</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label htmlFor="bestsellerSearchInput" className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Search Showcase Cards
                </label>
                <div className="relative">
                  <input
                    id="bestsellerSearchInput"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, category..."
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
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[550px]">
              <thead>
                <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold uppercase tracking-wider text-neutral-700 select-none">
                  <th className="py-3 px-2 w-16 text-center">Order</th>
                  <th className="py-3 px-4">Card Name</th>
                  <th className="py-3 px-4">Linked Category</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loadingCards ? (
                  [1, 2, 3].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-2"><div className="h-6 bg-neutral-200 rounded w-10 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-36" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded-full w-14 mx-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded-lg w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : paginatedCards.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No bestseller cards found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchQuery
                          ? `No cards match "${searchQuery}"`
                          : "Configure your first category showcase card on the left"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedCards.map((card, index) => {
                    const globalIdx = startIndex + index;
                    const catName =
                      typeof card.category === "string"
                        ? card.category
                        : card.category?.name || "Uncategorized";

                    return (
                      <tr key={card._id} className="hover:bg-neutral-50/80 transition-colors">
                        {/* Move Up/Down Controls */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(globalIdx, "up")}
                              disabled={globalIdx === 0}
                              className="w-6 h-5 rounded hover:bg-neutral-200 disabled:opacity-20 text-neutral-600 inline-flex items-center justify-center"
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <span className="font-mono text-[11px] font-bold text-neutral-500">
                              {card.order !== undefined ? card.order : globalIdx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(globalIdx, "down")}
                              disabled={globalIdx === cards.length - 1}
                              className="w-6 h-5 rounded hover:bg-neutral-200 disabled:opacity-20 text-neutral-600 inline-flex items-center justify-center"
                              title="Move Down"
                            >
                              ▼
                            </button>
                          </div>
                        </td>

                        {/* Name */}
                        <td className="py-3 px-4 font-bold text-neutral-900">{card.name}</td>

                        {/* Category */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded-md">
                            📁 {catName}
                          </span>
                        </td>

                        {/* Status Toggle */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(card)}
                            disabled={togglingId === card._id}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                              card.isActive
                                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                : "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200"
                            }`}
                            title="Click to toggle active visibility"
                          >
                            {togglingId === card._id ? (
                              <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                            ) : null}
                            {card.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEdit(card)}
                              className="w-8 h-8 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-700 text-neutral-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Edit Card"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(card)}
                              className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center transition-colors min-w-[36px] min-h-[36px]"
                              title="Delete Card"
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
                Showing {cards.length > 0 ? startIndex + 1 : 0} to{" "}
                {Math.min(startIndex + rowsPerPage, cards.length)} of {cards.length} cards
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loadingCards}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === 1 || loadingCards
                      ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                      : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
                  }`}
                >
                  ‹ Prev
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
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
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0 || loadingCards}
                  className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                    currentPage === totalPages || totalPages === 0 || loadingCards
                      ? "border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed"
                      : "border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100"
                  }`}
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
                  Delete Bestseller Card
                </h3>
                <p className="text-xs text-neutral-500">
                  This showcase card will be removed from the consumer homepage.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Card Title:</span> {deleteTarget.name}
              </p>
              <p className="text-neutral-500">
                <span className="font-bold text-neutral-700">Category:</span>{" "}
                {typeof deleteTarget.category === "string"
                  ? deleteTarget.category
                  : deleteTarget.category?.name || ""}
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
                onClick={confirmDelete}
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
        HelloLocal Admin Panel • Bestseller Showcase Rails
      </footer>
    </div>
  );
}

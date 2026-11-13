import React, { useState, useEffect, useMemo } from "react";
import {
  getMasterCatalogue,
  exportMasterCatalogueCsv,
  quickAddMasterProductToStore,
  MasterCatalogItem,
} from "../../../services/api/productService";
import { useToast } from "../../../context/ToastContext";

interface MasterCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_TABS = [
  { id: "All", label: "All Categories", icon: "🌐" },
  { id: "Grocery", label: "Grocery & Essentials", icon: "🛒" },
  { id: "Electronics", label: "Electronics & Mobile", icon: "⚡" },
  { id: "Medical", label: "Medical & Pharmacy", icon: "💊" },
  { id: "Fashion", label: "Fashion & Apparel", icon: "👕" },
  { id: "Hardware", label: "Hardware & Electricals", icon: "🔧" },
  { id: "Stationery", label: "Stationery & Books", icon: "📚" },
];

export default function MasterCatalogueModal({
  isOpen,
  onClose,
  onSuccess,
}: MasterCatalogueModalProps) {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [products, setProducts] = useState<MasterCatalogItem[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Local price & stock modifications per item
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [customStocks, setCustomStocks] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;

    const fetchCatalogue = async () => {
      try {
        setLoading(true);
        const res = await getMasterCatalogue({
          category: activeTab,
          search: searchQuery,
          limit: 100,
        });
        if (res.success && res.data) {
          setProducts(res.data.products);
          // Seed custom prices & stocks with defaults
          const initPrices: Record<string, number> = {};
          const initStocks: Record<string, number> = {};
          res.data.products.forEach((p) => {
            initPrices[p.id] = p.suggestedPrice;
            initStocks[p.id] = p.defaultStock;
          });
          setCustomPrices(initPrices);
          setCustomStocks(initStocks);
        }
      } catch (err: any) {
        showToast(err.response?.data?.message || "Failed to load master catalogue", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchCatalogue();
  }, [isOpen, activeTab, searchQuery]);

  if (!isOpen) return null;

  // Handle Export Master CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const blob = await exportMasterCatalogueCsv(activeTab);
      const url = window.URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      const safeSuffix = activeTab && activeTab !== "All"
        ? `_${activeTab.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
        : "_all_categories";
      link.setAttribute("download", `hello_local_master_catalogue${safeSuffix}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast(`Master catalogue CSV for ${activeTab} downloaded!`, "success");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to export CSV", "error");
    } finally {
      setExporting(false);
    }
  };

  // Quick Add Item
  const handleQuickAdd = async (product: MasterCatalogItem) => {
    const finalPrice = customPrices[product.id] ?? product.suggestedPrice;
    const finalStock = customStocks[product.id] ?? product.defaultStock;

    if (finalPrice > product.mrp) {
      showToast(`Selling price cannot exceed MRP (₹${product.mrp})`, "error");
      return;
    }

    try {
      setAddingId(product.id);
      const res = await quickAddMasterProductToStore({
        masterProductId: product.id,
        customPrice: finalPrice,
        customStock: finalStock,
        customMrp: product.mrp,
      });

      if (res.success) {
        setAddedIds((prev) => new Set(prev).add(product.id));
        showToast(`✓ "${product.name}" added to your store!`, "success");
        onSuccess();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to add product to store", "error");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col h-[92vh] max-h-[850px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-purple-50/80 via-white to-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-bold shadow-2xs">
              📚
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Master Products Catalogue
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Ready Inventory
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Browse pre-catalogued products across all shop categories and add to your store in 1 click
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleExportCsv}
              disabled={exporting}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer min-h-[38px]"
              title="Download full master catalogue spreadsheet to edit in Excel"
            >
              <span>{exporting ? "⏳" : "📥"}</span>
              <span>{exporting ? "Exporting..." : "Download Master CSV"}</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 seller-scrollbar text-xs">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-purple-300 hover:text-purple-700"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by product name, brand, barcode (e.g. Atta, boAt, Dettol, Philips)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 pl-9 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[40px] shadow-2xs"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Catalogue Grid Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
              <span className="text-2xl animate-spin">⏳</span>
              <p className="text-xs font-bold">Loading master catalogue products...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400 text-center p-4">
              <span className="text-3xl">🔍</span>
              <p className="text-sm font-bold text-slate-700">No products matched your search</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Try switching the category tab or searching with a different brand or item name.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {products.map((item) => {
                const isAdded = addedIds.has(item.id);
                const isAdding = addingId === item.id;
                const price = customPrices[item.id] ?? item.suggestedPrice;
                const stock = customStocks[item.id] ?? item.defaultStock;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden bg-white shadow-2xs ${
                      isAdded
                        ? "border-emerald-300 bg-emerald-50/10"
                        : "border-slate-200/90 hover:border-purple-300 hover:shadow-xs"
                    }`}
                  >
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-cover bg-slate-100 border border-slate-200/80 flex-shrink-0"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                              {item.category}
                            </span>
                            {item.brand && (
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {item.brand}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-black text-slate-900 mt-1 line-clamp-2 leading-tight" title={item.name}>
                            {item.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                            Unit: {item.unit} • GST: {item.taxPercent}%
                          </p>
                        </div>
                      </div>

                      {/* Pricing & Stock inputs */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                            Selling Price (MRP ₹{item.mrp})
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">₹</span>
                            <input
                              type="number"
                              value={price}
                              onChange={(e) =>
                                setCustomPrices((prev) => ({
                                  ...prev,
                                  [item.id]: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="w-full text-xs font-black rounded-lg border border-slate-300 bg-white py-1.5 pl-6 pr-2 text-slate-900 outline-none focus:border-purple-600"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                            Initial Stock Units
                          </label>
                          <input
                            type="number"
                            value={stock}
                            onChange={(e) =>
                              setCustomStocks((prev) => ({
                                ...prev,
                                [item.id]: parseInt(e.target.value, 10) || 0,
                              }))
                            }
                            className="w-full text-xs font-bold rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-slate-900 outline-none focus:border-purple-600"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="p-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]" title={item.barcode}>
                        {item.barcode}
                      </span>

                      {isAdded ? (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-2xs">
                          <span>✓</span>
                          <span>In Store</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleQuickAdd(item)}
                          disabled={isAdding}
                          className="bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-2xs flex items-center gap-1 transition-all cursor-pointer min-h-[32px]"
                        >
                          <span>{isAdding ? "⏳" : "+"}</span>
                          <span>{isAdding ? "Adding..." : "Add to Store"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs text-slate-500 font-medium">
            Showing {products.length} products in {activeTab}. Add products directly or export CSV to edit in bulk.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

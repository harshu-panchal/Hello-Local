import React, { useState, useEffect, useCallback } from 'react';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  SupplierItem,
} from '../../../services/api/supplierService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerStatCard } from '../components/common/SellerStatCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerModal } from '../components/common/SellerModal';
import { useToast } from '../../../context/ToastContext';

export default function SellerSuppliers() {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    category: 'General Grocery',
    address: '',
    notes: '',
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSuppliers({
        search: search.trim() || undefined,
        category: selectedCategory !== 'All Categories' ? selectedCategory : undefined,
      });

      if (res.success) {
        setSuppliers(res.data || []);
        if (res.categories) setCategories(res.categories);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load suppliers', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, showToast]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchSuppliers();
    }, 300);
    return () => clearTimeout(handler);
  }, [fetchSuppliers]);

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      companyName: '',
      phone: '',
      email: '',
      category: 'General Grocery',
      address: '',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sup: SupplierItem) => {
    setEditingSupplier(sup);
    setFormData({
      name: sup.name,
      companyName: sup.companyName || '',
      phone: sup.phone,
      email: sup.email || '',
      category: sup.category || 'General Grocery',
      address: sup.address || '',
      notes: sup.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Supplier name is required', 'error');
      return;
    }
    if (!formData.phone.trim()) {
      showToast('Phone number is required', 'error');
      return;
    }

    try {
      setSaving(true);
      if (editingSupplier) {
        const res = await updateSupplier(editingSupplier._id, formData);
        if (res.success) {
          showToast('Supplier updated successfully', 'success');
          setIsModalOpen(false);
          fetchSuppliers();
        }
      } else {
        const res = await createSupplier(formData);
        if (res.success) {
          showToast('Supplier added successfully', 'success');
          setIsModalOpen(false);
          fetchSuppliers();
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to save supplier', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove supplier "${name}"?`)) return;
    try {
      const res = await deleteSupplier(id);
      if (res.success) {
        showToast('Supplier removed successfully', 'success');
        fetchSuppliers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete supplier', 'error');
    }
  };

  const handleWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(`Hello ${name}, please share today's wholesale rate card and availability for restocking.`);
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, '_blank');
  };

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, '_self');
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6 pb-16">
      {/* Header with Add Action */}
      <SellerPageHeader
        title="Suppliers & Distributors"
        subtitle="Manage wholesale vendors, purchase contacts, and quick restock orders."
        action={
          <SellerButton
            variant="primary"
            size="md"
            onClick={handleOpenAddModal}
            icon={<span>➕</span>}
            className="min-h-[44px]"
          >
            Add Supplier
          </SellerButton>
        }
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <SellerStatCard
          label="TOTAL SUPPLIERS"
          value={suppliers.length}
          variant="purple"
          icon={<span className="text-xl">🤝</span>}
        />
        <SellerStatCard
          label="ACTIVE VENDORS"
          value={suppliers.filter((s) => s.status === 'ACTIVE').length}
          variant="emerald"
          icon={<span className="text-xl">✅</span>}
        />
        <SellerStatCard
          label="CATEGORIES"
          value={categories.length || 1}
          variant="amber"
          icon={<span className="text-xl">📦</span>}
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search suppliers by name, agency, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
          />
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['All Categories', ...categories].slice(0, 4).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Suppliers Grid / Empty State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-200/80 text-center space-y-3 shadow-2xs">
          <span className="text-4xl">🤝</span>
          <h4 className="text-base font-bold text-slate-800">No suppliers listed yet</h4>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Keep track of your local distributors, mandis, and wholesale agencies for quick restocking and ordering.
          </p>
          <div className="pt-2">
            <SellerButton variant="primary" size="md" onClick={handleOpenAddModal}>
              ➕ Add Your First Supplier
            </SellerButton>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map((sup) => (
            <div
              key={sup._id}
              className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs hover:shadow-xs hover:border-purple-200 transition-all flex flex-col justify-between space-y-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm flex-shrink-0">
                    {sup.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-900 truncate">
                      {sup.name}
                    </h4>
                    {sup.companyName && (
                      <p className="text-xs text-slate-500 font-medium truncate">
                        🏢 {sup.companyName}
                      </p>
                    )}
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex-shrink-0">
                  {sup.category || 'General'}
                </span>
              </div>

              {/* Details */}
              <div className="text-xs text-slate-600 space-y-1">
                <p className="flex items-center gap-1.5 font-medium">
                  <span>📞</span>
                  <span>{sup.phone}</span>
                </p>
                {sup.address && (
                  <p className="flex items-center gap-1.5 font-medium text-slate-500 truncate">
                    <span>📍</span>
                    <span className="truncate">{sup.address}</span>
                  </p>
                )}
                {sup.notes && (
                  <p className="text-[11px] text-slate-400 italic line-clamp-1">
                    "{sup.notes}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCall(sup.phone)}
                    className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center gap-1.5 border border-purple-200 transition-all active:scale-95"
                    title="Call Supplier"
                  >
                    <span>📞</span>
                    <span>Call</span>
                  </button>
                  <button
                    onClick={() => handleWhatsApp(sup.phone, sup.name)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1.5 border border-emerald-200 transition-all active:scale-95"
                    title="WhatsApp Restock Order"
                  >
                    <span>💬</span>
                    <span>WhatsApp</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditModal(sup)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Edit Supplier"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(sup._id, sup.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete Supplier"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      <SellerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
        size="md"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Contact / Supplier Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Ramesh Patel"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Company / Agency / Mandi Name
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              placeholder="e.g. Amul Dairy Agency / Indore Mandi"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="e.g. 9876543210"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g. Dairy, FMCG, Beverage"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Address / Location
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g. Shop 12, Wholesale Market, Indore"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Notes / Delivery Days
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Delivers every Monday and Thursday morning"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <SellerButton
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </SellerButton>
            <SellerButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={saving}
            >
              {editingSupplier ? 'Save Changes' : 'Add Supplier'}
            </SellerButton>
          </div>
        </form>
      </SellerModal>
    </div>
  );
}

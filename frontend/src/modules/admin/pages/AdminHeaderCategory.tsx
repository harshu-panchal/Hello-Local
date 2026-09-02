import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getHeaderCategoriesAdmin,
  createHeaderCategory,
  updateHeaderCategory,
  deleteHeaderCategory,
  HeaderCategory,
} from '../../../services/api/headerCategoryService';
import { themes } from '../../../utils/themes';
import { ICON_LIBRARY, getIconByName, IconDef } from '../../../utils/iconLibrary';
import { uploadImage } from '../../../services/api/uploadService';
import { useToast } from '../../../context/ToastContext';

export default function AdminHeaderCategory() {
  const { showToast } = useToast();

  // Data states
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [headerCategoryName, setHeaderCategoryName] = useState('');
  const [selectedIconLibrary, setSelectedIconLibrary] = useState('Custom');
  const [headerCategoryIcon, setHeaderCategoryIcon] = useState('grid');
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'Published' | 'Unpublished'>('Published');
  const [orderIndex, setOrderIndex] = useState<number>(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Icon search state
  const [iconSearchTerm, setIconSearchTerm] = useState('');

  // Table & Filter states
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'name' | 'iconName' | 'theme' | 'status' | 'order'>('order');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [deleteTarget, setDeleteTarget] = useState<HeaderCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const themeOptions = Object.keys(themes);

  // 1. Debounce Search Input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // 2. Fetch Data
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getHeaderCategoriesAdmin();
      setHeaderCategories(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to fetch header categories', error);
      showToast('Failed to fetch categories. Please refresh.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 3. Smart Icon Search & Filter
  const filteredIcons = useMemo(() => {
    const term = iconSearchTerm || (!editingId ? headerCategoryName : '') || '';
    if (!term.trim()) return ICON_LIBRARY;

    const lowerTerm = term.toLowerCase();

    return [...ICON_LIBRARY].sort((a, b) => {
      const aScore = getMatchScore(a, lowerTerm);
      const bScore = getMatchScore(b, lowerTerm);
      return bScore - aScore;
    });
  }, [iconSearchTerm, headerCategoryName, editingId]);

  function getMatchScore(icon: IconDef, term: string) {
    let score = 0;
    if (icon.name.includes(term)) score += 10;
    if (icon.label.toLowerCase().includes(term)) score += 10;
    if (icon.tags.some((t) => t.includes(term))) score += 5;
    if (icon.tags.some((t) => term.includes(t))) score += 5;
    return score;
  }

  // 4. Filtering & In-Memory Multi-Column Sorting
  const filteredCategories = useMemo(() => {
    if (!debouncedSearch.trim()) return headerCategories;
    const lower = debouncedSearch.toLowerCase();
    return headerCategories.filter(
      (category) =>
        (category.name || '').toLowerCase().includes(lower) ||
        (category.slug || '').toLowerCase().includes(lower) ||
        (category.theme || '').toLowerCase().includes(lower)
    );
  }, [headerCategories, debouncedSearch]);

  const sortedCategories = useMemo(() => {
    return [...filteredCategories].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortColumn === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortColumn === 'iconName') {
        valA = (a.iconName || '').toLowerCase();
        valB = (b.iconName || '').toLowerCase();
      } else if (sortColumn === 'theme') {
        valA = (a.theme || a.slug || '').toLowerCase();
        valB = (b.theme || b.slug || '').toLowerCase();
      } else if (sortColumn === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      } else if (sortColumn === 'order') {
        valA = a.order ?? 0;
        valB = b.order ?? 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredCategories, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedCategories.length / entriesPerPage));
  const startIndex = (currentPage - 1) * entriesPerPage;
  const displayedCategories = sortedCategories.slice(startIndex, startIndex + entriesPerPage);

  const handleSort = (column: 'name' | 'iconName' | 'theme' | 'status' | 'order') => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Next available order calculation
  const nextAvailableOrder = useMemo(() => {
    if (!headerCategories || headerCategories.length === 0) return 0;
    const max = Math.max(...headerCategories.map((c) => c.order ?? 0));
    return max + 1;
  }, [headerCategories]);

  // Set default orderIndex when categories first load if not editing
  useEffect(() => {
    if (!editingId && headerCategories.length > 0) {
      setOrderIndex((prev) => (prev === 0 ? nextAvailableOrder : prev));
    }
  }, [headerCategories, nextAvailableOrder, editingId]);

  // 5. Form Actions
  const resetForm = () => {
    setHeaderCategoryName('');
    setSelectedIconLibrary('Custom');
    setHeaderCategoryIcon('grid');
    setSelectedTheme('all');
    setSelectedStatus('Published');
    setOrderIndex(nextAvailableOrder);
    setImageFile(null);
    setImagePreview('');
    setEditingId(null);
    setIconSearchTerm('');
    setFormError('');
  };

  const handleAddOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = headerCategoryName.trim();
    if (!trimmedName) {
      setFormError('Please enter a header category name');
      return;
    }
    if (trimmedName.length < 2) {
      setFormError('Category name must be at least 2 characters');
      return;
    }
    if (trimmedName.length > 60) {
      setFormError('Category name must be under 60 characters');
      return;
    }
    if (!headerCategoryIcon.trim()) {
      setFormError('Please select an icon for this category');
      return;
    }
    if (!selectedTheme) {
      setFormError('Please select a theme color');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImageUrl = imagePreview;

      if (imageFile) {
        setIsUploadingImage(true);
        try {
          const uploadRes = await uploadImage(imageFile, 'hellolocal/header-categories');
          finalImageUrl = uploadRes.secureUrl;
        } catch (err: any) {
          console.error('Image upload failed', err);
          showToast(err.message || 'Failed to upload custom image', 'error');
          setIsSubmitting(false);
          setIsUploadingImage(false);
          return;
        } finally {
          setIsUploadingImage(false);
        }
      }

      const payload = {
        name: trimmedName,
        iconLibrary: selectedIconLibrary,
        iconName: headerCategoryIcon,
        theme: selectedTheme,
        image: finalImageUrl || undefined,
        status: selectedStatus,
        order: orderIndex !== undefined && !isNaN(Number(orderIndex)) ? Number(orderIndex) : nextAvailableOrder,
      };

      if (editingId) {
        await updateHeaderCategory(editingId, payload);
        showToast('Header category updated successfully!', 'success');
      } else {
        await createHeaderCategory(payload);
        showToast('Header category created successfully!', 'success');
      }

      fetchCategories();
      resetForm();
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.message || 'Operation failed. Please try again.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (category: HeaderCategory) => {
    setEditingId(category._id);
    setHeaderCategoryName(category.name);
    setSelectedIconLibrary(category.iconLibrary || 'Custom');
    setHeaderCategoryIcon(category.iconName || 'grid');
    setSelectedTheme(category.theme || category.slug || 'all');
    setSelectedStatus(category.status);
    setOrderIndex(category.order ?? 0);
    setImagePreview(category.image || '');
    setImageFile(null);
    setIconSearchTerm('');
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 6. Delete with Modal
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await deleteHeaderCategory(deleteTarget._id);
      showToast('Header category deleted successfully!', 'success');
      setDeleteTarget(null);
      fetchCategories();
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.message || 'Failed to delete category';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Header Categories
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Configure primary top discovery tabs, SVG icons, color gradients, and display sequencing
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
          <span className="text-neutral-700 font-medium">Header Categories</span>
        </nav>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Left Panel - Add / Edit Form */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {editingId ? 'Edit Header Category' : 'Add Header Category'}
            </h2>
            {editingId && (
              <span className="text-[10px] bg-rose-800/80 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                Editing
              </span>
            )}
          </div>

          <form onSubmit={handleAddOrUpdate} className="p-5 space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-start justify-between gap-2">
                <span>{formError}</span>
                <button
                  type="button"
                  onClick={() => setFormError('')}
                  className="text-red-500 hover:text-red-700 font-bold ml-1"
                >
                  ×
                </button>
              </div>
            )}

            {/* Category Name */}
            <div>
              <label htmlFor="headerCategoryNameInput" className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Category Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="headerCategoryNameInput"
                type="text"
                value={headerCategoryName}
                onChange={(e) => {
                  setHeaderCategoryName(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="e.g. Grocery, Dairy, Bakery"
                maxLength={60}
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors"
                disabled={isSubmitting}
                required
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-[11px] text-neutral-400">Unique display name on customer home rail</span>
                <span className="text-[11px] text-neutral-400 font-mono">{headerCategoryName.length}/60</span>
              </div>
            </div>

            {/* Custom Category Image (Optional) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Custom Image <span className="text-neutral-400 font-normal">(Optional)</span>
                </label>
                {imagePreview && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Custom Photo Active
                  </span>
                )}
              </div>

              {imagePreview ? (
                <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="w-13 h-13 rounded-full border-2 border-rose-500/30 overflow-hidden bg-white shrink-0 p-1 flex items-center justify-center">
                    <img
                      src={imagePreview}
                      alt="Category preview"
                      className="w-full h-full object-contain rounded-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-neutral-800 truncate">
                      {imageFile ? imageFile.name : 'Uploaded Photo'}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Renders in top customer quick-strip. SVG icon acts as fallback.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview('');
                    }}
                    className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 hover:border-rose-600/60 rounded-xl p-3 bg-neutral-50/50 hover:bg-rose-50/20 transition-all cursor-pointer group text-center">
                  <div className="w-8 h-8 rounded-full bg-white shadow-xs border border-neutral-200 flex items-center justify-center text-neutral-500 group-hover:text-rose-600 mb-1 transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-neutral-700 group-hover:text-rose-700 transition-colors">
                    Click to upload custom photo
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-0.5">PNG, JPG, or WebP (SVG icon will be backup)</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          showToast('Image must be under 5MB', 'error');
                          return;
                        }
                        setImageFile(file);
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                    className="hidden"
                    disabled={isSubmitting}
                  />
                </label>
              )}
            </div>

            {/* Select Icon Visual Grid */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Select SVG Icon <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Filter icons..."
                  value={iconSearchTerm}
                  onChange={(e) => setIconSearchTerm(e.target.value)}
                  className="px-2 py-1 text-xs border rounded-lg border-neutral-300 w-32 focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200 h-52 overflow-y-auto custom-scrollbar">
                {filteredIcons.length > 0 ? (
                  filteredIcons.map((option) => {
                    const isSelected = headerCategoryIcon === option.name;
                    return (
                      <div
                        key={option.name}
                        onClick={() => {
                          setHeaderCategoryIcon(option.name);
                          setSelectedIconLibrary('Custom');
                        }}
                        className={`
                          cursor-pointer flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border transition-all
                          ${
                            isSelected
                              ? 'bg-rose-50 border-rose-600 ring-2 ring-rose-600/30 text-rose-800 shadow-xs'
                              : 'bg-white border-neutral-200 hover:border-rose-300 hover:shadow-xs text-neutral-600'
                          }
                        `}
                      >
                        <div className={`w-5 h-5 flex items-center justify-center ${isSelected ? 'text-rose-700' : 'text-neutral-500'}`}>
                          {option.svg}
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight truncate w-full">
                          {option.label}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-6 text-center text-neutral-400 text-xs">
                    No icons match "{iconSearchTerm || headerCategoryName}"
                  </div>
                )}
              </div>
            </div>

            {/* Theme / Color Selection */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Theme Accent Color <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200">
                {themeOptions.map((themeKey) => {
                  const themeObj = themes[themeKey];
                  const color = themeObj.primary[0];
                  const isSelected = selectedTheme === themeKey;

                  const colorNames: Record<string, string> = {
                    all: 'Green',
                    wedding: 'Red',
                    winter: 'Sky Blue',
                    electronics: 'Yellow',
                    beauty: 'Pink',
                    grocery: 'Light Green',
                    fashion: 'Purple',
                    sports: 'Blue',
                    orange: 'Orange',
                    violet: 'Violet',
                    teal: 'Teal',
                    dark: 'Dark',
                    hotpink: 'Hot Pink',
                    gold: 'Gold',
                  };

                  const displayColor = colorNames[themeKey] || themeKey;

                  return (
                    <div
                      key={themeKey}
                      onClick={() => setSelectedTheme(themeKey)}
                      title={displayColor}
                      className={`
                        cursor-pointer flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all
                        ${isSelected ? 'ring-2 ring-rose-600 bg-white shadow-xs' : 'hover:bg-neutral-200/60'}
                      `}
                    >
                      <div
                        className="w-6 h-6 rounded-full shadow-2xs border border-black/10"
                        style={{ background: color }}
                      />
                      <span className="text-[10px] text-neutral-600 font-medium capitalize text-center leading-tight truncate w-full">
                        {displayColor}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2-Column: Display Order & Status */}
            <div className="grid grid-cols-2 gap-3">
              {/* Display Order Sequence */}
              <div>
                <label htmlFor="orderIndexInput" className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Display Order
                </label>
                <input
                  id="orderIndexInput"
                  type="number"
                  min="0"
                  value={orderIndex}
                  onChange={(e) => setOrderIndex(Number(e.target.value))}
                  placeholder="0, 1, 2..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
                />
                <span className="text-[10px] text-neutral-400 mt-0.5 block">Lower numbers appear first</span>
              </div>

              {/* Status */}
              <div>
                <label htmlFor="statusSelect" className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Status
                </label>
                <select
                  id="statusSelect"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none"
                >
                  <option value="Published">Published</option>
                  <option value="Unpublished">Unpublished</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-all active:scale-98 min-h-[44px] flex items-center justify-center gap-2 ${
                  isSubmitting
                    ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                    : 'bg-rose-700 hover:bg-rose-800 text-white shadow-rose-700/20'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Category...</span>
                  </>
                ) : editingId ? (
                  'Update Category'
                ) : (
                  'Add Header Category'
                )}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="w-full py-2 px-4 rounded-xl text-xs sm:text-sm font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors min-h-[44px]"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Panel - Category Directory Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Header Category Directory ({headerCategories.length})
            </h2>
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

            {/* Debounced Search */}
            <div className="relative flex-1 sm:max-w-xs">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search header categories..."
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
                  onClick={() => setSearchTerm('')}
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
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors w-16"
                    onClick={() => handleSort('order')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Order</span>
                      <span className="text-neutral-400">{sortColumn === 'order' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Name</span>
                      <span className="text-neutral-400">{sortColumn === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="py-3 px-3 w-16 text-center">Icon</th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-28"
                    onClick={() => handleSort('theme')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Theme</span>
                      <span className="text-neutral-400">{sortColumn === 'theme' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:bg-neutral-200/60 transition-colors w-24"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      <span className="text-neutral-400">{sortColumn === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {loading ? (
                  [1, 2, 3, 4].map((idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-8" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-neutral-200 rounded w-28" /></td>
                      <td className="py-3.5 px-3"><div className="h-6 w-6 bg-neutral-200 rounded mx-auto" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded w-16" /></td>
                      <td className="py-3.5 px-3"><div className="h-5 bg-neutral-200 rounded w-14" /></td>
                      <td className="py-3.5 px-4"><div className="h-8 bg-neutral-200 rounded w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : displayedCategories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 text-neutral-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">No header categories found</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {searchTerm ? `No matches for "${searchTerm}"` : 'Add your first header category using the form on the left'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedCategories.map((category) => (
                    <tr key={category._id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-neutral-600">
                        {category.order ?? 0}
                      </td>
                      <td className="py-3 px-4 font-semibold text-neutral-900">
                        <div>{category.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">slug: {category.slug}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {category.image ? (
                          <div className="relative w-7 h-7 mx-auto">
                            <img
                              src={category.image}
                              alt={category.name}
                              className="w-7 h-7 rounded-full object-contain border border-neutral-200 bg-white p-0.5"
                            />
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[7px]" title="Custom Image Active">
                              ✓
                            </div>
                          </div>
                        ) : (
                          <div className="text-rose-700 w-6 h-6 flex items-center justify-center mx-auto bg-rose-50 rounded-lg p-1">
                            {getIconByName(category.iconName)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-neutral-600">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-800 capitalize border border-neutral-200">
                          <span
                            className="w-2 h-2 rounded-full mr-1.5 shadow-2xs"
                            style={{ background: themes[category.theme || category.slug]?.primary[0] || '#ccc' }}
                          />
                          {category.theme || category.slug}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-full ${
                            category.status === 'Published'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                          }`}
                        >
                          {category.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(category)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors touch-target-min"
                            title="Edit category"
                            aria-label={`Edit ${category.name}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(category)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors touch-target-min"
                            title="Delete category"
                            aria-label={`Delete ${category.name}`}
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
              Showing {sortedCategories.length > 0 ? startIndex + 1 : 0} to{' '}
              {Math.min(startIndex + entriesPerPage, sortedCategories.length)} of{' '}
              {sortedCategories.length} entries
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`px-2.5 py-1.5 border rounded-lg font-bold min-h-[36px] transition-colors ${
                  currentPage === 1
                    ? 'border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed'
                    : 'border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100'
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
                              ? 'bg-rose-700 text-white'
                              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
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
                    ? 'border-neutral-200 text-neutral-300 bg-neutral-50 cursor-not-allowed'
                    : 'border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-100'
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
            aria-labelledby="deleteHeaderCategoryTitle"
            className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div className="text-center">
              <h3 id="deleteHeaderCategoryTitle" className="text-base font-bold text-neutral-900">
                Delete Header Category?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete <strong className="text-neutral-800">"{deleteTarget.name}"</strong>? This will remove the top discovery tab from the consumer feed if no product categories are linked to it.
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
                  'Yes, Delete'
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

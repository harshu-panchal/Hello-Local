import { useMemo } from "react";
import { Category } from "../../../services/api/admin/adminProductService";

interface CategoryListViewProps {
  categories: Category[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export default function CategoryListView({
  categories,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  onDelete,
  currentPage,
  itemsPerPage,
  onPageChange,
}: CategoryListViewProps) {
  // Map of category ID to category name for instant parent lookup
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => {
      map.set(c._id, c.name);
    });
    return map;
  }, [categories]);

  const getParentName = (cat: Category) => {
    if (cat.parent) {
      if (typeof cat.parent === "string") return cat.parent;
      if (cat.parent.name) return cat.parent.name;
    }
    if (typeof cat.parentId === "object" && cat.parentId !== null) {
      const p = cat.parentId as { _id?: string; name?: string };
      if (p.name) return p.name;
      if (p._id && categoryMap.has(p._id)) return categoryMap.get(p._id)!;
    }
    if (cat.parentId) {
      const pIdStr = String(cat.parentId);
      if (categoryMap.has(pIdStr)) {
        return categoryMap.get(pIdStr)!;
      }
      return "Unknown";
    }
    return "Root";
  };

  const totalPages = Math.ceil(categories.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCategories = categories.slice(startIndex, endIndex);
  const allSelected =
    paginatedCategories.length > 0 &&
    paginatedCategories.every((cat) => selectedIds.has(cat._id));
  const someSelected =
    paginatedCategories.some((cat) => selectedIds.has(cat._id)) && !allSelected;

  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">
        No categories found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  className="rounded border-neutral-300 text-rose-700 focus:ring-rose-600"
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = someSelected;
                    }
                  }}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Image
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Parent
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Header Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Commission
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Order
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {paginatedCategories.map((category) => (
              <tr
                key={category._id}
                className={`hover:bg-neutral-50 ${
                  selectedIds.has(category._id) ? "bg-blue-50" : ""
                }`}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(category._id)}
                    onChange={() => onSelect(category._id)}
                    className="rounded border-neutral-300 text-rose-700 focus:ring-rose-600"
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {category.image ? (
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-12 h-12 rounded-lg object-cover"
                      onError={(e) => {
                        // Hide broken image and show fallback
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `<div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center"><span class="text-lg font-semibold text-neutral-400">${category.name.charAt(0).toUpperCase()}</span></div>`;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center">
                      <span className="text-lg font-semibold text-neutral-400">
                        {category.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">
                      {category.name}
                    </span>
                    {category.isBestseller && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        ⭐ Bestseller
                      </span>
                    )}
                    {category.hasWarning && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                        ⚠️ Warning
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm">
                    {(() => {
                      const parentName = getParentName(category);
                      if (parentName === "Root") {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">
                            Root
                          </span>
                        );
                      }
                      if (parentName === "Unknown") {
                        return (
                          <span className="text-xs text-neutral-400">
                            Unknown
                          </span>
                        );
                      }
                      return (
                        <span className="font-medium text-neutral-800">
                          {parentName}
                        </span>
                      );
                    })()}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm text-neutral-600">
                    {category.headerCategory ? (
                      typeof category.headerCategory === "string" ? (
                        category.headerCategory
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          {category.headerCategory.name}
                        </span>
                      )
                    ) : category.headerCategoryId ? (
                      typeof category.headerCategoryId === "object" && category.headerCategoryId !== null ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          {(category.headerCategoryId as any).name || "Assigned"}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          {String(category.headerCategoryId).slice(-6)}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-yellow-600">
                        Not Assigned
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      category.status === "Active"
                        ? "bg-rose-100 text-rose-900"
                        : "bg-red-100 text-red-800"
                    }`}>
                    {category.status}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs">
                  {category.commissionRate && category.commissionRate > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      {category.commissionRate}%
                    </span>
                  ) : (
                    <span className="text-neutral-400 font-medium">Default</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-600">
                  {category.order || 0}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onEdit(category)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(category)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-t border-neutral-200">
          <div className="text-sm text-neutral-700">
            Showing {startIndex + 1} to {Math.min(endIndex, categories.length)}{" "}
            of {categories.length} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                )
                .map((page, index, array) => (
                  <div key={page} className="flex items-center gap-1">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-neutral-500">...</span>
                    )}
                    <button
                      onClick={() => onPageChange(page)}
                      className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                        currentPage === page
                          ? "bg-rose-700 text-white"
                          : "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50"
                      }`}>
                      {page}
                    </button>
                  </div>
                ))}
            </div>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


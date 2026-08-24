import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import {
  getAllSystemUsers,
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
  type SystemUser as SystemUserType,
  type CreateSystemUserData,
  type UpdateSystemUserData,
} from "../../../services/api/admin/adminSystemUserService";

export default function AdminSystemUser() {
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    role: "" as "" | "Admin" | "Super Admin",
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    password: "",
    confirmPassword: "",
    status: "Active" as "Active" | "Inactive",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [roleFilter, setRoleFilter] = useState<"" | "Admin" | "Super Admin">("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<SystemUserType[]>([]);
  const [loading, setLoading] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Safe Delete Modal State
  const [userToDelete, setUserToDelete] = useState<SystemUserType | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const roles: ("Admin" | "Super Admin")[] = ["Admin", "Super Admin"];

  // Debounce search term by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchSystemUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAllSystemUsers({
        page: currentPage,
        limit: entriesPerPage,
        search: searchTerm || undefined,
        role: roleFilter || undefined,
        sortBy: sortColumn || "createdAt",
        sortOrder: sortDirection,
      });

      if (response.success && response.data) {
        setSystemUsers(response.data);
        if (response.pagination) {
          setTotalPages(response.pagination.pages);
          setTotalUsers(response.pagination.total);
        }
      } else {
        showToast(response.message || "Failed to fetch system users", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Error fetching system users", "error");
    } finally {
      setLoading(false);
    }
  }, [currentPage, entriesPerPage, searchTerm, roleFilter, sortColumn, sortDirection, showToast]);

  useEffect(() => {
    fetchSystemUsers();
  }, [fetchSystemUsers]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      role: "",
      firstName: "",
      lastName: "",
      mobile: "",
      email: "",
      password: "",
      confirmPassword: "",
      status: "Active",
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setEditingId(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!formData.role) {
      showToast("Please select a role", "error");
      return;
    }
    if (!formData.firstName.trim()) {
      showToast("Please enter first name", "error");
      return;
    }
    if (!/^[A-Za-z\s]+$/.test(formData.firstName.trim())) {
      showToast("First name must contain only letters", "error");
      return;
    }
    if (!formData.lastName.trim()) {
      showToast("Please enter last name", "error");
      return;
    }
    if (!/^[A-Za-z\s]+$/.test(formData.lastName.trim())) {
      showToast("Last name must contain only letters", "error");
      return;
    }
    if (!formData.mobile.trim()) {
      showToast("Please enter mobile number", "error");
      return;
    }
    if (!/^[0-9]{10}$/.test(formData.mobile)) {
      showToast("Mobile number must be exactly 10 digits", "error");
      return;
    }
    if (!/^[6-9]/.test(formData.mobile)) {
      showToast("Mobile number must start with 6, 7, 8, or 9", "error");
      return;
    }
    if (!formData.email.trim()) {
      showToast("Please enter email address", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      showToast("Please enter a valid email address", "error");
      return;
    }

    if (editingId === null && !formData.password.trim()) {
      showToast("Please enter password for new user", "error");
      return;
    }
    if (formData.password.trim() && formData.password.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      showToast("Password and Confirm Password do not match", "error");
      return;
    }

    setFormSubmitting(true);
    try {
      if (editingId !== null) {
        // Update existing user
        const updateData: UpdateSystemUserData = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          mobile: formData.mobile.trim(),
          email: formData.email.trim(),
          role: formData.role,
          status: formData.status,
        };
        if (formData.password.trim()) {
          updateData.password = formData.password.trim();
        }

        const response = await updateSystemUser(editingId, updateData);
        if (response.success) {
          showToast("System user updated successfully!", "success");
          resetForm();
          fetchSystemUsers();
        } else {
          showToast(response.message || "Failed to update system user", "error");
        }
      } else {
        // Create new user
        const createData: CreateSystemUserData = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          mobile: formData.mobile.trim(),
          email: formData.email.trim(),
          password: formData.password.trim(),
          role: formData.role,
          status: formData.status,
        };

        const response = await createSystemUser(createData);
        if (response.success) {
          showToast("System user added successfully!", "success");
          resetForm();
          fetchSystemUsers();
        } else {
          showToast(response.message || "Failed to create system user", "error");
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Error saving system user", "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEdit = (user: SystemUserType) => {
    setFormData({
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      email: user.email,
      password: "",
      confirmPassword: "",
      status: user.status || "Active",
    });
    setEditingId(user.id);
  };

  const handleOpenDeleteModal = (user: SystemUserType) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      const response = await deleteSystemUser(userToDelete.id);
      if (response.success) {
        showToast("System user deleted successfully!", "success");
        setDeleteModalOpen(false);
        setUserToDelete(null);
        fetchSystemUsers();
      } else {
        showToast(response.message || "Failed to delete system user", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Error deleting system user", "error");
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
    setCurrentPage(1);
  };

  // CSV Export Engine
  const handleExportCSV = () => {
    if (systemUsers.length === 0) {
      showToast("No system user records to export", "info");
      return;
    }

    const headers = [
      "User ID",
      "Full Name",
      "Email Address",
      "Mobile Number",
      "Role",
      "Status",
      "Created Date",
    ];

    const rows = systemUsers.map((user) => [
      `"${user.id}"`,
      `"${user.firstName} ${user.lastName}"`,
      `"${user.email}"`,
      `"${user.mobile}"`,
      `"${user.role}"`,
      `"${user.status || "Active"}"`,
      `"${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `System_Users_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("System users exported to CSV successfully!", "success");
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return (
        <span className="inline-block ml-1 text-neutral-400">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 1.5L9 4.5M3 7.5L6 10.5L9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    }
    return (
      <span className="inline-block ml-1 text-rose-700">
        {sortDirection === "asc" ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M3 7.5L6 4.5L9 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>🛡️</span> System Users & Administrators
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage administrative staff, assign roles, and govern portal access privileges
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
            <span className="text-neutral-700 font-medium">System Users</span>
          </nav>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={systemUsers.length === 0}
            className="bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 text-neutral-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 border border-neutral-300 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Add / Edit User */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>{editingId ? "✏️" : "➕"}</span>
              {editingId ? "Update System User" : "Add New System User"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Role */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Admin Role <span className="text-rose-700">*</span>
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  disabled={formSubmitting}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="">-- Select Role --</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              {/* First Name */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  First Name <span className="text-rose-700">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  placeholder="e.g. Rahul"
                  disabled={formSubmitting}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Last Name <span className="text-rose-700">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  placeholder="e.g. Sharma"
                  disabled={formSubmitting}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              {/* Mobile */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Mobile Number <span className="text-rose-700">*</span>
                </label>
                <input
                  type="tel"
                  name="mobile"
                  maxLength={10}
                  value={formData.mobile}
                  onChange={handleInputChange}
                  placeholder="e.g. 9876543210"
                  disabled={formSubmitting}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Email Address <span className="text-rose-700">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="admin@hellolocal.com"
                  disabled={formSubmitting}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                />
              </div>

              {/* Status */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Account Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  disabled={formSubmitting}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                >
                  <option value="Active">🟢 Active</option>
                  <option value="Inactive">⚪ Inactive</option>
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Password {editingId === null && <span className="text-rose-700">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder={editingId ? "Leave blank to keep" : "Min. 6 characters"}
                    disabled={formSubmitting}
                    className="w-full pl-3 pr-10 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                  Confirm Password {editingId === null && <span className="text-rose-700">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder={editingId ? "Leave blank to keep" : "Repeat password"}
                    disabled={formSubmitting}
                    className="w-full pl-3 pr-10 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="submit"
                disabled={formSubmitting}
                className="flex-1 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm"
              >
                {formSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{editingId ? "Updating User..." : "Creating User..."}</span>
                  </>
                ) : (
                  <span>{editingId ? "Save Updates" : "Create System User"}</span>
                )}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={formSubmitting}
                  className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Directory: Table View */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden flex flex-col">
          <div className="bg-rose-700 text-white px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>👥</span> Directory of Administrators ({totalUsers})
            </h2>
            <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded font-bold">
              Page {currentPage} of {totalPages || 1}
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-4 flex-1 flex flex-col">
            {/* Search, Filter, Entries Per Page */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search with Clear */}
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">
                  🔍
                </span>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name, email, mobile..."
                  className="w-full pl-8 pr-8 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[40px]"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-sm font-bold p-1"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Role Filter & Entries */}
              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[40px]"
                >
                  <option value="">All Roles</option>
                  <option value="Admin">Admin</option>
                  <option value="Super Admin">Super Admin</option>
                </select>

                <select
                  value={entriesPerPage}
                  onChange={(e) => {
                    setEntriesPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[40px]"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>

            {/* Table Container */}
            <div className="border border-neutral-200/80 rounded-xl overflow-hidden flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-neutral-50/80 text-neutral-600 font-bold border-b border-neutral-200/80 uppercase text-[10px] tracking-wider select-none">
                    <th
                      className="px-3.5 py-3 cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort("firstName")}
                    >
                      <div className="flex items-center">
                        Administrator
                        <SortIcon column="firstName" />
                      </div>
                    </th>
                    <th
                      className="px-3.5 py-3 cursor-pointer hover:bg-neutral-100 hidden sm:table-cell"
                      onClick={() => handleSort("email")}
                    >
                      <div className="flex items-center">
                        Contact Info
                        <SortIcon column="email" />
                      </div>
                    </th>
                    <th
                      className="px-3.5 py-3 cursor-pointer hover:bg-neutral-100"
                      onClick={() => handleSort("role")}
                    >
                      <div className="flex items-center">
                        Role
                        <SortIcon column="role" />
                      </div>
                    </th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/60">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400">
                        <div className="w-6 h-6 border-2 border-rose-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <span>Loading administrators...</span>
                      </td>
                    </tr>
                  ) : systemUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-neutral-400">
                        <span className="text-2xl block mb-1">🛡️</span>
                        <span>No system users found</span>
                      </td>
                    </tr>
                  ) : (
                    systemUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-neutral-900">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-[11px] text-neutral-400 sm:hidden">
                            {user.email} • {user.mobile}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 hidden sm:table-cell">
                          <div className="text-neutral-800 font-medium">{user.email}</div>
                          <div className="text-neutral-400 text-[11px] font-mono">{user.mobile}</div>
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              user.role === "Super Admin"
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              user.status === "Inactive"
                                ? "bg-neutral-100 text-neutral-600 border border-neutral-300"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {user.status === "Inactive" ? "⚪ Inactive" : "🟢 Active"}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEdit(user)}
                              className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Edit user"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(user)}
                              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center border border-rose-200"
                              title="Delete user"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-neutral-200 text-xs">
                <div className="text-neutral-500">
                  Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
                  {Math.min(currentPage * entriesPerPage, totalUsers)} of {totalUsers} users
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-neutral-700 rounded-lg font-bold min-h-[36px]"
                  >
                    ← Prev
                  </button>

                  <div className="px-3 py-1 text-neutral-700 font-bold">
                    {currentPage} / {totalPages}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 text-neutral-700 rounded-lg font-bold min-h-[36px]"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accessible Safe Delete Confirmation Modal */}
      {deleteModalOpen && userToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Confirm Admin Deletion
                </h3>
                <p className="text-xs text-neutral-500">
                  Are you sure you want to permanently delete this system user?
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-1">
              <div className="font-bold text-neutral-800">
                {userToDelete.firstName} {userToDelete.lastName}
              </div>
              <div className="text-neutral-500">{userToDelete.email} • {userToDelete.mobile}</div>
              <div className="pt-1">
                <span className="bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded text-[10px] font-bold">
                  Role: {userToDelete.role}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setUserToDelete(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold min-h-[44px]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete User</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Identity & Access Governance
      </footer>
    </div>
  );
}

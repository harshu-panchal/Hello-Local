import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import {
  getProfile,
  updateProfile,
  changePassword,
  type AdminProfile as AdminProfileType,
} from "../../../services/api/admin/adminProfileService";
import { useAuth } from "../../../context/AuthContext";
import { getStoredUser, setStoredUser } from "../../../services/api/session";

export default function AdminProfile() {
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<AdminProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Profile Form State
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
  });

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Fetch profile on mount
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [isAuthenticated]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await getProfile();
      if (response.success && response.data) {
        setProfile(response.data);
        setFormData({
          firstName: response.data.firstName,
          lastName: response.data.lastName,
          email: response.data.email,
          mobile: response.data.mobile,
        });
      }
    } catch (err: any) {
      console.error("Error fetching profile:", err);
      showToast(err.message || "Failed to load admin profile", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.firstName.trim()) {
      showToast("First name is required", "error");
      return;
    }
    if (!/^[A-Za-z\s]+$/.test(formData.firstName.trim())) {
      showToast("First name must contain only letters", "error");
      return;
    }
    if (!formData.lastName.trim()) {
      showToast("Last name is required", "error");
      return;
    }
    if (!/^[A-Za-z\s]+$/.test(formData.lastName.trim())) {
      showToast("Last name must contain only letters", "error");
      return;
    }
    if (!formData.email.trim()) {
      showToast("Email is required", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      showToast("Please enter a valid email address", "error");
      return;
    }
    if (!formData.mobile.trim()) {
      showToast("Mobile number is required", "error");
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

    try {
      setSavingProfile(true);
      const response = await updateProfile({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        mobile: formData.mobile.trim(),
      });

      if (response.success && response.data) {
        setProfile(response.data);
        showToast("Profile details updated successfully!", "success");
        setIsEditing(false);

        // Keep session storage in sync
        const stored = getStoredUser<Record<string, unknown>>("admin");
        if (stored) {
          setStoredUser(
            {
              ...stored,
              firstName: response.data.firstName,
              lastName: response.data.lastName,
              email: response.data.email,
              mobile: response.data.mobile,
            },
            "admin"
          );
        }
      } else {
        showToast(response.message || "Failed to update profile", "error");
      }
    } catch (err: any) {
      console.error("Error updating profile:", err);
      showToast(err.response?.data?.message || "Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setFormData({
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        mobile: profile.mobile,
      });
    }
    setIsEditing(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword.trim()) {
      showToast("Please enter your current password", "error");
      return;
    }
    if (!newPassword.trim()) {
      showToast("Please enter a new password", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters long", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New password and confirmation do not match", "error");
      return;
    }

    try {
      setChangingPassword(true);
      const response = await changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });

      if (response.success) {
        showToast("Password changed successfully!", "success");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
      } else {
        showToast(response.message || "Failed to change password", "error");
      }
    } catch (err: any) {
      console.error("Error changing password:", err);
      showToast(err.response?.data?.message || "Failed to change password", "error");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-8 h-8 border-4 border-rose-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <span className="text-3xl">⚠️</span>
        <p className="text-sm font-bold text-neutral-800">Failed to load admin profile</p>
        <button
          type="button"
          onClick={fetchProfile}
          className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  const initials = `${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}`.toUpperCase() || "AD";

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>👤</span> Admin Profile & Account Settings
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage your personal administrative identity, contact info, and security credentials
          </p>
        </div>

        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500 hidden sm:block">
          <Link
            to="/admin/dashboard"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">My Profile</span>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Avatar Summary Card */}
        <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-6 flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-rose-100 text-rose-800 font-extrabold text-2xl flex items-center justify-center border-4 border-rose-50 shadow-sm">
            {initials}
          </div>

          <div>
            <h2 className="text-base font-bold text-neutral-900">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="text-xs text-neutral-500">{profile.email}</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold ${
                profile.role === "Super Admin"
                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                  : "bg-rose-100 text-rose-800 border border-rose-200"
              }`}
            >
              👑 {profile.role}
            </span>
          </div>

          <div className="w-full pt-4 border-t border-neutral-100 text-left text-xs space-y-2 text-neutral-600">
            <div className="flex justify-between">
              <span className="text-neutral-400">Mobile:</span>
              <span className="font-mono font-bold text-neutral-800">{profile.mobile}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Member Since:</span>
              <span className="font-medium text-neutral-800">
                {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Profile Details & Password Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Personal Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
            <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
                <span>📋</span> Personal Details
              </h2>
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg font-bold transition-colors min-h-[32px]"
                >
                  Edit Details
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg font-bold transition-colors min-h-[32px]"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* First Name */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    First Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      disabled={savingProfile}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-900">
                      {profile.firstName}
                    </div>
                  )}
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Last Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      disabled={savingProfile}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-900">
                      {profile.lastName}
                    </div>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Email Address
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      disabled={savingProfile}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-900">
                      {profile.email}
                    </div>
                  )}
                </div>

                {/* Mobile */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Mobile Number
                  </label>
                  {isEditing ? (
                    <input
                      type="tel"
                      name="mobile"
                      maxLength={10}
                      value={formData.mobile}
                      onChange={handleInputChange}
                      disabled={savingProfile}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs font-semibold bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                  ) : (
                    <div className="px-3 py-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-900">
                      {profile.mobile}
                    </div>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingProfile}
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold min-h-[44px]"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                  >
                    {savingProfile ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Card 2: Security & Change Password */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
            <div className="bg-neutral-900 text-white px-5 py-3.5 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
                <span>🔐</span> Security & Change Password
              </h2>
            </div>

            <form onSubmit={handleChangePassword} className="p-5 sm:p-6 space-y-4">
              <p className="text-xs text-neutral-500">
                To update your password, enter your current password followed by your desired new password:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Current Password */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Current Password <span className="text-rose-700">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      disabled={changingPassword}
                      className="w-full pl-3 pr-9 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                    >
                      {showCurrentPassword ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    New Password <span className="text-rose-700">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 chars"
                      disabled={changingPassword}
                      className="w-full pl-3 pr-9 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                    >
                      {showNewPassword ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 uppercase tracking-wider">
                    Confirm Password <span className="text-rose-700">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      disabled={changingPassword}
                      className="w-full pl-3 pr-9 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:border-rose-600 outline-none min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                    >
                      {showConfirmPassword ? "👁️" : "🙈"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="bg-neutral-900 hover:bg-black disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
                >
                  {changingPassword ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Identity & Credentials Governance
      </footer>
    </div>
  );
}

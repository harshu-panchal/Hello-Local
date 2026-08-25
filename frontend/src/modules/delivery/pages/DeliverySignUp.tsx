import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  register,
  sendOTP,
  verifyOTP,
} from "../../../services/api/auth/deliveryAuthService";
import { uploadDocument } from "../../../services/api/uploadService";
import api from "../../../services/api/config";
import OTPInput from "../../../components/OTPInput";
import { useAuth } from "../../../context/AuthContext";
import { normalizeMobile } from "../../../utils/phone";
import { clearSession } from '../../../services/api/session';
import { useToast } from '../../../context/ToastContext';

export default function DeliverySignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dateOfBirth: "",
    password: "",
    address: "",
    city: "",
    pincode: "",
    accountName: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    bonusType: "",
  });

  const [showOTP, setShowOTP] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [drivingLicenseFile, setDrivingLicenseFile] = useState<File | null>(null);
  const [nationalIdentityCardFile, setNationalIdentityCardFile] = useState<File | null>(null);

  // Per-field validation. Returns an error message, or '' when valid.
  const validateField = (name: string, value: string): string => {
    const v = (value || "").trim();
    switch (name) {
      case "name":
        if (!v) return "Name is required";
        if (!/^[A-Za-z\s]+$/.test(v)) return "Name should contain only alphabets";
        return "";
      case "mobile":
        if (!v) return "Mobile number is required";
        if (!/^[6-9]\d{9}$/.test(v)) return "Enter a valid 10-digit mobile number";
        return "";
      case "email":
        if (!v) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address";
        return "";
      case "address":
        if (!v) return "Address is required";
        return "";
      case "city":
        if (!v) return "City is required";
        if (!/^[A-Za-z\s]+$/.test(v)) return "City should contain only alphabets";
        return "";
      case "dateOfBirth": {
        if (!v) return "";
        const dob = new Date(v);
        if (isNaN(dob.getTime())) return "Enter a valid date";
        const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (age < 18) return "You must be at least 18 years old";
        if (age > 100) return "Enter a valid date of birth";
        return "";
      }
      case "pincode":
        if (v && !/^\d{6}$/.test(v)) return "Pincode must be 6 digits";
        return "";
      case "accountName":
        if (v && !/^[A-Za-z\s]+$/.test(v)) return "Account name should contain only alphabets";
        return "";
      case "bankName":
        if (v && !/^[A-Za-z\s]+$/.test(v)) return "Bank name should contain only alphabets";
        return "";
      case "accountNumber":
        if (v && !/^\d{9,18}$/.test(v)) return "Account number should be 9 to 18 digits";
        return "";
      case "ifscCode":
        if (v && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v)) return "Invalid IFSC (e.g. SBIN0000456)";
        return "";
      default:
        return "";
    }
  };

  const bonusTypes = [
    "Select Bonus Type",
    "Fixed or Salaried",
    "Fixed",
    "Salaried",
    "Commission Based",
  ];

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (name === "mobile") {
      finalValue = normalizeMobile(value);
    } else if (name === "pincode") {
      finalValue = value.replace(/\D/g, "").slice(0, 6);
    } else if (name === "accountNumber") {
      finalValue = value.replace(/\D/g, "").slice(0, 18);
    } else if (name === "ifscCode") {
      finalValue = value.toUpperCase();
    }

    setFormData((prev) => ({ ...prev, [name]: finalValue }));
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, finalValue) }));
  };

  const fetchCityFromLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      showToast("Geolocation is not supported by your browser", "error");
      return;
    }

    setIsCityLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            {
              headers: {
                "Accept-Language": "en",
              },
            }
          );
          const data = await response.json();
          if (data && data.address) {
            const city =
              data.address.city ||
              data.address.town ||
              data.address.village ||
              data.address.county ||
              data.address.state_district ||
              "";
            if (city) {
              setFormData((prev) => ({ ...prev, city }));
              setFieldErrors((prev) => ({ ...prev, city: "" }));
              showToast(`City detected: ${city}`, "success");
            } else {
              setError("Could not detect city name from location");
              showToast("Could not detect city name from location", "info");
            }
          } else {
            setError("Could not fetch city from your location");
          }
        } catch (err) {
          console.error("Reverse geocoding error:", err);
          setError("Failed to fetch city details");
          showToast("Failed to fetch location details", "error");
        } finally {
          setIsCityLoading(false);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError("Location access denied. Please type your city manually.");
        showToast("Location access denied. Please enter city manually", "info");
        setIsCityLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fieldsToValidate = [
      "name", "mobile", "email", "address", "city",
      "dateOfBirth", "pincode", "accountName", "bankName", "accountNumber", "ifscCode",
    ];
    const newErrors: Record<string, string> = {};
    fieldsToValidate.forEach((name) => {
      const msg = validateField(name, (formData as any)[name]);
      if (msg) newErrors[name] = msg;
    });
    setFieldErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setError("Please fix the highlighted fields before continuing");
      showToast("Please fix the highlighted fields", "error");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Check if user already exists
      const checkRes = await api.get(`/auth/delivery/check-existence?mobile=${formData.mobile}&email=${formData.email}`);
      if (checkRes.data.success && checkRes.data.exists) {
        const msg = checkRes.data.message || "Account already exists with this mobile or email";
        setError(msg);
        showToast(msg, "error");
        setLoading(false);
        return;
      }

      // 2. Upload documents if provided
      let drivingLicenseUrl = "";
      let nationalIdentityCardUrl = "";

      if (drivingLicenseFile || nationalIdentityCardFile) {
        setUploadingDocs(true);

        try {
          if (drivingLicenseFile) {
            const drivingLicenseResult = await uploadDocument(
              drivingLicenseFile,
              "hellolocal/delivery/documents"
            );
            drivingLicenseUrl = drivingLicenseResult.secureUrl;
          }

          if (nationalIdentityCardFile) {
            const nationalIdResult = await uploadDocument(
              nationalIdentityCardFile,
              "hellolocal/delivery/documents"
            );
            nationalIdentityCardUrl = nationalIdResult.secureUrl;
          }
        } catch (uploadErr: any) {
          console.error("Document upload failed:", uploadErr);
          const uploadMsg = `Document upload failed: ${uploadErr.message || "Please try again."}`;
          setError(uploadMsg);
          showToast(uploadMsg, "error");
          setUploadingDocs(false);
          setLoading(false);
          return;
        }

        setUploadingDocs(false);
      }

      // 3. Register the user
      const response = await register({
        name: formData.name,
        mobile: formData.mobile,
        email: formData.email,
        dateOfBirth: formData.dateOfBirth || undefined,
        password: `Dlv${Date.now()}A1`,
        address: formData.address,
        city: formData.city,
        pincode: formData.pincode || undefined,
        accountName: formData.accountName || undefined,
        bankName: formData.bankName || undefined,
        accountNumber: formData.accountNumber || undefined,
        ifscCode: formData.ifscCode || undefined,
        bonusType: formData.bonusType || undefined,
        drivingLicense: drivingLicenseUrl || undefined,
        nationalIdentityCard: nationalIdentityCardUrl || undefined,
      });

      if (response.success) {
        clearSession('delivery');
        showToast("Registration initiated! Sending OTP...", "success");

        try {
          const otpRes = await sendOTP(formData.mobile);
          if (otpRes.sessionId) setSessionId(otpRes.sessionId);
          setShowOTP(true);
          showToast("4-digit OTP sent to your mobile", "success");
        } catch (otpErr: any) {
          const otpErrMsg = otpErr.message || "Registration successful but failed to send OTP.";
          setError(otpErrMsg);
          showToast(otpErrMsg, "error");
        }
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      const errorMessage = err.response?.data?.message || err.message || "Registration failed. Please try again.";
      setError(errorMessage);
      showToast(errorMessage, "error");
    } finally {
      setLoading(false);
      setUploadingDocs(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError("");

    try {
      const response = await verifyOTP(formData.mobile, otp, sessionId);
      if (response.success && response.data) {
        login(response.data.token, {
          ...response.data.user,
          userType: "Delivery",
        });
        showToast("Welcome to Hello Local Delivery!", "success");
        navigate("/delivery");
      } else if (response.success) {
        showToast("Verification successful! Please log in", "success");
        navigate("/delivery/login");
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Invalid OTP. Please try again.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 flex flex-col items-center px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 z-10 w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-neutral-50 transition-colors"
        aria-label="Back">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-800">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>

      {/* Sign Up Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div
          className="px-6 py-5 text-center border-b border-rose-700 bg-rose-600">
          <div className="mb-3">
            <img
              src="/logo.png?v=4"
              alt="Hello Local Delivery"
              className="h-16 w-auto mx-auto object-contain drop-shadow-md bg-white/20 p-2 rounded-2xl"
            />
          </div>
          <h1 className="text-xl font-black text-white">
            Delivery Partner Registration
          </h1>
          <p className="text-rose-100 text-xs mt-0.5">
            Join the Hello Local delivery network
          </p>
        </div>

        {/* Sign Up Form */}
        <div className="p-6 space-y-4">
          {!showOTP ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Personal Information */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                  Personal Information
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter your full name"
                    required
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.name ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.name && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center bg-white border border-slate-300 rounded-2xl overflow-hidden focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-200 min-h-[44px]">
                    <div className="px-3.5 py-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 bg-slate-50">
                      +91
                    </div>
                    <input
                      type="tel"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="10-digit mobile number"
                      required
                      maxLength={13}
                      className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none"
                      disabled={loading}
                    />
                  </div>
                  {fieldErrors.mobile && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.mobile}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter email address"
                    required
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.email ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.email && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Birth (Must be 18+)
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    max={new Date().toISOString().split("T")[0]}
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.dateOfBirth ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.dateOfBirth && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.dateOfBirth}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Residential Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="House, street, locality"
                    required
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.address ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.address && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.address}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Operating City <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="e.g. Pune, Mumbai, Jaipur"
                      required
                      className={`w-full pl-3.5 pr-12 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                        fieldErrors.city ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                      }`}
                      disabled={loading || isCityLoading}
                    />
                    <button
                      type="button"
                      onClick={fetchCityFromLocation}
                      disabled={isCityLoading || loading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors disabled:text-slate-400 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Fetch current location"
                    >
                      {isCityLoading ? (
                        <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.city && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.city}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pin Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                    placeholder="6-digit pincode"
                    maxLength={6}
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.pincode ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.pincode && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.pincode}</p>}
                </div>
              </div>

              {/* KYC Documents Section */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                  KYC Verification Documents
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Driving License (Photo / PDF)
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setDrivingLicenseFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer"
                  />
                  {drivingLicenseFile && (
                    <p className="text-[11px] text-emerald-700 font-bold mt-1">✓ Selected: {drivingLicenseFile.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    National ID / Aadhaar Card (Photo / PDF)
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setNationalIdentityCardFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer"
                  />
                  {nationalIdentityCardFile && (
                    <p className="text-[11px] text-emerald-700 font-bold mt-1">✓ Selected: {nationalIdentityCardFile.name}</p>
                  )}
                </div>
              </div>

              {/* Bank Information */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                  Settlement Bank Details (For Payouts)
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    name="accountName"
                    value={formData.accountName}
                    onChange={handleInputChange}
                    placeholder="Account holder name"
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.accountName ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.accountName && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.accountName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleInputChange}
                    placeholder="e.g. HDFC Bank, SBI"
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.bankName ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.bankName && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.bankName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    name="accountNumber"
                    inputMode="numeric"
                    value={formData.accountNumber}
                    onChange={handleInputChange}
                    placeholder="9–18 digits"
                    maxLength={18}
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 min-h-[44px] ${
                      fieldErrors.accountNumber ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.accountNumber && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.accountNumber}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    name="ifscCode"
                    value={formData.ifscCode}
                    onChange={handleInputChange}
                    placeholder="e.g. SBIN0000456"
                    maxLength={11}
                    className={`w-full px-3.5 py-2.5 text-xs sm:text-sm border rounded-2xl focus:outline-none focus:ring-2 uppercase min-h-[44px] ${
                      fieldErrors.ifscCode ? "border-rose-400 bg-rose-50 focus:ring-rose-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                    }`}
                    disabled={loading}
                  />
                  {fieldErrors.ifscCode && <p className="text-xs text-rose-600 mt-1 font-semibold">{fieldErrors.ifscCode}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Preferred Bonus Type
                  </label>
                  <select
                    name="bonusType"
                    value={formData.bonusType}
                    onChange={handleInputChange}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-bold border border-slate-300 rounded-2xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 min-h-[44px]"
                    disabled={loading}>
                    {bonusTypes.map((type) => (
                      <option
                        key={type}
                        value={type === "Select Bonus Type" ? "" : type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-200 font-semibold text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || uploadingDocs}
                className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm transition-all min-h-[44px] ${
                  !loading && !uploadingDocs
                    ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md active:scale-[0.98]"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed"
                }`}>
                {uploadingDocs
                  ? "Uploading Documents..."
                  : loading
                  ? "Creating Account..."
                  : "Submit & Verify Mobile"}
              </button>

              {/* Login Link */}
              <div className="text-center pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-600 font-medium">
                  Already registered as a partner?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/delivery/login")}
                    className="text-rose-600 hover:underline font-black">
                    Login
                  </button>
                </p>
              </div>
            </form>
          ) : (
            /* OTP Verification Form */
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-xs text-slate-600 mb-1 font-medium">
                  Enter the 4-digit SMS OTP sent to
                </p>
                <p className="text-sm font-black text-slate-900">
                  +91 {formData.mobile}
                </p>
              </div>

              <OTPInput onComplete={handleOTPComplete} disabled={loading} />

              {error && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-200 font-semibold text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowOTP(false);
                    setError("");
                  }}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl font-bold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200 min-h-[44px]">
                  Change Details
                </button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      const res = await sendOTP(formData.mobile);
                      if (res.sessionId) setSessionId(res.sessionId);
                      showToast("New OTP sent to your mobile", "success");
                    } catch (err: any) {
                      const resendErr = err.message || "Failed to resend OTP.";
                      setError(resendErr);
                      showToast(resendErr, "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl font-black text-xs bg-rose-600 text-white hover:bg-rose-700 transition-all min-h-[44px]">
                  {loading ? "Sending..." : "Resend OTP"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Text */}
      <p className="mt-6 text-[11px] text-slate-500 text-center max-w-md">
        By continuing, you agree to Hello Local's Terms of Service and Privacy Policy
      </p>
    </div>
  );
}

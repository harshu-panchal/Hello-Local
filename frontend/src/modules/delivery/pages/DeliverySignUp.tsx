import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  register,
  sendOTP,
  verifyOTP,
} from "../../../services/api/auth/deliveryAuthService";
import { uploadDocument } from "../../../services/api/uploadService";
import { validateDocumentFile } from "../../../utils/imageUpload";
import api from "../../../services/api/config";
import OTPInput from "../../../components/OTPInput";
import { useAuth } from "../../../context/AuthContext";
import { normalizeMobile } from "../../../utils/phone";


export default function DeliverySignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
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
      case "password":
        if (!v) return "Password is required";
        if (v.length < 6) return "Password must be at least 6 characters";
        return "";
      case "address":
        if (!v) return "Address is required";
        return "";
      case "city":
        if (!v) return "City is required";
        if (!/^[A-Za-z\s]+$/.test(v)) return "City should contain only alphabets";
        return "";
      case "dateOfBirth": {
        if (!v) return ""; // optional
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
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [drivingLicenseFile, setDrivingLicenseFile] = useState<File | null>(null);
  const [nationalIdentityCardFile, setNationalIdentityCardFile] = useState<File | null>(null);

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
      return;
    }

    setIsCityLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          if (data.status === "OK") {
            const addressComponents = data.results[0].address_components;
            const cityComponent = addressComponents.find((c: any) =>
              c.types.includes("locality") || c.types.includes("administrative_area_level_2")
            );
            if (cityComponent) {
              setFormData((prev) => ({ ...prev, city: cityComponent.long_name }));
            }
          } else {
            setError("Could not fetch city from your location");
          }
        } catch (err) {
          setError("Failed to fetch city details");
        } finally {
          setIsCityLoading(false);
        }
      },
      (err) => {
        setError("Location access denied. Please type your city manually.");
        setIsCityLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate every field via the shared per-field validator
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
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Check if user already exists BEFORE uploading documents
      const checkRes = await api.get(`/auth/delivery/check-existence?mobile=${formData.mobile}&email=${formData.email}`);
      if (checkRes.data.success && checkRes.data.exists) {
        setError(checkRes.data.message || "Account already exists with this mobile or email");
        setLoading(false);
        return;
      }

      // 2. Upload documents if provided
      let drivingLicenseUrl = (formData as any).drivingLicenseUrl;
      let nationalIdentityCardUrl = (formData as any).nationalIdentityCardUrl;

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
          setError(`Document upload failed: ${uploadErr.message || "Please try again or skip documents for now."}`);
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
        password: `Dlv${Date.now()}A1`, // placeholder — login is OTP-only, password is never used (#136)
        address: formData.address,
        city: formData.city,
        pincode: formData.pincode || undefined,
        accountName: formData.accountName || undefined,
        bankName: formData.bankName || undefined,
        accountNumber: formData.accountNumber || undefined,
        ifscCode: formData.ifscCode || undefined,
        bonusType: formData.bonusType || undefined,
      });

      if (response.success) {
        // Clear token from registration (we'll get it after OTP verification)
        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
        // Registration successful, now send SMS OTP for verification
        try {
          const otpRes = await sendOTP(formData.mobile);
          if (otpRes.sessionId) setSessionId(otpRes.sessionId);
          setShowOTP(true);
        } catch (otpErr: any) {
          setError(
            otpErr.message ||
            "Registration successful but failed to send OTP."
          );
        }
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      const errorMessage = err.response?.data?.message || err.message || "Registration failed. Please try again.";
      setError(errorMessage);
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
        // Properly update AuthContext so ProtectedRoute allows access
        login(response.data.token, {
          ...response.data.user,
          userType: "Delivery",
        });
        navigate("/delivery");
      } else if (response.success) {
        // Fallback: no data returned but OTP was valid — go to login
        navigate("/delivery/login");
      }
    } catch (err: any) {
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 flex flex-col items-center px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-neutral-50 transition-colors"
        aria-label="Back">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15 18L9 12L15 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "black" }}
          />
        </svg>
      </button>

      {/* Sign Up Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div
          className="px-6 py-4 text-center border-b border-rose-700"
          style={{
            backgroundColor: "#ff4d8d",
          }}>
          <div className="mb-4">
            <img
              src="/logo.png?v=4"
              alt="Hello Local Delivery"
              className="h-20 w-auto mx-auto object-contain drop-shadow-md bg-white/20 p-2 rounded-xl"
            />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Delivery Sign Up
          </h1>
          <p className="text-rose-50 text-sm -mt-2">
            Create your delivery partner account
          </p>
        </div>

        {/* Sign Up Form */}
        <div className="p-6 space-y-4">
          {!showOTP ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-neutral-700 border-b pb-2">
                  Personal Information
                </h3>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter your full name"
                    required
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.name ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center bg-white border border-neutral-300 rounded-lg overflow-hidden focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-200">
                    <div className="px-3 py-2.5 text-sm font-medium text-neutral-600 border-r border-neutral-300 bg-neutral-50">
                      +91
                    </div>
                    <input
                      type="tel"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="Enter mobile number"
                      required
                      // Allow a leading country code (e.g. "91...") to be typed/pasted so
                      // normalizeMobile can strip it down to the 10-digit number.
                      maxLength={13}
                      className="flex-1 px-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none"
                      disabled={loading}
                    />
                  </div>
                  {fieldErrors.mobile && <p className="text-xs text-red-600 mt-1">{fieldErrors.mobile}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter email address"
                    required
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.email ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    max={new Date().toISOString().split("T")[0]}
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.dateOfBirth ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.dateOfBirth && <p className="text-xs text-red-600 mt-1">{fieldErrors.dateOfBirth}</p>}
                </div>

                {/* Password field removed — delivery login is OTP-only (#136) */}

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter your address"
                    required
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.address ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.address && <p className="text-xs text-red-600 mt-1">{fieldErrors.address}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    City <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Enter your city"
                      required
                      className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.city ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                      disabled={loading || isCityLoading}
                    />
                    <button
                      type="button"
                      onClick={fetchCityFromLocation}
                      disabled={isCityLoading || loading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:text-neutral-400"
                      title="Fetch current location"
                    >
                      {isCityLoading ? (
                        <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.city && <p className="text-xs text-red-600 mt-1">{fieldErrors.city}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Pincode
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                    placeholder="Enter 6-digit pincode"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.pincode ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.pincode && <p className="text-xs text-red-600 mt-1">{fieldErrors.pincode}</p>}
                </div>
              </div>

              {/* Bank Information */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold text-neutral-700 border-b pb-2">
                  Bank Account Information (Optional)
                </h3>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Account Name
                  </label>
                  <input
                    type="text"
                    name="accountName"
                    value={formData.accountName}
                    onChange={handleInputChange}
                    placeholder="Account holder name"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.accountName ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.accountName && <p className="text-xs text-red-600 mt-1">{fieldErrors.accountName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleInputChange}
                    placeholder="Bank name"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.bankName ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.bankName && <p className="text-xs text-red-600 mt-1">{fieldErrors.bankName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Account Number
                  </label>
                  <input
                    type="text"
                    name="accountNumber"
                    inputMode="numeric"
                    value={formData.accountNumber}
                    onChange={handleInputChange}
                    placeholder="Account number (9-18 digits)"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.accountNumber ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.accountNumber && <p className="text-xs text-red-600 mt-1">{fieldErrors.accountNumber}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    name="ifscCode"
                    value={formData.ifscCode}
                    onChange={handleInputChange}
                    placeholder="IFSC code (e.g. SBIN0000456)"
                    maxLength={11}
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${fieldErrors.ifscCode ? "border-red-400 focus:border-red-500 focus:ring-red-200" : "border-neutral-300 focus:border-rose-500 focus:ring-rose-200"}`}
                    disabled={loading}
                  />
                  {fieldErrors.ifscCode && <p className="text-xs text-red-600 mt-1">{fieldErrors.ifscCode}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Bonus Type
                  </label>
                  <select
                    name="bonusType"
                    value={formData.bonusType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
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
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${!loading
                  ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md"
                  : "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  }`}>
                {loading
                  ? "Creating Account..."
                  : "Sign Up"}
              </button>

              {/* Login Link */}
              <div className="text-center pt-2 border-t border-neutral-200">
                <p className="text-sm text-neutral-600">
                  Already have a delivery partner account?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/delivery/login")}
                    className="text-rose-600 hover:text-rose-700 font-semibold">
                    Login
                  </button>
                </p>
              </div>
            </form>
          ) : (
            /* OTP Verification Form */
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-neutral-600 mb-2">
                  Enter the 4-digit OTP sent via voice call to
                </p>
                <p className="text-sm font-semibold text-neutral-800">
                  +91 {formData.mobile}
                </p>
              </div>

              <OTPInput onComplete={handleOTPComplete} disabled={loading} />

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowOTP(false);
                    setError("");
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors border border-neutral-300">
                  Back
                </button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      const res = await sendOTP(formData.mobile);
                      if (res.sessionId) setSessionId(res.sessionId);
                    } catch (err: any) {
                      setError(
                        err.message || "Failed to resend OTP."
                      );
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-rose-600 text-white hover:bg-rose-700 transition-colors">
                  {loading ? "Calling..." : "Resend OTP"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Text */}
      <p className="mt-6 text-xs text-neutral-500 text-center max-w-md">
        By continuing, you agree to Hello Local's Terms of Service and Privacy Policy
      </p>
    </div>
  );
}


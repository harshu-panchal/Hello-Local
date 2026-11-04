import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register, sendSignupOTP, verifySignupOTP } from '../../../services/api/auth/sellerAuthService';
import { useOtpResend } from '../../../hooks/useOtpResend';
import OTPInput from '../../../components/OTPInput';
import GoogleMapsAutocomplete from '../../../components/GoogleMapsAutocomplete';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { getHeaderCategoriesPublic, HeaderCategory } from '../../../services/api/headerCategoryService';
import LocationPickerMap from '../../../components/LocationPickerMap';
import { normalizeMobile } from '../../../utils/phone';
import LegalPolicyModal, { PolicyTab } from '../../../components/LegalPolicyModal';
import {
  getActiveSubscriptionPlans,
  createSubscriptionOrder,
  SubscriptionPlan,
} from '../../../services/api/subscriptionService';
import { SellerButton } from '../components/common/SellerButton';
import { SellerFormField } from '../components/common/SellerFormField';
import { SellerCard } from '../components/common/SellerCard';

export default function SellerSignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();

  // Multi-step Stepper: 1: Phone -> 2: Store Info -> 3: Location -> 4: Free Trial Launch
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  const [formData, setFormData] = useState({
    sellerName: '',
    mobile: '',
    email: '',
    storeName: '',
    category: '',
    categories: [] as string[],
    address: '',
    city: '',
    panCard: '',
    taxName: '',
    taxNumber: '',
    searchLocation: '',
    latitude: '',
    longitude: '',
    serviceRadiusKm: '10',
    accountName: '',
    bankName: '',
    branch: '',
    accountNumber: '',
    ifsc: '',
  });

  const [showOTP, setShowOTP] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
  const resend = useOtpResend();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<HeaderCategory[]>([]);
  const [policyTab, setPolicyTab] = useState<PolicyTab | null>(null);

  // Paid Plan Fallback
  const [showPaidPlans, setShowPaidPlans] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [completedPayment, setCompletedPayment] = useState<{
    planId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  } | null>(() => {
    try {
      const saved = sessionStorage.getItem('hl_pending_registration_payment');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const updateCompletedPayment = (details: {
    planId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  } | null) => {
    setCompletedPayment(details);
    try {
      if (details) {
        sessionStorage.setItem('hl_pending_registration_payment', JSON.stringify(details));
      } else {
        sessionStorage.removeItem('hl_pending_registration_payment');
      }
    } catch {}
  };

  const validateField = (name: string, value: string): string => {
    const v = (value || '').trim();
    switch (name) {
      case 'sellerName':
        if (!v) return 'Owner name is required';
        if (!/^[A-Za-z\s]+$/.test(v)) return 'Name should contain only alphabets';
        return '';
      case 'mobile':
        if (!v) return 'Mobile number is required';
        if (!/^\d{10}$/.test(v)) return 'Enter a valid 10-digit mobile number';
        if (!/^[6-9]/.test(v)) return 'Mobile number must start with 6, 7, 8, or 9';
        return '';
      case 'email':
        if (!v) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
        return '';
      case 'storeName':
        if (!v) return 'Store name is required';
        return '';
      case 'city':
        if (!v) return 'City is required';
        if (!/^[A-Za-z\s]+$/.test(v)) return 'City should contain only alphabets';
        return '';
      case 'serviceRadiusKm': {
        const radius = parseFloat(v);
        if (!v) return 'Service radius is required';
        if (isNaN(radius) || radius < 0.1 || radius > 100) return 'Radius must be between 0.1 and 100 km';
        return '';
      }
      default:
        return '';
    }
  };

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await getHeaderCategoriesPublic();
        if (Array.isArray(res)) {
          setCategories(res.filter((cat) => cat.status === 'Published'));
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCats();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (name === 'mobile') {
      finalValue = normalizeMobile(value);
    } else if (name === 'serviceRadiusKm') {
      const cleanedValue = value.replace(/[^0-9.]/g, '');
      const parts = cleanedValue.split('.');
      finalValue = parts.length > 2 ? `${parts[0]}.${parts[1]}` : cleanedValue;
    }

    setFormData((prev) => ({ ...prev, [name]: finalValue }));
    const err = validateField(name, finalValue);
    setFieldErrors((prev) => ({ ...prev, [name]: err }));
  };

  const handleCategoryToggle = (categoryName: string) => {
    setFormData((prev) => {
      const current = prev.categories || [];
      const updated = current.includes(categoryName)
        ? current.filter((c) => c !== categoryName)
        : [...current, categoryName];
      return {
        ...prev,
        categories: updated,
        category: updated[0] || '',
      };
    });
    setFieldErrors((prev) => ({ ...prev, categories: '' }));
  };

  // STEP 1: Send OTP
  const handleSendOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const mobileErr = validateField('mobile', formData.mobile);
    if (mobileErr) {
      setFieldErrors((prev) => ({ ...prev, mobile: mobileErr }));
      showToast(mobileErr, 'error');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendSignupOTP(formData.mobile);
      if (response.success) {
        setSessionId(response.sessionId);
        setRegistrationToken('');
        resend.start();
        setShowOTP(true);
        showToast('Verification code sent successfully!', 'success');
      } else {
        const msg = response.message || 'Failed to send OTP';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // STEP 1: Verify OTP
  const handleVerifyOTP = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const proof = registrationToken || (await verifySignupOTP(formData.mobile, otp, sessionId)).data.registrationToken;
      setRegistrationToken(proof);
      if (proof) {
        showToast('Mobile number verified successfully!', 'success');
        setShowOTP(false);
        setCurrentStep(2); // Automatically advance to Store Details!
      } else {
        const msg = 'Invalid verification code';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      if (err.response?.status === 401) setRegistrationToken('');
      const msg = err.response?.data?.message || 'Verification failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 Validation & Advance
  const handleValidateStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    const step2Fields = ['sellerName', 'email', 'storeName', 'city'];
    const newErrors: Record<string, string> = {};
    step2Fields.forEach((field) => {
      const msg = validateField(field, (formData as any)[field] || '');
      if (msg) newErrors[field] = msg;
    });

    if (!formData.category && (!formData.categories || formData.categories.length === 0)) {
      newErrors.categories = 'Please select at least one product category';
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      showToast('Please fix highlighted errors to proceed', 'error');
      return;
    }

    setFieldErrors({});
    setError('');
    setCurrentStep(3); // Advance to Location
  };

  // STEP 3 Validation & Advance
  const handleValidateStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.address && !formData.searchLocation) {
      newErrors.address = 'Store address or location is required';
    }

    const radiusMsg = validateField('serviceRadiusKm', formData.serviceRadiusKm);
    if (radiusMsg) newErrors.serviceRadiusKm = radiusMsg;

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      showToast('Please specify your store location to continue', 'error');
      return;
    }

    setFieldErrors({});
    setError('');
    setCurrentStep(4); // Advance to VoLoMart-style Free Trial Activation
  };

  // STEP 4: VoLoMart Instant 7-Day Free Trial Launch
  const handleLaunchFreeTrial = async () => {
    if (!registrationToken) {
      showToast('Please verify your mobile number first', 'error');
      setCurrentStep(1);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const registerPayload = {
        registrationToken,
        ...formData,
        category: formData.category || (formData.categories && formData.categories[0]) || '',
        categories: formData.categories || [],
        serviceRadiusKm: parseFloat(formData.serviceRadiusKm) || 10,
        isFreeTrial: true,
        planType: 'TRIAL',
      };

      const regRes = await register(registerPayload);
      if (regRes.success && regRes.data) {
        showToast('🎉 Welcome to HelloLocal! 7-Day Free Trial activated.', 'success');
        login(regRes.data.token, {
          id: regRes.data.user.id,
          name: regRes.data.user.sellerName,
          email: regRes.data.user.email,
          phone: regRes.data.user.mobile,
          userType: 'Seller',
          storeName: regRes.data.user.storeName,
          status: regRes.data.user.status,
          address: (regRes.data.user as any)?.address || formData.address,
          city: (regRes.data.user as any)?.city || formData.city,
        });
        navigate('/seller', { replace: true });
      } else {
        const msg = regRes.message || 'Registration failed';
        const isEmail = (regRes as any)?.field === 'email' || msg.toLowerCase().includes('email');
        setError(msg);
        showToast(msg, 'error');
        if (isEmail) {
          setCurrentStep(2);
          setFieldErrors((prev) => ({ ...prev, email: msg }));
        }
      }
    } catch (err: any) {
      const field = err.response?.data?.field;
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      const isEmail = field === 'email' || msg.toLowerCase().includes('email');
      setError(msg);
      showToast(msg, 'error');
      if (isEmail) {
        setCurrentStep(2);
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      }
    } finally {
      setLoading(false);
    }
  };

  // Optional: Pay upfront plan flow
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleOpenPaidPlans = async () => {
    try {
      setLoading(true);
      const plans = await getActiveSubscriptionPlans();
      setSubscriptionPlans(plans);
      if (plans.length > 0) {
        const defaultPlan = plans.find((p) => p.isPopular) || plans[0];
        setSelectedPlanId(defaultPlan._id);
      }
      setShowPaidPlans(true);
    } catch (err) {
      showToast('Could not load subscription plans', 'error');
    } finally {
      setLoading(false);
    }
  };

  const submitPaidRegistration = async (paymentDetails: {
    planId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => {
    try {
      setLoading(true);
      const registerPayload = {
        registrationToken,
        ...formData,
        category: formData.category || (formData.categories && formData.categories[0]) || '',
        categories: formData.categories || [],
        serviceRadiusKm: parseFloat(formData.serviceRadiusKm) || 10,
        planId: paymentDetails.planId,
        razorpayOrderId: paymentDetails.razorpayOrderId,
        razorpayPaymentId: paymentDetails.razorpayPaymentId,
        razorpaySignature: paymentDetails.razorpaySignature,
      };

      const regRes = await register(registerPayload);
      if (regRes.success && regRes.data) {
        updateCompletedPayment(null);
        showToast('Registration successful! Welcome to HelloLocal.', 'success');
        login(regRes.data.token, {
          id: regRes.data.user.id,
          name: regRes.data.user.sellerName,
          email: regRes.data.user.email,
          phone: regRes.data.user.mobile,
          userType: 'Seller',
          storeName: regRes.data.user.storeName,
          status: regRes.data.user.status,
          address: (regRes.data.user as any)?.address || formData.address,
          city: (regRes.data.user as any)?.city || formData.city,
        });
        navigate('/seller', { replace: true });
      } else {
        const msg = regRes.message || 'Registration failed';
        const isEmail = (regRes as any)?.field === 'email' || msg.toLowerCase().includes('email');
        setError(msg);
        showToast(msg, 'error');
        // Retain verified payment intent on any post-payment registration failure
        updateCompletedPayment(paymentDetails);
        if (isEmail) {
          setCurrentStep(2);
          setFieldErrors((prev) => ({ ...prev, email: msg }));
        }
      }
    } catch (err: any) {
      const field = err.response?.data?.field;
      const msg = err.response?.data?.message || 'Registration verification failed';
      const isEmail = field === 'email' || msg.toLowerCase().includes('email');
      setError(msg);
      showToast(msg, 'error');
      // Retain verified payment intent on any post-payment registration failure
      updateCompletedPayment(paymentDetails);
      if (isEmail) {
        setCurrentStep(2);
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      }
    } finally {
      setLoading(false);
      setPaymentProcessing(false);
    }
  };

  const handlePayAndRegister = async () => {
    // If a payment was already verified on Razorpay but registration stopped at a form error (e.g. duplicate email),
    // retry with the existing payment details so the merchant is never double-charged.
    if (completedPayment) {
      await submitPaidRegistration(completedPayment);
      return;
    }

    const selectedPlan = subscriptionPlans.find((p) => p._id === selectedPlanId);
    if (!selectedPlan) {
      showToast('Please select a subscription plan to continue', 'error');
      return;
    }

    try {
      setPaymentProcessing(true);
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        showToast('Failed to load Razorpay payment gateway SDK', 'error');
        setPaymentProcessing(false);
        return;
      }

      const orderData = await createSubscriptionOrder(selectedPlan._id, formData.mobile);

      const options = {
        key: orderData.razorpayKey,
        amount: orderData.amount,
        currency: 'INR',
        name: 'Hello Local',
        description: `${selectedPlan.name} Subscription`,
        order_id: orderData.razorpayOrderId,
        prefill: {
          name: formData.sellerName,
          email: formData.email,
          contact: formData.mobile,
        },
        theme: {
          color: '#2D1B69',
        },
        modal: {
          ondismiss: () => {
            setPaymentProcessing(false);
            showToast('Payment was cancelled. You can also start with the 7-Day Free Trial.', 'info');
          },
        },
        handler: async function (response: any) {
          await submitPaidRegistration({
            planId: selectedPlan._id,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        showToast(resp.error?.description || 'Payment was unsuccessful. Please retry.', 'error');
        setPaymentProcessing(false);
      });
      rzp.open();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to initiate payment', 'error');
      setPaymentProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-3xl w-full mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2D1B69] to-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md">
            HL
          </div>
          <span className="text-base font-black text-slate-900 tracking-tight">
            Hello<span className="text-purple-600">Local</span> Partner
          </span>
        </Link>
        <Link to="/seller/login" className="text-xs sm:text-sm font-bold text-purple-600 hover:underline min-h-[44px] flex items-center">
          Already a seller? Log In
        </Link>
      </div>

      {/* Main Container */}
      <div className="max-w-2xl w-full mx-auto my-6 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 space-y-6">
        {/* VoLoMart-Style 4-Step Progress Indicator */}
        <div className="max-w-md mx-auto mb-2">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
            {[
              { step: 1, label: 'Phone' },
              { step: 2, label: 'Store Info' },
              { step: 3, label: 'Location' },
              { step: 4, label: 'Free Trial' },
            ].map((item) => (
              <div key={item.step} className="relative z-10 flex flex-col items-center">
                <button
                  type="button"
                  disabled={item.step > currentStep || (item.step > 1 && !registrationToken)}
                  onClick={() => {
                    if (item.step <= currentStep || (registrationToken && item.step < 4)) {
                      setCurrentStep(item.step as any);
                    }
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    currentStep === item.step
                      ? 'bg-purple-600 text-white shadow-md ring-4 ring-purple-100 cursor-default'
                      : currentStep > item.step
                      ? 'bg-emerald-600 text-white cursor-pointer hover:opacity-90'
                      : 'bg-white border-2 border-slate-300 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {currentStep > item.step ? '✓' : item.step}
                </button>
                <span
                  className={`text-[10px] sm:text-[11px] font-bold mt-1.5 ${
                    currentStep === item.step
                      ? 'text-purple-600'
                      : currentStep > item.step
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold text-center">
            {error}
          </div>
        )}

        {/* STEP 1: MOBILE & OTP VERIFICATION */}
        {currentStep === 1 && (
          <div className="space-y-6 py-2">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {registrationToken ? 'Mobile Number Verified' : showOTP ? 'Enter Verification Code' : 'Start Selling on HelloLocal'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                {registrationToken
                  ? `Verified as +91 ${formData.mobile}`
                  : showOTP
                  ? `We sent a 4-digit OTP code to +91 ${formData.mobile}`
                  : 'Enter your phone number to launch your online store with a 7-Day Free Trial.'}
              </p>
            </div>

            {registrationToken ? (
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="font-bold text-emerald-900 text-sm">Mobile Verified</h4>
                  <p className="text-xs text-emerald-700">+91 {formData.mobile}</p>
                </div>
                <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                  <SellerButton
                    type="button"
                    variant="primary"
                    onClick={() => setCurrentStep(2)}
                    className="min-h-[44px]"
                  >
                    Continue to Store Details →
                  </SellerButton>
                  <button
                    type="button"
                    onClick={() => {
                      setRegistrationToken('');
                      setShowOTP(false);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold py-2"
                  >
                    Change Number
                  </button>
                </div>
              </div>
            ) : !showOTP ? (
              <form onSubmit={handleSendOTP} className="space-y-4 max-w-md mx-auto">
                <SellerFormField label="Mobile Number" error={fieldErrors.mobile} required>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs sm:text-sm font-bold text-slate-500">
                      +91
                    </span>
                    <input
                      type="tel"
                      name="mobile"
                      maxLength={10}
                      autoFocus
                      value={formData.mobile}
                      onChange={handleInputChange}
                      placeholder="Enter 10-digit mobile"
                      className="w-full rounded-xl border border-slate-300 pl-12 pr-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </div>
                </SellerFormField>

                <SellerButton
                  type="submit"
                  variant="primary"
                  fullWidth
                  disabled={loading || formData.mobile.length !== 10}
                  isLoading={loading}
                  className="min-h-[44px]"
                >
                  Send Verification Code →
                </SellerButton>
              </form>
            ) : (
              <div className="space-y-4 max-w-sm mx-auto text-center">
                <div className="flex justify-center py-2">
                  <OTPInput
                    length={4}
                    onComplete={handleVerifyOTP}
                    disabled={loading}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                  <span>Didn't receive code?</span>
                  <button
                    type="button"
                    onClick={() => handleSendOTP()}
                    disabled={resend.remaining > 0 || loading}
                    className={`font-bold transition-colors ${
                      resend.remaining > 0 ? 'text-slate-400 cursor-not-allowed' : 'text-purple-600 hover:underline'
                    }`}
                  >
                    {resend.remaining > 0 ? `Resend OTP in ${resend.remaining}s` : 'Resend Code'}
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowOTP(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
                  >
                    ← Edit Mobile Number
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: STORE INFORMATION */}
        {currentStep === 2 && (
          <form onSubmit={handleValidateStep2} className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Store Details
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Provide basic shop information for customer discovery.
              </p>
            </div>

            <SellerCard title="Store Profile">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SellerFormField label="Store Display Name" error={fieldErrors.storeName} required>
                    <input
                      type="text"
                      name="storeName"
                      autoFocus
                      value={formData.storeName}
                      onChange={handleInputChange}
                      placeholder="e.g. Sharma Supermarket"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>

                  <SellerFormField label="Store Owner Full Name" error={fieldErrors.sellerName} required>
                    <input
                      type="text"
                      name="sellerName"
                      value={formData.sellerName}
                      onChange={handleInputChange}
                      placeholder="e.g. Rajesh Sharma"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SellerFormField label="Store / Business Email" error={fieldErrors.email} required>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="rajesh.store@gmail.com"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>

                  <SellerFormField label="City" error={fieldErrors.city} required>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="e.g. Navi Mumbai"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                    />
                  </SellerFormField>
                </div>

                <SellerFormField label="Select Product Categories Sold" error={fieldErrors.categories} required>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {categories.map((c) => {
                      const isSelected = formData.categories.includes(c.name);
                      return (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => handleCategoryToggle(c.name)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {c.name} {isSelected && '✓'}
                        </button>
                      );
                    })}
                  </div>
                </SellerFormField>
              </div>
            </SellerCard>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]"
              >
                ← Back
              </button>
              <SellerButton
                type="submit"
                variant="primary"
                className="flex-1 min-h-[44px]"
              >
                Continue to Store Location →
              </SellerButton>
            </div>
          </form>
        )}

        {/* STEP 3: STORE LOCATION & DELIVERY */}
        {currentStep === 3 && (
          <form onSubmit={handleValidateStep3} className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Store Location & Reach
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Set your physical shop location and neighborhood delivery range.
              </p>
            </div>

            <SellerCard title="Physical Address & Reach">
              <div className="space-y-4">
                <SellerFormField label="Store Address / Landmark" error={fieldErrors.address} required>
                  <GoogleMapsAutocomplete
                    value={formData.searchLocation || formData.address}
                    onChange={(address, lat, lng) => {
                      setFormData((prev) => ({
                        ...prev,
                        address,
                        searchLocation: address,
                        latitude: lat.toString(),
                        longitude: lng.toString(),
                      }));
                    }}
                    placeholder="Search landmark, street, or full shop address..."
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                  />
                </SellerFormField>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Service Delivery Radius (KM): <span className="text-purple-600 font-black">{formData.serviceRadiusKm} km</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    {['3', '5', '10', '15', '20'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, serviceRadiusKm: r }))}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          formData.serviceRadiusKm === r
                            ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
                        }`}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>

                {formData.latitude && formData.longitude && (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden h-60">
                    <LocationPickerMap
                      initialLat={parseFloat(formData.latitude) || 19.033}
                      initialLng={parseFloat(formData.longitude) || 73.0297}
                      onLocationSelect={(lat, lng) => {
                        setFormData((prev) => ({
                          ...prev,
                          latitude: lat.toString(),
                          longitude: lng.toString(),
                        }));
                      }}
                      height="100%"
                    />
                  </div>
                )}
              </div>
            </SellerCard>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]"
              >
                ← Back
              </button>
              <SellerButton
                type="submit"
                variant="primary"
                className="flex-1 min-h-[44px]"
              >
                Review & Activate Free Store →
              </SellerButton>
            </div>
          </form>
        )}

        {/* STEP 4: VOLOMART 7-DAY FREE TRIAL ACTIVATION */}
        {currentStep === 4 && (
          <div className="space-y-6 py-2">
            {!showPaidPlans ? (
              <div className="space-y-5">
                <div className="text-center space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    🎉 VoLoMart-Style Welcome Offer
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    Start Your 7-Day Free Trial
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                    Launch your storefront immediately. Accept customer orders with <strong>0% platform commission</strong>. No payment card or upfront fee required.
                  </p>
                </div>

                {/* Summary Card */}
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/90 text-xs space-y-2">
                  <div className="flex justify-between pb-2 border-b border-slate-200/70">
                    <span className="text-slate-500 font-medium">Store Name:</span>
                    <span className="font-bold text-slate-800">{formData.storeName}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200/70">
                    <span className="text-slate-500 font-medium">Registered Phone:</span>
                    <span className="font-bold text-emerald-700">+91 {formData.mobile} ✓</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200/70">
                    <span className="text-slate-500 font-medium">Location:</span>
                    <span className="font-semibold text-slate-800">{formData.city} ({formData.serviceRadiusKm} km radius)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Categories:</span>
                    <span className="font-semibold text-purple-700">{formData.categories.join(', ')}</span>
                  </div>
                </div>

                {/* Free Trial Perks */}
                <div className="bg-gradient-to-tr from-purple-50 to-indigo-50/40 rounded-2xl p-4 sm:p-5 border border-purple-100 space-y-2.5">
                  <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                    Included in Your Free Trial:
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-700">
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                      <span><strong>0% Commission</strong> — Keep 100% of all customer order values</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                      <span><strong>7 Days 100% Free</strong> — Zero upfront cost, cancel or upgrade anytime</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                      <span><strong>Instant Store Activation</strong> — Start listing products immediately</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                      <span><strong>Store Pickup & Local Delivery</strong> supported</span>
                    </li>
                  </ul>
                </div>

                {/* Launch Button */}
                <div className="space-y-3 pt-2">
                  <SellerButton
                    type="button"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={loading}
                    isLoading={loading}
                    onClick={handleLaunchFreeTrial}
                    className="min-h-[48px] text-base font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20"
                  >
                    🚀 Launch Store (Start 7-Day Free Trial)
                  </SellerButton>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="text-slate-500 hover:text-slate-700 font-semibold"
                    >
                      ← Back to Location
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenPaidPlans}
                      className="text-purple-600 hover:underline font-bold"
                    >
                      Or view paid annual plans →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Optional: Upfront Paid Plans Selection */
              <div className="space-y-5">
                <div className="text-center space-y-1">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                    Choose Store Membership Plan
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Select a membership package to activate your store.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {subscriptionPlans.map((plan) => {
                    const isSelected = selectedPlanId === plan._id;
                    return (
                      <div
                        key={plan._id}
                        onClick={() => setSelectedPlanId(plan._id)}
                        className={`cursor-pointer rounded-2xl p-4 border-2 transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-100'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{plan.name}</h4>
                            {plan.isPopular && (
                              <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                                Popular
                              </span>
                            )}
                          </div>
                          <div className="my-2">
                            <span className="text-xl font-black text-slate-900">₹{plan.price}</span>
                            <span className="text-[11px] text-slate-500 block">/ {plan.durationInDays} days</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className={`text-[10px] font-bold ${isSelected ? 'text-purple-600' : 'text-slate-400'}`}>
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                          <input
                            type="radio"
                            name="planRadio"
                            checked={isSelected}
                            onChange={() => setSelectedPlanId(plan._id)}
                            className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 pt-3">
                  {completedPayment && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-600">✓</span>
                        <span>Payment verified. Click below to complete registration without paying again.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateCompletedPayment(null)}
                        className="text-[11px] text-emerald-700 underline font-semibold ml-2 shrink-0"
                      >
                        Reset payment
                      </button>
                    </div>
                  )}

                  <SellerButton
                    type="button"
                    onClick={handlePayAndRegister}
                    disabled={loading || paymentProcessing || (!selectedPlanId && !completedPayment)}
                    className="w-full min-h-[46px] font-bold bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {paymentProcessing || loading
                      ? 'Processing Registration...'
                      : completedPayment
                      ? 'Complete Store Activation (Payment Verified ✓)'
                      : 'Pay & Activate Store'}
                  </SellerButton>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowPaidPlans(false)}
                      className="text-xs text-purple-600 hover:underline font-bold"
                    >
                      ← Back to 7-Day Free Trial
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Legal Policies Link */}
        <div className="pt-3 border-t border-slate-100 text-center text-slate-400 text-[11px]">
          By continuing, you agree to our{' '}
          <button
            type="button"
            onClick={() => setPolicyTab('terms')}
            className="text-purple-600 hover:underline font-medium"
          >
            Terms of Service
          </button>
          {' '}and{' '}
          <button
            type="button"
            onClick={() => setPolicyTab('privacy')}
            className="text-purple-600 hover:underline font-medium"
          >
            Privacy Policy
          </button>
          .
        </div>
      </div>

      {/* Legal Modal */}
      {policyTab && (
        <LegalPolicyModal
          initialTab={policyTab}
          open={Boolean(policyTab)}
          onClose={() => setPolicyTab(null)}
        />
      )}

      {/* Footer Branding */}
      <footer className="text-center text-xs text-slate-400 py-2">
        HelloLocal Quick-Commerce Merchant Network
      </footer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../services/api/auth/customerAuthService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import OTPInput from '../../components/OTPInput';
import { normalizeMobile } from '../../utils/phone';
import Lottie from 'lottie-react';
import groceryAnimation from '../../../assets/animation/Grocery-animation.json';
import { ArrowLeftIcon } from './components/common/UserIcons';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [mobileNumber, setMobileNumber] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  // Destination redirect path from RequireCustomer (e.g. /checkout, /account, /orders)
  const fromPath = (location.state as any)?.from?.pathname || (location.state as any)?.from || '/';

  // 30-second countdown interval for OTP resend
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const validateMobile = (value: string): string => {
    if (!value) return 'Mobile number is required';
    if (value.length !== 10) return 'Mobile number must be 10 digits';
    if (!/^[6-9]/.test(value)) return 'Mobile number must start with 6, 7, 8, or 9';
    return '';
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = normalizeMobile(e.target.value);
    setMobileNumber(val);
    if (val.length > 0) setMobileError(validateMobile(val));
    else setMobileError('');
  };

  const handleContinue = async () => {
    const err = validateMobile(mobileNumber);
    if (err) {
      setMobileError(err);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendOTP(mobileNumber);
      if (response.sessionId) {
        setSessionId(response.sessionId);
      }
      setShowOTP(true);
      setResendTimer(30); // 30-second cooldown
      showToast('4-digit verification code sent to your phone', 'success');
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await verifyOTP(mobileNumber, otp, sessionId);
      if (response.success && response.data) {
        login(response.data.token, {
          id: response.data.user.id,
          name: response.data.user.name,
          phone: response.data.user.phone,
          email: response.data.user.email,
          walletAmount: response.data.user.walletAmount,
          refCode: response.data.user.refCode,
          status: response.data.user.status,
          userType: 'Customer',
        });

        if (response.data.isNewUser) {
          showToast('Welcome to HelloLocal! Your account has been created.', 'success');
        } else {
          showToast('Welcome back! Signed in successfully.', 'success');
        }

        // Return customer back to their intended destination (e.g. /checkout or /)
        navigate(fromPath, { replace: true });
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Invalid verification code. Please try again.';
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 relative">
      {/* Back Button */}
      <button
        type="button"
        onClick={() => {
          if (showOTP) {
            setShowOTP(false);
            setError('');
          } else {
            navigate(-1);
          }
        }}
        className="absolute top-4 left-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-2xs border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all min-h-[44px] min-w-[44px]"
        aria-label="Go back"
      >
        <ArrowLeftIcon size={18} />
      </button>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative z-10 p-6 sm:p-8">
        {/* Header & Animation */}
        <div className="flex flex-col items-center text-center">
          <div className="w-40 h-36 sm:w-48 sm:h-44 mb-1">
            <Lottie animationData={groceryAnimation} loop={true} />
          </div>

          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-2xl font-black tracking-tight text-[#FF8A00]">Hello</span>
            <span className="text-2xl font-black tracking-tight text-[#FF2E7A]">Local</span>
          </div>

          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mb-1">
            {showOTP ? 'Enter Verification Code' : "India's Hyperlocal Marketplace"}
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed mb-5 px-2">
            {showOTP
              ? `We sent a 4-digit verification code to +91 ${mobileNumber}`
              : 'Fresh groceries & daily needs delivered to your doorstep in 15 minutes.'}
          </p>
        </div>

        {/* Input Section */}
        {!showOTP ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mobile Number
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                  +91
                </span>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={handleMobileChange}
                  className={`w-full pl-12 pr-3.5 py-3 bg-slate-50 border rounded-2xl text-base sm:text-sm font-bold text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:ring-4 focus:ring-[#FF2E7A]/15 focus:border-[#FF2E7A] transition-all min-h-[44px] ${
                    mobileError ? 'border-rose-500' : 'border-slate-200'
                  }`}
                  placeholder="Enter 10-digit number"
                  maxLength={10}
                  disabled={loading}
                />
              </div>
              {mobileError && (
                <p className="text-[11px] text-rose-500 mt-1 font-bold">{mobileError}</p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-[#FFF1F4] border border-[#FFE4EA] rounded-2xl text-xs text-[#FF2E7A] font-bold text-center">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleContinue}
              disabled={mobileNumber.length !== 10 || !!mobileError || loading}
              className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-xs transition-all flex items-center justify-center gap-1.5 min-h-[44px] active:scale-[0.99] ${
                mobileNumber.length === 10 && !mobileError && !loading
                  ? 'bg-[#FF2E7A] text-white hover:bg-[#E02269] shadow-md shadow-[#FF2E7A]/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending Code...</span>
                </div>
              ) : (
                'Continue ▸'
              )}
            </button>

            <p className="text-[11px] text-slate-400 text-center pt-1 font-medium">
              By continuing, you agree to our{' '}
              <button
                type="button"
                onClick={() => navigate('/about-us')}
                className="text-[#FF2E7A] font-bold hover:underline"
              >
                Terms
              </button>{' '}
              &{' '}
              <button
                type="button"
                onClick={() => navigate('/about-us')}
                className="text-[#FF2E7A] font-bold hover:underline"
              >
                Privacy Policy
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center py-2">
              <OTPInput onComplete={handleOTPComplete} disabled={loading} length={4} />
            </div>

            {error && (
              <div className="text-center text-xs text-[#FF2E7A] bg-[#FFF1F4] border border-[#FFE4EA] p-3 rounded-2xl font-bold">
                {error}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOTP(false);
                  setError('');
                }}
                disabled={loading}
                className="flex-1 py-3 px-3 rounded-2xl font-bold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors min-h-[44px] flex items-center justify-center active:scale-98"
              >
                Change Number
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={loading || resendTimer > 0}
                className={`flex-1 py-3 px-3 rounded-2xl font-bold text-xs transition-colors min-h-[44px] flex items-center justify-center active:scale-98 ${
                  resendTimer > 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'text-[#FF2E7A] bg-[#FFF1F4] border border-[#FFE4EA] hover:bg-[#FFE4EA]'
                }`}
              >
                {loading
                  ? 'Sending...'
                  : resendTimer > 0
                  ? `Resend in ${resendTimer}s`
                  : 'Resend Code'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-5">
        Protected by Hello Local Security
      </p>
    </div>
  );
}

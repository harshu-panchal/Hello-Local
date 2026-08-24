import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../../services/api/auth/sellerAuthService';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { normalizeMobile } from '../../../utils/phone';
import LegalPolicyModal, { PolicyTab } from '../../../components/LegalPolicyModal';
import { SellerButton } from '../components/common/SellerButton';
import { SellerInput } from '../components/common/SellerInput';

export default function SellerLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [mobileNumber, setMobileNumber] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [policyTab, setPolicyTab] = useState<PolicyTab | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  const RESEND_SECONDS = 30;

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => (t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(id);
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

  const handleMobileLogin = async () => {
    const err = validateMobile(mobileNumber);
    if (err) {
      setMobileError(err);
      showToast(err, 'error');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await sendOTP(mobileNumber);
      if (response.success) {
        setShowOTP(true);
        setResendTimer(RESEND_SECONDS);
        setError('');
        showToast('One-time password sent successfully!', 'success');
      } else {
        const msg = response.message || 'Failed to send OTP. Please try again.';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await verifyOTP(mobileNumber, otp);
      if (response.success && response.data) {
        showToast('Login successful! Welcome back.', 'success');
        login(response.data.token, {
          id: response.data.user.id,
          name: response.data.user.sellerName,
          email: response.data.user.email,
          phone: response.data.user.mobile,
          userType: 'Seller',
          storeName: response.data.user.storeName,
          status: response.data.user.status,
          address: response.data.user.address,
          city: response.data.user.city,
        });
        navigate('/seller', { replace: true });
      } else {
        const msg = response.message || 'Login failed. Please try again.';
        setError(msg);
        showToast(msg, 'error');
        setLoading(false);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid OTP. Please try again.';
      setError(msg);
      showToast(msg, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Brand Nav */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2D1B69] to-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md">
            HL
          </div>
          <span className="text-base font-black text-slate-900 tracking-tight">
            Hello<span className="text-purple-600">Local</span> Partner
          </span>
        </Link>
      </div>

      {/* Main Auth Card */}
      <div className="max-w-md w-full mx-auto my-auto bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 space-y-6">
        {/* Header */}
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {showOTP ? 'Verify Security OTP' : 'Seller Partner Portal'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            {showOTP
              ? `Enter the 4-digit code sent to +91 ${mobileNumber}`
              : 'Log in to manage orders, catalog & in-store billing'}
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold text-center">
            {error}
          </div>
        )}

        {!showOTP ? (
          /* STEP 1: MOBILE ENTRY */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">Mobile Number</label>
              <SellerInput
                type="tel"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder="Enter 10-digit number"
                maxLength={10}
                error={mobileError}
                prefixIcon={<span className="text-xs font-bold text-slate-400">+91</span>}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && mobileNumber.length === 10 && !mobileError) {
                    handleMobileLogin();
                  }
                }}
              />
            </div>

            <SellerButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleMobileLogin}
              disabled={loading || mobileNumber.length !== 10 || !!mobileError}
              isLoading={loading}
              className="min-h-[44px]"
            >
              Send One-Time Password
            </SellerButton>

            <div className="text-center pt-2">
              <p className="text-xs text-slate-500 font-medium">
                Want to sell on HelloLocal?{' '}
                <Link to="/seller/signup" className="text-purple-600 font-bold hover:underline">
                  Register Your Shop
                </Link>
              </p>
            </div>
          </div>
        ) : (
          /* STEP 2: OTP VERIFICATION (4 Digits) */
          <div className="space-y-6">
            <div className="flex justify-center py-2">
              <OTPInput length={4} onComplete={handleOTPComplete} disabled={loading} />
            </div>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOTP(false);
                  setError('');
                }}
                className="text-slate-500 font-bold hover:text-slate-800 min-h-[44px] flex items-center"
              >
                ← Change Number
              </button>

              <button
                type="button"
                onClick={handleMobileLogin}
                disabled={resendTimer > 0 || loading}
                className="text-purple-600 font-bold hover:text-purple-800 disabled:text-slate-400 min-h-[44px] flex items-center"
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer & Policies */}
      <div className="max-w-md w-full mx-auto text-center space-y-2 text-[11px] text-slate-400 font-medium">
        <p>
          By proceeding, you agree to our{' '}
          <button onClick={() => setPolicyTab('terms')} className="text-slate-600 font-bold hover:underline">
            Terms of Service
          </button>{' '}
          &{' '}
          <button onClick={() => setPolicyTab('privacy')} className="text-slate-600 font-bold hover:underline">
            Privacy Policy
          </button>
        </p>
      </div>

      {/* Legal Policy Modal */}
      {policyTab && (
        <LegalPolicyModal
          initialTab={policyTab}
          open={Boolean(policyTab)}
          onClose={() => setPolicyTab(null)}
        />
      )}
    </div>
  );
}

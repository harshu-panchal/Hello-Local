import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../../services/api/auth/sellerAuthService';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';
import { normalizeMobile } from '../../../utils/phone';
import LegalPolicyModal, { PolicyTab } from '../../../components/LegalPolicyModal';

export default function SellerLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mobileNumber, setMobileNumber] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [policyTab, setPolicyTab] = useState<PolicyTab | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  const RESEND_SECONDS = 30;

  // Countdown for the "Resend OTP" button
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => (t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const handleMobileLogin = async () => {
    if (mobileNumber.length !== 10) return;

    setLoading(true);
    setError('');

    try {
      const response = await sendOTP(mobileNumber);
      if (response.success) {
        // Only show OTP screen on success
        setShowOTP(true);
        setResendTimer(RESEND_SECONDS); // start resend cooldown
        setError(''); // Clear any previous errors
      } else {
        // If not successful, show error and stay on page
        setError(response.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err: any) {
      // On error, show error message and stay on the same page
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
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
        // Update auth context with seller data
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
        // Navigate to seller dashboard only on success
        navigate('/seller', { replace: true });
      } else {
        // If response is not successful, show error and stay on page
        setError(response.message || 'Login failed. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      // On error, show error message and stay on the same page
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
      setLoading(false);
    }
  };

  const handleHelloLocalLogin = () => {
    // Handle Hello Local login logic here
    navigate('/seller');
  };

  const handleAdminLogin = () => {
    // Navigate to admin login page
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-50 flex flex-col items-center px-4 py-8">
      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div className="px-6 py-4 text-center border-b border-pink-700" style={{ backgroundColor: '#db2777' }}>
          <div className="mb-4">
            <img
              src="/logo.png?v=4"
              alt="Hello Local"
              className="h-20 w-auto mx-auto object-contain drop-shadow-md bg-white/20 p-2 rounded-xl"
            />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Seller Login</h1>
          <p className="text-pink-50 text-sm -mt-2">Access your seller dashboard</p>
        </div>

        {/* Login Form */}
        <div className="p-6 space-y-4">
          {!showOTP ? (
            /* Mobile Login Form */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Mobile Number
                </label>
                <div className="flex items-center bg-white border border-neutral-300 rounded-lg overflow-hidden focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-200 transition-all">
                  <div className="px-3 py-2.5 text-sm font-medium text-neutral-600 border-r border-neutral-300 bg-neutral-50">
                    +91
                  </div>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(normalizeMobile(e.target.value))}
                    placeholder="Enter mobile number"
                    className="flex-1 px-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none"
                    // Allow the country code (e.g. "91...") to be entered/pasted so
                    // normalizeMobile can strip it; it still normalizes to 10 digits.
                    maxLength={13}
                    disabled={loading}
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  {error}
                </div>
              )}

              <button
                onClick={handleMobileLogin}
                disabled={mobileNumber.length !== 10 || loading}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${mobileNumber.length === 10 && !loading
                  ? 'bg-pink-600 text-white hover:bg-pink-700 shadow-md'
                  : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                  }`}
              >
                {loading ? 'Sending...' : 'Continue'}
              </button>
            </div>
          ) : (
            /* OTP Verification Form */
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-neutral-600 mb-2">
                  Enter the 4-digit OTP sent to
                </p>
                <p className="text-sm font-semibold text-neutral-800">+91 {mobileNumber}</p>
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
                    setError('');
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors border border-neutral-300"
                >
                  Change Number
                </button>
                <button
                  onClick={async () => {
                    if (resendTimer > 0) return;
                    setLoading(true);
                    setError('');
                    try {
                      const response = await sendOTP(mobileNumber);
                      if (response.success) {
                        // OTP resent successfully, restart cooldown and clear errors
                        setResendTimer(RESEND_SECONDS);
                        setError('');
                      } else {
                        // Show error but stay on page
                        setError(response.message || 'Failed to resend OTP. Please try again.');
                      }
                    } catch (err: any) {
                      // Show error but stay on page
                      setError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || resendTimer > 0}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-pink-600 text-white hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}





          {/* Sign Up Link */}
          <div className="text-center pt-4 border-t border-neutral-200">
            <p className="text-sm text-neutral-600">
              Don't have a seller account?{' '}
              <button
                onClick={() => navigate('/seller/signup')}
                className="text-pink-600 hover:text-pink-700 font-semibold"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Footer Text — hidden on the OTP step (#otp-page-no-policy) */}
      {!showOTP && (
        <p className="mt-6 text-xs text-neutral-500 text-center max-w-md">
          By continuing, you agree to Hello Local's{' '}
          <button
            type="button"
            onClick={() => setPolicyTab('terms')}
            className="text-pink-600 hover:text-pink-700 font-semibold underline"
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={() => setPolicyTab('privacy')}
            className="text-pink-600 hover:text-pink-700 font-semibold underline"
          >
            Privacy Policy
          </button>
        </p>
      )}

      <LegalPolicyModal
        open={policyTab !== null}
        initialTab={policyTab ?? 'terms'}
        onClose={() => setPolicyTab(null)}
      />
    </div>
  );
}




import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../../services/api/auth/deliveryAuthService';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';
import { normalizeMobile } from '../../../utils/phone';
import { useToast } from '../../../context/ToastContext';

export default function DeliveryLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [mobileNumber, setMobileNumber] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [isNotRegistered, setIsNotRegistered] = useState(false);

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
    setIsNotRegistered(false);

    try {
      const response = await sendOTP(mobileNumber);
      if (response.success && response.sessionId) {
        setSessionId(response.sessionId);
        setShowOTP(true);
        showToast('4-digit OTP sent to your mobile', 'success');
      } else {
        const msg = response.message || 'Failed to initiate OTP';
        setError(msg);
        showToast(msg, 'error');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Failed to send OTP. Please try again.';

      setError(message);
      showToast(message, 'error');

      if (status === 400 && (message.toLowerCase().includes('not found') || message.toLowerCase().includes('register'))) {
        setIsNotRegistered(true);
      }
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
          ...response.data.user,
          userType: 'Delivery'
        });
        showToast('Login successful! Welcome back', 'success');
        navigate('/delivery');
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'Invalid OTP. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 flex flex-col items-center px-4 py-8">
      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div className="px-6 py-5 text-center border-b border-rose-700 bg-rose-600">
          <div className="mb-3">
            <img
              src="/logo.png?v=4"
              alt="Hello Local"
              className="h-16 w-auto mx-auto object-contain drop-shadow-md bg-white/20 p-2 rounded-2xl"
            />
          </div>
          <h1 className="text-xl font-black text-white">Delivery Partner Login</h1>
          <p className="text-rose-100 text-xs mt-0.5">Access your courier dashboard & orders</p>
        </div>

        {/* Login Form */}
        <div className="p-6 space-y-4">
          {!showOTP ? (
            /* Mobile Login Form */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mobile Number
                </label>
                <div className="flex items-center bg-white border border-slate-300 rounded-2xl overflow-hidden focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-200 transition-all min-h-[44px]">
                  <div className="px-3.5 py-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 bg-slate-50">
                    +91
                  </div>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={handleMobileChange}
                    placeholder="Enter 10-digit mobile number"
                    className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none"
                    maxLength={10}
                    disabled={loading}
                  />
                </div>
              </div>

              {mobileError && (
                <p className="text-xs text-rose-600 font-semibold">{mobileError}</p>
              )}

              {error && (
                <div className="text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-200 flex flex-col gap-2 font-medium">
                  <span>{error}</span>
                  {isNotRegistered && (
                    <button
                      onClick={() => navigate('/delivery/signup')}
                      className="text-xs font-black text-white bg-rose-600 hover:bg-rose-700 py-1.5 px-3 rounded-xl self-start transition-colors"
                    >
                      Register Now
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleMobileLogin}
                disabled={mobileNumber.length !== 10 || !!mobileError || loading}
                className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm transition-all min-h-[44px] ${
                  mobileNumber.length === 10 && !mobileError && !loading
                    ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-md active:scale-[0.98]'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                {loading ? 'Sending OTP...' : 'Continue with OTP'}
              </button>
            </div>
          ) : (
            /* OTP Verification Form */
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-xs text-slate-600 mb-1 font-medium">
                  Enter the 4-digit SMS OTP sent to
                </p>
                <p className="text-sm font-black text-slate-900">+91 {mobileNumber}</p>
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
                    setError('');
                  }}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl font-bold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200 min-h-[44px]"
                >
                  Change Number
                </button>
                <button
                  onClick={handleMobileLogin}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl font-black text-xs bg-rose-600 text-white hover:bg-rose-700 transition-all min-h-[44px]"
                >
                  {loading ? 'Verifying...' : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}

          {/* Sign Up Link */}
          <div className="text-center pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-600 font-medium">
              Don't have a delivery partner account?{' '}
              <button
                onClick={() => navigate('/delivery/signup')}
                className="text-rose-600 hover:underline font-black"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Footer Text */}
      {!showOTP && (
        <p className="mt-6 text-[11px] text-slate-500 text-center max-w-md">
          By continuing, you agree to Hello Local's{' '}
          <button type="button" onClick={() => navigate('/delivery/about')} className="text-rose-600 hover:underline font-semibold">Terms of Service</button>
          {' '}and{' '}
          <button type="button" onClick={() => navigate('/delivery/about')} className="text-rose-600 hover:underline font-semibold">Privacy Policy</button>
        </p>
      )}
    </div>
  );
}

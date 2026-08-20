import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSellerProfile } from '../../../services/api/auth/sellerAuthService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerCard } from '../components/common/SellerCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';

export default function SellerProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getSellerProfile();
        if (active) {
          if (res?.success && res.data) setProfile(res.data);
          else setError(res?.message || 'Failed to load profile');
        }
      } catch (err: any) {
        if (active) setError(err.response?.data?.message || err.message || 'Failed to load profile');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const maskAccount = (acc?: string) =>
    acc && acc.length > 4 ? `••••••••${acc.slice(-4)}` : acc || '—';

  const InfoRow = ({ label, value }: { label: string; value?: any }) => (
    <div className="flex flex-col sm:flex-row sm:items-center py-2.5 border-b border-slate-100 last:border-0 gap-1 sm:gap-4">
      <span className="w-full sm:w-48 text-xs font-bold text-slate-500">{label}</span>
      <span className="text-xs sm:text-sm font-semibold text-slate-900 break-words">{value || '—'}</span>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <SellerPageHeader
        title="Seller Store Profile"
        subtitle="Manage your business information, public store profile, and payout details."
        breadcrumbs={[{ label: "Profile" }]}
        action={
          <SellerButton
            variant="primary"
            size="md"
            onClick={() => navigate('/seller/account-settings')}
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            }
          >
            Edit Settings
          </SellerButton>
        }
      />

      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-28 bg-slate-200 rounded-3xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-64 bg-slate-200 rounded-3xl" />
            <div className="h-64 bg-slate-200 rounded-3xl" />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs sm:text-sm font-bold">
          {error}
        </div>
      )}

      {!loading && !error && profile && (
        <div className="space-y-6">
          {/* Identity Summary Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#2D1B69] via-purple-700 to-indigo-600 text-white text-2xl font-black flex items-center justify-center flex-shrink-0 shadow-sm border border-purple-300/30">
                {(profile.storeName || profile.sellerName || 'S').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 truncate">
                    {profile.storeName || profile.sellerName}
                  </h2>
                  <SellerStatusBadge status={profile.status || 'Approved'} size="sm" />
                </div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{profile.email}</p>
                <p className="text-xs text-purple-700 font-bold mt-0.5">📞 {profile.mobile || '—'}</p>
              </div>
            </div>

            <SellerButton
              variant="outline"
              size="md"
              onClick={() => navigate('/seller/account-settings')}
              className="w-full sm:w-auto"
            >
              Account Settings
            </SellerButton>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Store Information */}
            <SellerCard title="Store Details">
              <div className="space-y-0.5">
                <InfoRow label="Store Name" value={profile.storeName} />
                <InfoRow label="Seller / Owner Name" value={profile.sellerName} />
                <InfoRow label="Business Email" value={profile.email} />
                <InfoRow label="Registered Mobile" value={profile.mobile} />
                <InfoRow label="Product Categories" value={Array.isArray(profile.categories) ? profile.categories.join(', ') : profile.category} />
                <InfoRow label="Full Address" value={profile.address} />
                <InfoRow label="City & State" value={`${profile.city || ''} ${profile.state || ''}`.trim()} />
                <InfoRow label="Pincode" value={profile.pincode} />
              </div>
            </SellerCard>

            {/* Bank & Tax Information */}
            <div className="space-y-6">
              <SellerCard title="Bank & Payout Information">
                <div className="space-y-0.5">
                  <InfoRow label="Bank Name" value={profile.bankName} />
                  <InfoRow label="Account Holder" value={profile.accountHolderName} />
                  <InfoRow label="Account Number" value={maskAccount(profile.accountNumber)} />
                  <InfoRow label="IFSC Code" value={profile.ifsc} />
                </div>
              </SellerCard>

              <SellerCard title="Tax & Business Compliance">
                <div className="space-y-0.5">
                  <InfoRow label="GSTIN Number" value={profile.gstin} />
                  <InfoRow label="PAN Number" value={profile.panNumber} />
                  <InfoRow label="FSSAI License" value={profile.fssaiLicNo} />
                </div>
              </SellerCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSellerProfile } from '../../../services/api/auth/sellerAuthService';

export default function SellerProfile() {
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

  const statusBadge = (status?: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const maskAccount = (acc?: string) =>
    acc && acc.length > 4 ? `••••••${acc.slice(-4)}` : acc || '—';

  const Row = ({ label, value }: { label: string; value?: any }) => (
    <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-neutral-100 last:border-0">
      <span className="w-full sm:w-56 text-sm font-medium text-neutral-500">{label}</span>
      <span className="text-sm text-neutral-900 break-words">{value || '—'}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-neutral-800">My Profile</h1>
        <div className="text-sm">
          <Link to="/seller" className="text-blue-600 hover:underline">Home</Link>
          <span className="text-neutral-400"> / </span>
          <span className="text-neutral-600">Profile</span>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      {!loading && !error && profile && (
        <div className="space-y-6">
          {/* Summary card */}
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-pink-600 text-white text-2xl font-bold flex-shrink-0">
              {(profile.storeName || profile.sellerName || 'S').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-neutral-900 truncate">{profile.storeName || profile.sellerName}</h2>
              <p className="text-sm text-neutral-500 truncate">{profile.email}</p>
              <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(profile.status)}`}>
                {profile.status || 'Pending'}
              </span>
            </div>
            <Link
              to="/seller/account-settings"
              className="ml-auto px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              Edit Profile
            </Link>
          </div>

          {/* Store details */}
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
            <div className="bg-neutral-50 px-6 py-3 border-b border-neutral-100 font-medium text-neutral-700">Store Information</div>
            <div className="px-6 py-2">
              <Row label="Store Name" value={profile.storeName} />
              <Row label="Seller Name" value={profile.sellerName} />
              <Row label="Email" value={profile.email} />
              <Row label="Mobile" value={profile.mobile} />
              <Row label="Categories" value={Array.isArray(profile.categories) ? profile.categories.join(', ') : profile.category} />
              <Row label="Address" value={profile.address} />
              <Row label="City" value={profile.city} />
              <Row label="Service Radius" value={profile.serviceRadiusKm ? `${profile.serviceRadiusKm} km` : undefined} />
            </div>
          </div>

          {/* Bank details */}
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
            <div className="bg-neutral-50 px-6 py-3 border-b border-neutral-100 font-medium text-neutral-700">Bank Details</div>
            <div className="px-6 py-2">
              <Row label="Account Holder" value={profile.accountName} />
              <Row label="Bank Name" value={profile.bankName} />
              <Row label="Account Number" value={maskAccount(profile.accountNumber)} />
              <Row label="IFSC" value={profile.ifsc} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

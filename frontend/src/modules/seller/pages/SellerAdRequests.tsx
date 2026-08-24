import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useToast } from '../../../context/ToastContext';
import { uploadImage } from '../../../services/api/uploadService';
import {
  createSellerAdRequest,
  getMyAdRequests,
  submitPaymentProof,
  cancelAdRequest,
  getAdAvailability,
} from '../../../services/api/sellerAdRequestService';
import { exportToCsv } from '../../../utils/exportCsv';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerCard } from '../components/common/SellerCard';
import { SellerStatCard } from '../components/common/SellerStatCard';
import { SellerButton } from '../components/common/SellerButton';
import { SellerModal } from '../components/common/SellerModal';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerFormField } from '../components/common/SellerFormField';

type AdRequest = {
  _id: string;
  shopName: string;
  tagline: string;
  description?: string;
  imageUrl: string;
  badge?: string;
  badgeColor?: string;
  ctaText?: string;
  ctaLink?: string;
  durationDays: number;
  adPrice: number;
  requestedPrice?: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'PaymentPending' | 'PaymentVerified' | 'Live' | 'Expired';
  paymentStatus: 'Unpaid' | 'Paid' | 'Refunded';
  paymentMethod?: string;
  paymentReference?: string;
  paymentScreenshotUrl?: string;
  adminNote?: string;
  expiresAt?: string;
  startDate?: string;
  createdAt: string;
};

type FormState = {
  shopName: string;
  tagline: string;
  description: string;
  imageUrl: string;
  badge: string;
  badgeColor: string;
  ctaText: string;
  ctaLink: string;
  durationDays: number;
  requestedPrice: string;
  paymentNote: string;
  payNow: boolean;
  paymentMethod: string;
  paymentReference: string;
  paymentScreenshotUrl: string;
  startDate: string;
};

const DURATIONS = [1, 2, 3, 5, 7, 10, 15, 30];
const getPriceForDuration = (days: number) => days * 500;

export default function SellerAdRequests() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [adRequests, setAdRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [availability, setAvailability] = useState<{
    activeAds: number;
    maxAds: number;
    slotsAvailable: number;
    slotsAvailableInRange?: number;
    dailyStats?: Array<{
      date: string;
      slotsAvailable: number;
    }>;
    selectedDate?: string;
    duration?: number;
  } | null>(null);
  const [paymentUploading, setPaymentUploading] = useState(false);

  // 300ms Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [form, setForm] = useState<FormState>({
    shopName: '',
    tagline: '',
    description: '',
    imageUrl: '',
    badge: 'FEATURED',
    badgeColor: '#FF4B6E',
    ctaText: 'Visit Shop',
    ctaLink: '',
    durationDays: 7,
    requestedPrice: '3500',
    paymentNote: '',
    payNow: false,
    paymentMethod: 'UPI',
    paymentReference: '',
    paymentScreenshotUrl: '',
    startDate: new Date().toISOString().split('T')[0],
  });

  const [proofForm, setProofForm] = useState<{
    adId: string | null;
    paymentMethod: string;
    paymentReference: string;
    paymentScreenshotUrl: string;
    paymentNote: string;
  }>({
    adId: null,
    paymentMethod: 'UPI',
    paymentReference: '',
    paymentScreenshotUrl: '',
    paymentNote: '',
  });

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const [adsRes, availRes] = await Promise.all([
        getMyAdRequests(),
        getAdAvailability(form.startDate, form.durationDays),
      ]);
      if (adsRes.success) setAdRequests(adsRes.data);
      if (availRes.success) setAvailability(availRes.data);

      if (isManualRefresh) {
        showToast('Advertisements & slot capacity refreshed', 'success');
      }
    } catch {
      showToast('Failed to load advertisements data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [form.startDate, form.durationDays, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isPaymentProof = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be less than 5MB', 'error');
      return;
    }

    try {
      if (isPaymentProof) {
        setPaymentUploading(true);
      } else {
        setUploadingImage(true);
      }
      const res = await uploadImage(file, 'hellolocal/shop-ads');
      if (res.secureUrl) {
        if (isPaymentProof) {
          setProofForm((prev) => ({ ...prev, paymentScreenshotUrl: res.secureUrl }));
        } else {
          setForm((prev) => ({ ...prev, imageUrl: res.secureUrl }));
        }
        showToast('Image uploaded successfully', 'success');
      }
    } catch {
      showToast('Failed to upload image', 'error');
    } finally {
      setUploadingImage(false);
      setPaymentUploading(false);
    }
  };

  const handleSubmitAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shopName.trim() || !form.tagline.trim() || !form.imageUrl) {
      showToast('Please fill in Store Name, Tagline and Banner Image', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        shopName: form.shopName,
        tagline: form.tagline,
        description: form.description || undefined,
        imageUrl: form.imageUrl,
        badge: form.badge || undefined,
        badgeColor: form.badgeColor || undefined,
        ctaText: form.ctaText || undefined,
        ctaLink: form.ctaLink || undefined,
        durationDays: form.durationDays,
        requestedPrice: parseFloat(form.requestedPrice) || getPriceForDuration(form.durationDays),
        startDate: form.startDate || undefined,
        paymentMethod: form.payNow ? form.paymentMethod : undefined,
        paymentReference: form.payNow ? form.paymentReference : undefined,
        paymentScreenshotUrl: form.payNow ? form.paymentScreenshotUrl : undefined,
        paymentNote: form.payNow ? form.paymentNote : undefined,
      };

      const res = await createSellerAdRequest(payload as any);
      if (res.success) {
        showToast('Ad request submitted successfully!', 'success');
        setShowForm(false);
        fetchData();
      } else {
        showToast(res.message || 'Failed to submit ad request', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Error submitting ad request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAd = async (adId: string) => {
    try {
      const res = await cancelAdRequest(adId);
      if (res.success) {
        showToast('Ad request cancelled successfully', 'success');
        setShowCancelConfirm(null);
        fetchData();
      }
    } catch {
      showToast('Failed to cancel ad request', 'error');
    }
  };

  const handleProofSubmit = async () => {
    if (!proofForm.adId) return;
    try {
      const res = await submitPaymentProof(proofForm.adId, {
        paymentMethod: proofForm.paymentMethod,
        paymentReference: proofForm.paymentReference,
        paymentScreenshotUrl: proofForm.paymentScreenshotUrl,
        paymentNote: proofForm.paymentNote,
      });
      if (res.success) {
        showToast('Payment proof submitted successfully!', 'success');
        setProofForm({
          adId: null,
          paymentMethod: 'UPI',
          paymentReference: '',
          paymentScreenshotUrl: '',
          paymentNote: '',
        });
        fetchData();
      }
    } catch {
      showToast('Failed to submit payment proof', 'error');
    }
  };

  // Filtered Ad Campaigns
  const filteredAds = useMemo(() => {
    return adRequests.filter((ad) => {
      const matchesSearch =
        !debouncedSearch.trim() ||
        ad.shopName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        ad.tagline?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesStatus = statusFilter === 'All' || ad.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [adRequests, debouncedSearch, statusFilter]);

  const handleExport = () => {
    if (filteredAds.length === 0) {
      showToast('No advertising records to export', 'info');
      return;
    }

    exportToCsv(
      ['Shop Name', 'Tagline', 'Duration (Days)', 'Cost (₹)', 'Status', 'Payment Status', 'Start Date', 'Expiry Date', 'Created Date'],
      filteredAds.map((ad) => [
        ad.shopName,
        ad.tagline,
        ad.durationDays,
        ad.adPrice || ad.requestedPrice || 0,
        ad.status,
        ad.paymentStatus,
        ad.startDate ? new Date(ad.startDate).toLocaleDateString('en-IN') : '—',
        ad.expiresAt ? new Date(ad.expiresAt).toLocaleDateString('en-IN') : '—',
        new Date(ad.createdAt).toLocaleDateString('en-IN'),
      ]),
      'seller_ad_campaigns'
    );
    showToast('Ad campaigns exported successfully!', 'success');
  };

  const liveAdsCount = adRequests.filter((a) => a.status === 'Live').length;
  const pendingAdsCount = adRequests.filter((a) => a.status === 'Pending' || a.status === 'PaymentPending').length;

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Header */}
      <SellerPageHeader
        title="Promotions & Store Ads"
        subtitle="Boost local store visits with featured homepage billboard ad banners."
        breadcrumbs={[{ label: "Ad Requests" }]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => fetchData(true)}
              isLoading={refreshing}
              className="min-h-[44px]"
              icon={<span>🔄</span>}
            >
              Refresh
            </SellerButton>
            <SellerButton
              variant="outline"
              size="md"
              onClick={handleExport}
              disabled={adRequests.length === 0}
              className="min-h-[44px]"
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              }
            >
              Export CSV
            </SellerButton>
            <SellerButton
              variant="primary"
              size="md"
              onClick={() => setShowForm(!showForm)}
              className="min-h-[44px]"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              }
            >
              {showForm ? 'View My Ads' : '+ Create New Banner'}
            </SellerButton>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <SellerStatCard
          label="Available Slots"
          value={availability ? `${availability.slotsAvailable}/${availability.maxAds}` : '—'}
          variant="purple"
        />
        <SellerStatCard
          label="Active Live Ads"
          value={liveAdsCount}
          variant="emerald"
        />
        <SellerStatCard
          label="Under Review"
          value={pendingAdsCount}
          variant="default"
        />
        <SellerStatCard
          label="Total Campaigns"
          value={adRequests.length}
          variant="default"
        />
      </div>

      {/* CREATE AD FORM */}
      {showForm ? (
        <form onSubmit={handleSubmitAd} className="space-y-6 animate-in fade-in">
          <SellerCard title="Create Advertisement Banner" description="Configure your promotional banner and choose duration.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SellerFormField label="Store Display Name" required>
                <input
                  type="text"
                  value={form.shopName}
                  onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                  placeholder="e.g., Sharma Fresh Mart"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                />
              </SellerFormField>

              <SellerFormField label="Banner Tagline" required>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  placeholder="e.g., Flat 20% Off On All Fresh Fruits Today!"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                />
              </SellerFormField>

              <div className="md:col-span-2">
                <SellerFormField label="Banner Graphic (JPG, PNG, WebP)" required>
                  <div className="border-2 border-dashed border-slate-300 hover:border-purple-500 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-50 relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, false)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {form.imageUrl ? (
                      <div className="flex flex-col items-center space-y-2">
                        <img
                          src={form.imageUrl}
                          alt="Banner Preview"
                          className="h-32 w-full max-w-md object-cover rounded-xl border border-slate-200"
                        />
                        <span className="text-xs text-purple-700 font-bold">Tap to replace banner image</span>
                      </div>
                    ) : (
                      <div className="py-4 space-y-1">
                        <span className="text-3xl">🖼️</span>
                        <p className="text-xs font-bold text-slate-800">Upload Banner Image</p>
                        <p className="text-[11px] text-slate-400">Recommended size: 1200 × 400 pixels</p>
                      </div>
                    )}
                  </div>
                </SellerFormField>
              </div>

              <div>
                <SellerFormField label="Duration (Days)">
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            durationDays: d,
                            requestedPrice: getPriceForDuration(d).toString(),
                          })
                        }
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] ${
                          form.durationDays === d
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {d} Days (₹{getPriceForDuration(d)})
                      </button>
                    ))}
                  </div>
                </SellerFormField>
              </div>

              <div>
                <SellerFormField label="Start Date">
                  <input
                    type="date"
                    value={form.startDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
                  />
                </SellerFormField>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-200">
              <SellerButton
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setShowForm(false)}
                className="min-h-[44px]"
              >
                Cancel
              </SellerButton>
              <SellerButton
                type="submit"
                variant="primary"
                size="lg"
                disabled={submitting || uploadingImage}
                isLoading={submitting}
                className="min-h-[44px]"
              >
                Submit Ad Request (₹{form.requestedPrice})
              </SellerButton>
            </div>
          </SellerCard>
        </form>
      ) : (
        /* AD REQUESTS LIST */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[44px]"
              >
                <option value="All">All Statuses</option>
                <option value="Live">Live</option>
                <option value="Pending">Pending Review</option>
                <option value="Approved">Approved / Ready to Pay</option>
                <option value="PaymentPending">Payment Under Verification</option>
                <option value="Expired">Expired</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div className="relative min-w-[240px] flex-1 max-w-md">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search shop name or tagline..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold p-1 min-h-[32px] min-w-[32px]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
              <div className="h-44 bg-slate-200 rounded-2xl" />
              <div className="h-44 bg-slate-200 rounded-2xl" />
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center max-w-lg mx-auto space-y-3">
              <span className="text-4xl">📢</span>
              <h3 className="text-base font-bold text-slate-900">No banner ads found</h3>
              <p className="text-xs sm:text-sm text-slate-500">
                Promote your shop to thousands of nearby buyers by requesting a featured billboard banner.
              </p>
              <SellerButton
                variant="primary"
                size="md"
                onClick={() => setShowForm(true)}
                className="min-h-[44px]"
              >
                + Create First Banner
              </SellerButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAds.map((ad) => (
                <div
                  key={ad._id}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">{ad.shopName}</span>
                      <SellerStatusBadge status={ad.status} size="sm" />
                    </div>

                    <div className="h-28 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 relative">
                      <img src={ad.imageUrl} alt={ad.shopName} className="w-full h-full object-cover" />
                    </div>

                    <div>
                      <p className="font-bold text-xs sm:text-sm text-slate-900 leading-tight">{ad.tagline}</p>
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 mt-2 border-t border-slate-100">
                        <span>Duration: <strong>{ad.durationDays} Days</strong></span>
                        <span>Cost: <strong className="text-purple-700">₹{ad.adPrice || ad.requestedPrice}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    {ad.status === 'Approved' && (
                      <SellerButton
                        variant="primary"
                        size="sm"
                        onClick={() => setProofForm({ ...proofForm, adId: ad._id })}
                        className="min-h-[40px]"
                      >
                        Submit Payment Proof
                      </SellerButton>
                    )}
                    {ad.status === 'Pending' && (
                      <SellerButton
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCancelConfirm(ad._id)}
                        className="min-h-[40px]"
                      >
                        Cancel Request
                      </SellerButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cancel Ad Modal */}
      <SellerModal
        isOpen={Boolean(showCancelConfirm)}
        onClose={() => setShowCancelConfirm(null)}
        title="Cancel Ad Request"
        description="Are you sure you want to cancel this pending advertisement request?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <SellerButton variant="outline" size="md" onClick={() => setShowCancelConfirm(null)} className="min-h-[44px]">
              No, Keep It
            </SellerButton>
            <SellerButton
              variant="danger"
              size="md"
              onClick={() => showCancelConfirm && handleCancelAd(showCancelConfirm)}
              className="min-h-[44px]"
            >
              Yes, Cancel
            </SellerButton>
          </div>
        }
      >
        <p className="text-xs sm:text-sm text-slate-600">
          The slot will be released back to the platform availability pool.
        </p>
      </SellerModal>

      {/* Payment Proof Modal */}
      <SellerModal
        isOpen={Boolean(proofForm.adId)}
        onClose={() => setProofForm({ ...proofForm, adId: null })}
        title="Submit Ad Payment Proof"
        description="Provide transaction details or upload payment screenshot."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <SellerButton variant="outline" size="md" onClick={() => setProofForm({ ...proofForm, adId: null })} className="min-h-[44px]">
              Close
            </SellerButton>
            <SellerButton variant="primary" size="md" onClick={handleProofSubmit} isLoading={paymentUploading} className="min-h-[44px]">
              Confirm Submission
            </SellerButton>
          </div>
        }
      >
        <div className="space-y-3">
          <SellerFormField label="Payment Method">
            <select
              value={proofForm.paymentMethod}
              onChange={(e) => setProofForm({ ...proofForm, paymentMethod: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600 min-h-[44px]"
            >
              <option value="UPI">UPI Transfer</option>
              <option value="Bank Transfer">NEFT / RTGS</option>
              <option value="Razorpay">Online Gateway</option>
            </select>
          </SellerFormField>

          <SellerFormField label="UTR / Reference Number">
            <input
              type="text"
              value={proofForm.paymentReference}
              onChange={(e) => setProofForm({ ...proofForm, paymentReference: e.target.value })}
              placeholder="e.g. UPI Ref / Bank UTR Number"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
            />
          </SellerFormField>

          <SellerFormField label="Payment Screenshot">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, true)}
              className="w-full text-xs text-slate-600 min-h-[44px]"
            />
            {proofForm.paymentScreenshotUrl && (
              <p className="text-[11px] text-emerald-600 font-bold mt-1">✓ Screenshot attached</p>
            )}
          </SellerFormField>
        </div>
      </SellerModal>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';
import { uploadImage } from '../../../services/api/uploadService';
import {
    createSellerAdRequest,
    getMyAdRequests,
    submitPaymentProof,
    cancelAdRequest,
    getAdAvailability,
    type SellerAdRequestPayload,
} from '../../../services/api/sellerAdRequestService';
import { useNavigate } from 'react-router-dom';
import RazorpayCheckout from '../../../components/RazorpayCheckout';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    Pending: { label: 'Under Review', color: '#f59e0b', bg: '#fef3c7', icon: '🕐' },
    Approved: { label: 'Approved - Pay Now', color: '#3b82f6', bg: '#dbeafe', icon: '✅' },
    Rejected: { label: 'Rejected', color: '#ef4444', bg: '#fee2e2', icon: '❌' },
    PaymentPending: { label: 'Payment Under Review', color: '#8b5cf6', bg: '#ede9fe', icon: '💳' },
    PaymentVerified: { label: 'Payment Verified', color: '#10b981', bg: '#d1fae5', icon: '✔️' },
    Live: { label: '🔴 LIVE on Website', color: '#059669', bg: '#d1fae5', icon: '🟢' },
    Scheduled: { label: 'Scheduled for Future', color: '#ec4899', bg: '#fdf2f8', icon: '📅' },
    Expired: { label: 'Expired', color: '#6b7280', bg: '#f3f4f6', icon: '⏰' },
};

export default function SellerAdRequests() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [adRequests, setAdRequests] = useState<AdRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);
    const [availability, setAvailability] = useState<{
        activeAds: number,
        maxAds: number,
        slotsAvailable: number,
        slotsAvailableInRange?: number,
        dailyStats?: Array<{
            date: string;
            slotsAvailable: number;
        }>;
        selectedDate?: string;
        duration?: number;
    } | null>(null);
    const [paymentUploading, setPaymentUploading] = useState(false);
    const [razorpayData, setRazorpayData] = useState<{ id: string, amount: number } | null>(null);
    const [sellerDetails, setSellerDetails] = useState({ name: '', email: '', phone: '' });
    const [isCheckingSlots, setIsCheckingSlots] = useState(false);

    useEffect(() => {
        // Mock seller details for now, or fetch from auth context if available
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        setSellerDetails({
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '9999999999'
        });
    }, []);

    const [form, setForm] = useState<FormState>({
        shopName: '',
        tagline: '',
        description: '',
        imageUrl: '',
        badge: 'FEATURED',
        badgeColor: '#FF4B6E',
        ctaText: 'Visit Shop',
        ctaLink: '',
        durationDays: 1,
        requestedPrice: '500',
        paymentNote: '',
        payNow: true,
        paymentMethod: 'UPI',
        paymentReference: '',
        paymentScreenshotUrl: '',
        startDate: new Date().toISOString().split('T')[0],
    });

    const ensureAbsoluteUrl = (url?: string) => {
        if (!url) return '/';
        const trimmed = url.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) return trimmed;
        return `https://${trimmed}`;
    };

    useEffect(() => {
        fetchRequests();
        fetchAvailability();
    }, []);
    useEffect(() => {
        const requestId = new URLSearchParams(window.location.search).get('requestId');
        if (requestId && adRequests.length > 0) {
            setTimeout(() => {
                const el = document.getElementById(`request-${requestId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-pink-500', 'ring-offset-4');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-pink-500', 'ring-offset-4'), 3000);
                }
            }, 500);
        }
    }, [adRequests]);

    useEffect(() => {
        if (form.startDate) {
            fetchAvailability(form.startDate, form.durationDays);
        }
    }, [form.startDate, form.durationDays]);

    const fetchAvailability = async (date?: string, duration?: number) => {
        setIsCheckingSlots(true);
        try {
            // If duration is not provided, we just want general stats (30 days)
            const res = await getAdAvailability(date, duration);
            if (res.success) setAvailability(res.data);
        } catch (err) {
            console.error('Failed to load availability:', err);
        } finally {
            setIsCheckingSlots(false);
        }
    };

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await getMyAdRequests();
            if (res.success) setAdRequests(res.data);
        } catch {
            showToast('Failed to load ad requests', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const result = await uploadImage(file);
            setForm(f => ({ ...f, imageUrl: result.url }));
            showToast('Image uploaded!', 'success');
        } catch {
            showToast('Image upload failed', 'error');
        } finally {
            setUploadingImage(false);
        }
    };

    const handlePaymentScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPaymentUploading(true);
        try {
            const result = await uploadImage(file);
            setForm(f => ({ ...f, paymentScreenshotUrl: result.url }));
            showToast('Screenshot uploaded!', 'success');
        } catch {
            showToast('Upload failed', 'error');
        } finally {
            setPaymentUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!form.shopName || !form.tagline || !form.imageUrl) {
            showToast('Please fill Shop Name, Tagline, and upload an Image', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const payload: SellerAdRequestPayload = {
                ...form,
                requestedPrice: parseFloat(form.requestedPrice),
                // We no longer send manual payment proof here
                paymentMethod: undefined,
                paymentReference: undefined,
                paymentScreenshotUrl: undefined,
            };
            const res = await createSellerAdRequest(payload);
            if (res.success) {
                if (form.payNow) {
                    // Trigger Razorpay Modal (Now has mock bypass for testing)
                    setRazorpayData({
                        id: res.data._id,
                        amount: parseFloat(form.requestedPrice)
                    });
                } else {
                    showToast('Ad request submitted! Admin will review it.', 'success');
                    setShowForm(false);
                    resetForm();
                    fetchRequests();
                }
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to submit request', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setForm({
            shopName: '', tagline: '', description: '', imageUrl: '',
            badge: 'FEATURED', badgeColor: '#FF4B6E', ctaText: 'Visit Shop',
            ctaLink: '', durationDays: 1, requestedPrice: '500', paymentNote: '',
            payNow: true, paymentMethod: 'UPI', paymentReference: '', paymentScreenshotUrl: '',
            startDate: new Date().toISOString().split('T')[0],
        });
    };

    const handlePaymentSuccess = (paymentId: string) => {
        showToast('Payment successful! Your ad is now under final verification.', 'success');
        setRazorpayData(null);
        setShowForm(false);
        resetForm();
        fetchRequests();
    };

    const handlePaymentFailure = (error: string) => {
        showToast(error, 'error');
        setRazorpayData(null);
        // If we were in the form, we keep it open but maybe show a message
        if (!showForm) {
            fetchRequests();
        }
    };


    const handleCancel = async (id: string) => {
        try {
            await cancelAdRequest(id);
            showToast('Request cancelled', 'success');
            setShowCancelConfirm(null);
            fetchRequests();
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to cancel', 'error');
        }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Loading your ad requests...</p>
                </div>
            </div>
        );
    }

    const pendingCount = adRequests.filter(r => r.status === 'Pending').length;
    const liveCount = adRequests.filter(r => r.status === 'Live').length;
    const approvedCount = adRequests.filter(r => r.status === 'Approved').length;

    // Check if availability stats actually match the currently selected date in form
    const availabilityStale = availability?.selectedDate && form.startDate && availability.selectedDate.split('T')[0] !== form.startDate;
    const slotsAvailableForRange = availabilityStale ? 0 : (availability?.slotsAvailableInRange ?? availability?.slotsAvailable ?? (loading ? 10 : 0));

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
                <div className="px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 -ml-2 text-gray-400 hover:text-gray-900 transition-colors"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                            </button>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">📢 Advertise</h1>
                                <p className="text-xs text-gray-500 mt-0.5">Reach local customers</p>
                            </div>
                        </div>
                        {!showForm && (
                            <div className="flex items-center gap-3">
                                {availability && (
                                    <div className="hidden sm:flex flex-col items-end">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${availability.slotsAvailable > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {availability.slotsAvailable} SLOTS VACANT
                                        </span>
                                        <span className="text-[9px] text-gray-400 font-medium uppercase mt-0.5">Limit: {availability.maxAds} Ads</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => setShowForm(true)}
                                    className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <span>+ Request Ad</span>
                                    {availability && availability.slotsAvailable <= 0 && (
                                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Advance</span>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Weekly Availability Strip (Advance Booking) */}
            {availability && (
                <div className="mx-4 mt-2 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex justify-between items-center">
                        📅 Weekly Slot Availability
                        <span className="text-[9px] lowercase font-normal italic">Select a date in the form to book</span>
                    </h3>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                        {availability.dailyStats?.slice(0, 7).map((day: any) => (
                            <div
                                key={day.date}
                                onClick={() => {
                                    setForm(f => ({ ...f, startDate: day.date.split('T')[0] }));
                                    setShowForm(true);
                                }}
                                className={`flex-shrink-0 min-w-[65px] h-20 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 ${day.slotsAvailable > 0 ? 'bg-white border-gray-100 hover:border-pink-200' : 'bg-rose-50 border-rose-100 opacity-80'}`}
                            >
                                <span className={`text-[9px] font-bold ${day.slotsAvailable > 0 ? 'text-gray-400' : 'text-rose-400'}`}>
                                    {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </span>
                                <span className={`text-base font-black my-0.5 ${day.slotsAvailable > 0 ? 'text-gray-800' : 'text-rose-600'}`}>
                                    {day.slotsAvailable}
                                </span>
                                <span className={`text-[8px] font-bold uppercase ${day.slotsAvailable > 0 ? 'text-green-500' : 'text-rose-500'}`}>
                                    {day.slotsAvailable > 0 ? 'Free' : 'Full'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Slots Full Banner (Updated to mention Advance Booking) */}
            {availability && availability.slotsAvailable <= 0 && !showForm && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mx-4 mt-4 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-2xl p-5 flex items-start gap-4 shadow-sm"
                >
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm">
                        📅
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-rose-900 text-sm">Today's Slots are Full</h3>
                        <p className="text-rose-700 text-xs leading-relaxed mb-4">
                            All 10 advertising slots are currently booked. However, you can secure your spot by <b>scheduling for a future date</b>.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    const next = availability.dailyStats?.find((d: any) => d.slotsAvailable > 0);
                                    if (next) {
                                        setForm(f => ({ ...f, startDate: next.date.split('T')[0] }));
                                        showToast(`Date set to ${new Date(next.date).toLocaleDateString()}`, 'success');
                                    }
                                    setShowForm(true);
                                }}
                                className="bg-rose-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-2"
                            >
                                📅 Book for First Available Date
                            </button>
                            <button
                                onClick={() => setShowForm(true)}
                                className="bg-white text-rose-600 border border-rose-200 px-4 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all"
                            >
                                Choose Custom Date
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Stats Row */}
            {!showForm && (
                <div className="grid grid-cols-3 gap-3 p-4">
                    {[
                        { label: 'Pending', value: pendingCount, color: '#f59e0b', bg: '#fef3c7', icon: '🕐' },
                        { label: 'Live Now', value: liveCount, color: '#10b981', bg: '#d1fae5', icon: '🟢' },
                        { label: 'Approved', value: approvedCount, color: '#3b82f6', bg: '#dbeafe', icon: '✅' },
                    ].map(stat => (
                        <div key={stat.label} className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
                            <div className="text-xl mb-1">{stat.icon}</div>
                            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                            <p className="text-xs text-gray-500">{stat.label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Ad Request Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="mx-4 mt-4"
                    >
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                            {/* Form Header */}
                            <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-4">
                                <h2 className="font-bold text-lg">{slotsAvailableForRange > 0 ? "📢 New Immediate Ad Request" : "📅 Schedule Future Ad"}</h2>
                                <p className="text-xs text-pink-100 mt-0.5">
                                    {slotsAvailableForRange > 0
                                        ? "Request a slot for today. Once approved by Admin, your ad will go LIVE instantly."
                                        : "Today is full! Schedule your ad for a future date. Admin will review and confirm your slot."}
                                </p>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Image Upload */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Ad Banner Image *</label>
                                    {form.imageUrl ? (
                                        <div className="relative rounded-xl overflow-hidden h-40 border-2 border-pink-200">
                                            <img src={form.imageUrl} alt="Ad preview" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => setForm(f => ({ ...f, imageUrl: '' }))}
                                                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-red-500 hover:bg-red-50"
                                            >
                                                ✕
                                            </button>
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end p-3">
                                                <p className="text-white text-xs font-medium">Banner preview</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="h-40 border-2 border-dashed border-pink-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-pink-50 transition-colors"
                                        >
                                            {uploadingImage ? (
                                                <div className="text-center">
                                                    <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                                    <p className="text-sm text-pink-500">Uploading...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-3xl mb-2">🖼️</span>
                                                    <p className="text-sm font-medium text-gray-600">Click to upload banner</p>
                                                    <p className="text-xs text-gray-400 mt-1">Recommended: 1200×400px</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </div>

                                {/* Shop Name */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Shop / Business Name *</label>
                                    <input
                                        type="text"
                                        value={form.shopName}
                                        onChange={e => setForm(f => ({ ...f, shopName: e.target.value }))}
                                        placeholder="e.g. Riya Fashion Store"
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                                    />
                                </div>

                                {/* Tagline */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Catchy Tagline *</label>
                                    <input
                                        type="text"
                                        value={form.tagline}
                                        onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                                        placeholder="e.g. 50% off on all ethnic wear!"
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                        placeholder="Brief description of your offer..."
                                        rows={3}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition resize-none"
                                    />
                                </div>

                                {/* Ad Date Selection */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex justify-between">
                                        Select Ad Date *
                                        {availability && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${slotsAvailableForRange > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {slotsAvailableForRange} SLOTS FREE IN RANGE
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        type="date"
                                        min={new Date().toISOString().split('T')[0]}
                                        value={form.startDate}
                                        onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                        className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition ${slotsAvailableForRange <= 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                    />

                                    {availability && slotsAvailableForRange <= 0 && (
                                        <div className="mt-3 p-3 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl shadow-sm">
                                            <p className="text-[12px] text-rose-800 font-bold mb-1 flex items-center gap-1.5">
                                                <span className="text-lg">⚠️</span> SELECTED DATE IS FULL
                                            </p>
                                            <p className="text-[11px] text-rose-700 leading-relaxed">
                                                All 10 slots are already booked for this period. To proceed, please pick a later date.
                                            </p>
                                            {availability.dailyStats?.find((d: any) => d.slotsAvailable > 0 && new Date(d.date) > new Date(form.startDate)) && (
                                                <button
                                                    onClick={() => {
                                                        const next = availability.dailyStats?.find((d: any) => d.slotsAvailable > 0 && new Date(d.date) > new Date(form.startDate));
                                                        if (next) {
                                                            setForm(f => ({ ...f, startDate: next.date.split('T')[0] }));
                                                            showToast("Shifted to next available date", "success");
                                                        }
                                                    }}
                                                    className="mt-3 w-full text-[11px] bg-white border border-pink-200 text-pink-600 px-3 py-2 rounded-xl font-bold hover:bg-pink-50 transition shadow-sm active:scale-95 flex items-center justify-center gap-2"
                                                >
                                                    ✨ Use Next Available: {(() => {
                                                        const next = availability.dailyStats?.find((d: any) => d.slotsAvailable > 0 && new Date(d.date) > new Date(form.startDate));
                                                        return next ? new Date(next.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
                                                    })()}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {!slotsAvailableForRange && (
                                        <p className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1">
                                            ℹ️ Your ad will run for {form.durationDays} day(s) from the selected date.
                                        </p>
                                    )}
                                </div>

                                {/* Ad Duration Selection */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Duration (Days) *</label>
                                    <div className="flex flex-wrap gap-2">
                                        {DURATIONS.map(d => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => setForm(f => ({ ...f, durationDays: d, requestedPrice: getPriceForDuration(d).toString() }))}
                                                className={`px-4 py-2 rounded-xl text-sm font-bold transition ${form.durationDays === d ? 'bg-pink-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                {d} {d === 1 ? 'Day' : 'Days'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Pricing Display */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Pricing Summary</label>
                                    <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-4 border border-pink-100 relative overflow-hidden">
                                        <div className="flex justify-between items-center relative z-10">
                                            <div>
                                                <p className="text-[10px] text-pink-600 font-bold uppercase tracking-wider mb-1">
                                                    {form.durationDays} {form.durationDays === 1 ? 'Day' : 'Days'} Slot
                                                </p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl font-black text-gray-900">₹{getPriceForDuration(form.durationDays)}</span>
                                                    <span className="text-xs text-gray-400">(@ ₹500/day)</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400 font-medium">Valid until</p>
                                                <p className="text-xs font-bold text-gray-700">
                                                    {new Date(new Date(form.startDate).getTime() + form.durationDays * 86400000).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <input type="hidden" value={getPriceForDuration(form.durationDays)} />
                                </div>

                                {/* CTA */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Button Text</label>
                                        <input
                                            type="text"
                                            value={form.ctaText}
                                            onChange={e => setForm(f => ({ ...f, ctaText: e.target.value }))}
                                            placeholder="Visit Shop"
                                            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex justify-between">
                                            Link <span className="text-gray-400 font-normal">(opt.)</span>
                                            {form.ctaLink && (
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(ensureAbsoluteUrl(form.ctaLink), '_blank')}
                                                    className="text-[10px] text-pink-500 font-bold hover:underline"
                                                >
                                                    Test Link ↗
                                                </button>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={form.ctaLink}
                                            onChange={e => setForm(f => ({ ...f, ctaLink: e.target.value }))}
                                            placeholder="https://..."
                                            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 transition"
                                        />
                                    </div>
                                </div>

                                {/* Badge */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Badge Text</label>
                                        <input
                                            type="text"
                                            value={form.badge}
                                            onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
                                            placeholder="FEATURED"
                                            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Badge Color</label>
                                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-pink-400 transition">
                                            <input
                                                type="color"
                                                value={form.badgeColor}
                                                onChange={e => setForm(f => ({ ...f, badgeColor: e.target.value }))}
                                                className="w-8 h-8 rounded cursor-pointer border-0"
                                            />
                                            <span className="text-sm text-gray-600">{form.badgeColor}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Additional note */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Any additional note? <span className="text-gray-400 font-normal">(opt.)</span></label>
                                    <textarea
                                        value={form.paymentNote}
                                        onChange={e => setForm(f => ({ ...f, paymentNote: e.target.value }))}
                                        placeholder="Special requirements, preferred schedule, etc."
                                        rows={2}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 transition resize-none"
                                    />
                                </div>

                                {/* Simplified Step: Direct Payment */}
                                <div className="border-t border-dashed border-gray-200 pt-4 mt-2">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex flex-col">
                                            <h3 className="text-base font-bold text-gray-800">💳 Pay Now (Instant Review)</h3>
                                            <p className="text-[10px] text-gray-500">Secure payment via Razorpay</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={form.payNow}
                                                onChange={() => setForm(f => ({ ...f, payNow: !f.payNow }))}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                        </label>
                                    </div>

                                    {!form.payNow && (
                                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex gap-2">
                                            <span className="text-amber-500 text-lg">💡</span>
                                            <p className="text-xs text-amber-700 leading-tight">
                                                Choosing "Pay Later" means an admin will manually verify your request and set a price before you can pay. <b>Paying now speeds up approval!</b>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => setShowForm(false)}
                                        className="flex-1 border-2 border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    {slotsAvailableForRange <= 0 ? (
                                        <button
                                            onClick={() => {
                                                const next = availability?.dailyStats?.find((d: any) => d.slotsAvailable > 0);
                                                if (next) {
                                                    setForm(f => ({ ...f, startDate: next.date.split('T')[0] }));
                                                    showToast(`Date shifted to ${new Date(next.date).toLocaleDateString()}`, 'success');
                                                } else {
                                                    showToast('No available slots found in this range. Please pick a different month or contact admin.', 'error');
                                                }
                                            }}
                                            disabled={submitting || uploadingImage || isCheckingSlots}
                                            className="flex-[2] bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl py-3 text-sm font-bold shadow-md hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isCheckingSlots ? <span className="animate-spin text-lg block">⏳</span> : "📅 Schedule for Next Available"}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSubmit}
                                            disabled={submitting || uploadingImage || isCheckingSlots}
                                            className="flex-[2] bg-gradient-to-r from-pink-600 to-rose-600 text-white rounded-xl py-3 text-sm font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {submitting ? 'Submitting...' : isCheckingSlots ? 'Checking Slots...' : form.payNow ? '💳 Pay & Post Now' : '🚀 Request Immediate Ad'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Ad Requests List */}
            {!showForm && (
                <div className="px-4 mt-2 space-y-4">
                    {adRequests.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100 mt-4">
                            <div className="text-5xl mb-4">📢</div>
                            <h3 className="text-lg font-bold text-gray-800 mb-2">No Ad Requests Yet</h3>
                            <p className="text-sm text-gray-500 mb-6">Reach thousands of local customers by advertising on our home page carousel!</p>
                            <button
                                onClick={() => setShowForm(true)}
                                className="bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition flex items-center gap-2 mx-auto"
                            >
                                <span>Create Your First Ad</span>
                                {availability && availability.slotsAvailable <= 0 && (
                                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] uppercase">Advance</span>
                                )}
                            </button>
                        </div>
                    ) : (
                        adRequests.map((req, i) => {
                            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG['Pending'];
                            return (
                                <motion.div
                                    key={req._id}
                                    id={`request-${req._id}`}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                                >
                                    {/* Image */}
                                    <div className="relative h-40">
                                        <img src={req.imageUrl} alt={req.shopName} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                        {/* Badge */}
                                        <div
                                            className="absolute top-3 left-3 px-2 py-1 rounded-full text-white text-xs font-bold"
                                            style={{ backgroundColor: req.badgeColor || '#FF4B6E' }}
                                        >
                                            {req.badge || 'FEATURED'}
                                        </div>
                                        {/* Status badge */}
                                        <div
                                            className="absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-bold"
                                            style={{ backgroundColor: cfg.bg, color: cfg.color }}
                                        >
                                            {cfg.icon} {cfg.label}
                                        </div>
                                        {/* Shop name overlay */}
                                        <div className="absolute bottom-3 left-3">
                                            <p className="text-white font-bold text-base">{req.shopName}</p>
                                            <p className="text-white/80 text-xs">{req.tagline}</p>
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="p-4">
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold">
                                                📅 {req.startDate ? new Date(req.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Asap'}
                                            </span>
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg text-xs">
                                                🕒 {req.durationDays} {req.durationDays === 1 ? 'Day' : 'Days'}
                                            </span>
                                            {req.adPrice > 0 && (
                                                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg text-xs font-semibold">
                                                    ₹{req.adPrice}
                                                </span>
                                            )}
                                        </div>

                                        {/* Admin note */}
                                        {req.adminNote && (
                                            <div className={`rounded-xl p-3 mb-3 text-xs ${req.status === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                                                <span className="font-semibold">Admin note:</span> {req.adminNote}
                                            </div>
                                        )}

                                        <p className="text-xs text-gray-400 mb-3">
                                            Submitted {new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>

                                        {/* Action Buttons */}
                                        <div className="flex gap-2">
                                            {/* Pay Now — shown when Approved */}
                                            {req.status === 'Approved' && (
                                                <div className="flex gap-2 flex-1">
                                                    <button
                                                        onClick={() => {
                                                            setRazorpayData({
                                                                id: req._id,
                                                                amount: req.adPrice
                                                            });
                                                        }}
                                                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold shadow hover:shadow-lg transition active:scale-95"
                                                    >
                                                        💳 Pay ₹{req.adPrice}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(ensureAbsoluteUrl(req.ctaLink), '_blank')}
                                                        className="px-4 border-2 border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition"
                                                        title="Check Link"
                                                    >
                                                        ↗
                                                    </button>
                                                </div>
                                            )}

                                            {/* Cancel — for Pending or Rejected */}
                                            {['Pending', 'Rejected'].includes(req.status) && (
                                                <button
                                                    onClick={() => setShowCancelConfirm(req._id)}
                                                    className="flex-1 border-2 border-red-200 text-red-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 transition"
                                                >
                                                    Cancel Request
                                                </button>
                                            )}

                                            {/* Payment status for PaymentPending/Live */}
                                            {req.status === 'PaymentPending' && (
                                                <div className="flex-1 bg-purple-50 text-purple-700 py-2.5 rounded-xl text-sm font-semibold text-center">
                                                    ⏳ Verifying Payment...
                                                </div>
                                            )}
                                            {req.status === 'Live' && (
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(ensureAbsoluteUrl(req.ctaLink), '_blank')}
                                                    className="flex-1 bg-green-500 text-white py-2.5 rounded-xl text-sm font-bold text-center shadow-sm hover:shadow-md transition active:scale-95 flex items-center justify-center gap-2"
                                                >
                                                    🎉 View Live Ad <span className="text-[10px]">↗</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>
            )}


            {/* Cancel Confirm */}
            <AnimatePresence>
                {showCancelConfirm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl"
                        >
                            <div className="text-4xl mb-3">🗑️</div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Request?</h3>
                            <p className="text-sm text-gray-500 mb-6">This will permanently remove this ad request.</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCancelConfirm(null)}
                                    className="flex-1 border-2 border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                                >
                                    Keep It
                                </button>
                                <button
                                    onClick={() => handleCancel(showCancelConfirm)}
                                    className="flex-1 bg-red-500 text-white rounded-xl py-3 text-sm font-bold hover:bg-red-600 transition"
                                >
                                    Yes, Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Razorpay Integration */}
            {razorpayData && (
                <RazorpayCheckout
                    orderId={razorpayData.id}
                    amount={razorpayData.amount}
                    onSuccess={handlePaymentSuccess}
                    onFailure={handlePaymentFailure}
                    customerDetails={sellerDetails}
                    type="AdRequest"
                />
            )}
        </div>
    );
}

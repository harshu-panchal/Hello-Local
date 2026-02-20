import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
    getAllShopAds,
    createShopAd,
    updateShopAd,
    deleteShopAd,
    toggleShopAdStatus,
    ShopAd,
} from "../../../services/api/admin/adminShopAdService";
import { uploadImage } from "../../../services/api/uploadService";
import {
    adminGetAllAdRequests,
    adminApproveAdRequest,
    adminRejectAdRequest,
    adminVerifyPaymentAndActivate,
    adminGetAdRequestStats,
} from "../../../services/api/sellerAdRequestService";

type FormData = Partial<ShopAd>;

const initialForm: FormData = {
    shopName: "",
    tagline: "",
    description: "",
    imageUrl: "",
    badge: "PREMIUM",
    badgeColor: "#FF4B6E",
    ctaText: "Visit Shop",
    ctaLink: "",
    order: 0,
    isActive: true,
    contactInfo: { name: "", phone: "", email: "" },
    requestedBy: "",
    expiresAt: "",
};

export default function AdminShopAds() {
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<"ads" | "requests">(
        searchParams.get("tab") === "requests" ? "requests" : "ads"
    );
    const [ads, setAds] = useState<ShopAd[]>([]);
    const [adRequests, setAdRequests] = useState<any[]>([]);
    const [requestStats, setRequestStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAd, setEditingAd] = useState<ShopAd | null>(null);
    const [form, setForm] = useState<FormData>(initialForm);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    // Ad Request Actions
    const [approveModal, setApproveModal] = useState<any | null>(null);
    const [rejectModal, setRejectModal] = useState<any | null>(null);
    const [detailsModal, setDetailsModal] = useState<any | null>(null);
    const [approvePrice, setApprovePrice] = useState("");
    const [approveNote, setApproveNote] = useState("");
    const [rejectNote, setRejectNote] = useState("");
    const [requestFilter, setRequestFilter] = useState("Pending");

    const showToast = (message: string, type: "success" | "error") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchAds = async () => {
        setLoading(true);
        try {
            const res = await getAllShopAds();
            setAds(res.data || []);
        } catch {
            showToast("Failed to load shop ads", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchAdRequests = async () => {
        try {
            const [reqRes, statsRes] = await Promise.all([
                adminGetAllAdRequests(requestFilter !== 'All' ? requestFilter : undefined),
                adminGetAdRequestStats(),
            ]);
            if (reqRes.success) setAdRequests(reqRes.data || []);
            if (statsRes.success) setRequestStats(statsRes.data);
        } catch {
            showToast("Failed to load ad requests", "error");
        }
    };

    useEffect(() => { fetchAds(); fetchAdRequests(); }, []);
    useEffect(() => { fetchAdRequests(); }, [requestFilter]);

    // Handle deep linking for specific requests from notifications
    useEffect(() => {
        const requestId = searchParams.get("requestId");
        if (requestId && adRequests.length > 0) {
            const req = adRequests.find(r => r._id === requestId);
            if (req) {
                setDetailsModal(req);
                setActiveTab("requests");
            }
        }
    }, [searchParams, adRequests]);

    const handleOpenCreate = () => {
        setEditingAd(null);
        setForm(initialForm);
        setShowModal(true);
    };

    const handleOpenEdit = (ad: ShopAd) => {
        setEditingAd(ad);
        setForm({
            shopName: ad.shopName,
            tagline: ad.tagline,
            description: ad.description || "",
            imageUrl: ad.imageUrl,
            badge: ad.badge || "PREMIUM",
            badgeColor: ad.badgeColor || "#FF4B6E",
            ctaText: ad.ctaText || "Visit Shop",
            ctaLink: ad.ctaLink || "",
            order: ad.order,
            isActive: ad.isActive,
            contactInfo: ad.contactInfo || { name: "", phone: "", email: "" },
            requestedBy: ad.requestedBy || "",
            expiresAt: ad.expiresAt ? new Date(ad.expiresAt).toISOString().split("T")[0] : "",
        });
        setShowModal(true);
    };

    const handleImageUpload = async (file: File) => {
        setUploadingImage(true);
        try {
            const result = await uploadImage(file);
            const url = result.url || result.secureUrl;
            if (url) {
                setForm(prev => ({ ...prev, imageUrl: url }));
                showToast("Image uploaded successfully", "success");
            } else {
                throw new Error("No URL returned");
            }
        } catch {
            showToast("Failed to upload image", "error");
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.shopName || !form.tagline || !form.imageUrl) {
            showToast("Shop name, tagline and image are required", "error");
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                ...form,
                contactInfo: form.contactInfo,
                expiresAt: form.expiresAt || undefined,
            };
            if (editingAd) {
                await updateShopAd(editingAd._id, payload);
                showToast("Shop ad updated successfully!", "success");
            } else {
                await createShopAd(payload);
                showToast("Shop ad created successfully!", "success");
            }
            setShowModal(false);
            fetchAds();
            fetchAdRequests();
        } catch {
            showToast("Failed to save shop ad", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteShopAd(id);
            showToast("Shop ad deleted", "success");
            setDeleteConfirm(null);
            fetchAds();
            fetchAdRequests();
        } catch {
            showToast("Failed to delete shop ad", "error");
        }
    };

    const handleToggle = async (id: string) => {
        try {
            await toggleShopAdStatus(id);
            setAds(prev => prev.map(a => a._id === id ? { ...a, isActive: !a.isActive } : a));
            showToast("Status updated", "success");
            fetchAdRequests(); // Update stats
        } catch {
            showToast("Failed to update status", "error");
        }
    };

    return (
        <div style={styles.page}>
            {/* Toast */}
            {toast && (
                <div style={{ ...styles.toast, backgroundColor: toast.type === "success" ? "#10b981" : "#ef4444" }}>
                    <span>{toast.type === "success" ? "✓" : "✗"}</span>
                    {toast.message}
                </div>
            )}

            {/* Page Header */}
            <div style={styles.pageHeader}>
                <div>
                    <h1 style={styles.pageTitle}>
                        <span style={styles.pageTitleIcon}>🎯</span> Shop Ad Carousel
                    </h1>
                    <p style={styles.pageSubtitle}>
                        Manage promotional ads displayed on the home page carousel. Shopkeepers contact you to place ads here.
                    </p>
                </div>
                <button style={styles.addBtn} onClick={handleOpenCreate} id="admin-shop-ads-add-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add New Ad
                </button>
            </div>

            {/* Stats Row */}
            <div style={styles.statsRow}>
                {[
                    { label: "Total Ads", value: ads.length, icon: "📢", color: "#8B5CF6" },
                    { label: "Active Ads", value: ads.filter(a => a.isActive).length, icon: "✅", color: "#10B981" },
                    { label: "Inactive Ads", value: ads.filter(a => !a.isActive).length, icon: "⏸", color: "#F59E0B" },
                    {
                        label: "Expiring Soon",
                        value: ads.filter(a => a.expiresAt && new Date(a.expiresAt) < new Date(Date.now() + 7 * 86400000)).length,
                        icon: "⚠️",
                        color: "#EF4444",
                    },
                ].map(stat => (
                    <div key={stat.label} style={styles.statCard}>
                        <div style={{ ...styles.statIcon, backgroundColor: stat.color + "20" }}>{stat.icon}</div>
                        <div>
                            <div style={{ ...styles.statValue, color: stat.color }}>{stat.value}</div>
                            <div style={styles.statLabel}>{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tab Switcher */}
            <div style={{ display: "flex", gap: 0, margin: "16px 0", borderBottom: "2px solid #f3f4f6" }}>
                <button
                    onClick={() => setActiveTab("ads")}
                    style={{ padding: "10px 24px", fontWeight: 600, fontSize: 14, border: "none", background: "transparent", cursor: "pointer", borderBottom: activeTab === "ads" ? "2px solid #ec4899" : "2px solid transparent", color: activeTab === "ads" ? "#ec4899" : "#6b7280", marginBottom: -2 }}
                >📋 Manage Ads ({ads.length})</button>
                <button
                    onClick={() => setActiveTab("requests")}
                    style={{ padding: "10px 24px", fontWeight: 600, fontSize: 14, border: "none", background: "transparent", cursor: "pointer", borderBottom: activeTab === "requests" ? "2px solid #ec4899" : "2px solid transparent", color: activeTab === "requests" ? "#ec4899" : "#6b7280", marginBottom: -2, display: "flex", alignItems: "center", gap: 8 }}
                >
                    📢 Seller Ad Requests
                    {requestStats?.pending > 0 && <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{requestStats.pending}</span>}
                </button>
            </div>

            {/* AD REQUESTS PANEL */}
            {activeTab === "requests" && (
                <div>
                    {requestStats && (
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as any, marginBottom: 16 }}>
                            {[
                                { label: "Pending", value: requestStats.pending, color: "#f59e0b" },
                                { label: "Approved", value: requestStats.approved, color: "#3b82f6" },
                                { label: "Awaiting Payment", value: requestStats.paymentPending, color: "#8b5cf6" },
                                { label: "Live", value: requestStats.live, color: "#10b981" },
                                { label: "Rejected", value: requestStats.rejected, color: "#ef4444" },
                                { label: `Active Ads (Max ${requestStats.maxAds})`, value: `${requestStats.activeAds}/${requestStats.maxAds}`, color: requestStats.activeAds >= requestStats.maxAds ? "#ef4444" : "#6366f1" },
                            ].map((s: any) => (
                                <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 18px", minWidth: 110, textAlign: "center" as any, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {requestStats?.activeAds >= requestStats?.maxAds && (
                        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 16px", marginBottom: 16, color: "#dc2626", fontSize: 13 }}>
                            ⚠️ <strong>Ad Limit Reached:</strong> {requestStats.maxAds} ads active. Deactivate an existing ad first before approving new ones.
                        </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" as any }}>
                        {["Pending", "Approved", "PaymentPending", "Live", "Rejected", "All"].map(f => (
                            <button key={f} onClick={() => setRequestFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: requestFilter === f ? "#ec4899" : "#f3f4f6", color: requestFilter === f ? "#fff" : "#374151" }}>
                                {f === "PaymentPending" ? "💳 Awaiting Payment" : f}
                            </button>
                        ))}
                    </div>
                    {adRequests.length === 0 ? (
                        <div style={{ background: "#fff", borderRadius: 16, padding: 40, textAlign: "center" as any, color: "#9ca3af" }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                            <p style={{ fontWeight: 600 }}>No {requestFilter !== "All" ? requestFilter : ""} requests found</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column" as any, gap: 16 }}>
                            {adRequests.map((req: any) => (
                                <div key={req._id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                                    <div style={{ display: "flex", gap: 16, padding: 20 }}>
                                        <img src={req.imageUrl} alt={req.shopName} style={{ width: 120, height: 80, objectFit: "cover" as any, borderRadius: 10, flexShrink: 0 }} onError={(e: any) => { e.target.src = "https://placehold.co/120x80/1a1a2e/fff?text=Ad"; }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as any, marginBottom: 4 }}>
                                                <strong style={{ fontSize: 16 }}>{req.shopName}</strong>
                                                <span style={{ background: req.status === "Pending" ? "#fef3c7" : req.status === "Approved" ? "#dbeafe" : req.status === "Live" ? "#d1fae5" : req.status === "Rejected" ? "#fee2e2" : "#ede9fe", color: req.status === "Pending" ? "#92400e" : req.status === "Approved" ? "#1e40af" : req.status === "Live" ? "#065f46" : req.status === "Rejected" ? "#991b1b" : "#5b21b6", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                                                    {req.status === "PaymentPending" ? "💳 Awaiting Payment Verification" : req.status}
                                                </span>
                                                {req.adPrice > 0 && <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>₹{req.adPrice}</span>}
                                            </div>
                                            <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0" }}>{req.tagline}</p>
                                            <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#6b7280", flexWrap: "wrap" as any, marginTop: 4 }}>
                                                <span>👤 {req.sellerName}</span>
                                                <span>📧 {req.sellerEmail}</span>
                                                {req.sellerPhone && <span>📱 {req.sellerPhone}</span>}
                                                <span>📅 {req.durationDays} days</span>
                                                <span>🕐 {new Date(req.createdAt).toLocaleDateString("en-IN")}</span>
                                            </div>
                                            {req.adminNote && <div style={{ marginTop: 6, background: "#f3f4f6", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>📝 {req.adminNote}</div>}
                                            {req.status === "PaymentPending" && (
                                                <div style={{ marginTop: 8, background: "#faf5ff", border: "1px solid #d8b4fe", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
                                                    <strong style={{ color: "#7c3aed" }}>💳 Payment Submitted</strong>
                                                    <div style={{ color: "#6b7280", marginTop: 4 }}>Method: {req.paymentMethod || "N/A"} · Ref: {req.paymentReference || "N/A"}</div>
                                                    {req.paymentScreenshotUrl && <a href={req.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed", fontWeight: 600, display: "inline-block", marginTop: 4 }}>📸 View Screenshot</a>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 10, flexWrap: "wrap" as any, alignItems: "center" }}>
                                        {/* Always show View Details */}
                                        <button
                                            onClick={() => setDetailsModal(req)}
                                            style={{ padding: "8px 18px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                                        >
                                            👁 View Details
                                        </button>
                                        {req.status === "Pending" && (
                                            <>
                                                <button onClick={() => { setApproveModal(req); setApprovePrice(""); setApproveNote(""); }} style={{ padding: "8px 18px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>✅ Approve & Make Live</button>
                                                <button onClick={() => { setRejectModal(req); setRejectNote(""); }} style={{ padding: "8px 18px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>❌ Reject</button>
                                            </>
                                        )}
                                        {req.status === "PaymentPending" && (
                                            <>
                                                <button onClick={() => setDetailsModal(req)} style={{ padding: "8px 18px", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>🟢 Verify & Activate</button>
                                                <button onClick={() => { setRejectModal(req); setRejectNote(""); }} style={{ padding: "8px 18px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>❌ Reject Payment</button>
                                            </>
                                        )}
                                        {req.status === "Live" && <span style={{ padding: "8px 18px", background: "#d1fae5", color: "#065f46", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>🟢 Live on Website</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Approve Modal */}
                    {approveModal && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }}>
                            <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>✅ Approve Ad Request</h3>
                                <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>For: <strong>{approveModal.shopName}</strong> — {approveModal.durationDays} days</p>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ad Price (₹) *</label>
                                    <input type="number" value={approvePrice} onChange={e => setApprovePrice(e.target.value)} placeholder="e.g. 799" style={{ width: "100%", padding: "10px 14px", border: "2px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box" as any }} />
                                    <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Seller requested: ₹{approveModal.requestedPrice || "Not specified"}</p>
                                </div>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Note to Seller (optional)</label>
                                    <textarea value={approveNote} onChange={e => setApproveNote(e.target.value)} placeholder="Payment instructions..." rows={3} style={{ width: "100%", padding: "10px 14px", border: "2px solid #e5e7eb", borderRadius: 10, fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" as any }} />
                                </div>
                                <div style={{ display: "flex", gap: 12 }}>
                                    <button onClick={() => setApproveModal(null)} style={{ flex: 1, padding: "11px 0", border: "2px solid #e5e7eb", borderRadius: 10, fontWeight: 600, cursor: "pointer", background: "transparent" }}>Cancel</button>
                                    <button onClick={async () => { if (!approvePrice || parseFloat(approvePrice) <= 0) { showToast("Please set a valid price", "error"); return; } try { await adminApproveAdRequest(approveModal._id, parseFloat(approvePrice), approveNote); showToast("✅ Ad is now LIVE! Seller notified.", "success"); setApproveModal(null); fetchAdRequests(); fetchAds(); } catch (e: any) { showToast(e?.response?.data?.message || "Failed", "error"); } }} style={{ flex: 1, padding: "11px 0", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>🚀 Approve & Make Live</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Reject Modal */}
                    {rejectModal && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }}>
                            <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "#dc2626" }}>❌ Reject Request</h3>
                                <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>Shop: <strong>{rejectModal.shopName}</strong></p>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Reason for rejection *</label>
                                    <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="e.g. Image quality too low, please resubmit..." rows={4} style={{ width: "100%", padding: "10px 14px", border: "2px solid #fca5a5", borderRadius: 10, fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box" as any }} />
                                </div>
                                <div style={{ display: "flex", gap: 12 }}>
                                    <button onClick={() => setRejectModal(null)} style={{ flex: 1, padding: "11px 0", border: "2px solid #e5e7eb", borderRadius: 10, fontWeight: 600, cursor: "pointer", background: "transparent" }}>Cancel</button>
                                    <button onClick={async () => { if (!rejectNote.trim()) { showToast("Please provide a reason", "error"); return; } try { await adminRejectAdRequest(rejectModal._id, rejectNote); showToast("Request rejected. Seller notified.", "success"); setRejectModal(null); fetchAdRequests(); fetchAds(); } catch (e: any) { showToast(e?.response?.data?.message || "Failed", "error"); } }} style={{ flex: 1, padding: "11px 0", background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>❌ Reject</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== DETAILS MODAL ===== */}
                    {detailsModal && (
                        <div
                            onClick={(e) => e.target === e.currentTarget && setDetailsModal(null)}
                            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 20, overflowY: "auto" }}
                        >
                            <div style={{ background: "#fff", borderRadius: 24, maxWidth: 600, width: "100%", boxShadow: "0 24px 80px rgba(0,0,0,0.35)", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" as any }}>
                                {/* Header */}
                                <div style={{ background: "linear-gradient(135deg,#ec4899,#be185d)", padding: "20px 24px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Ad Request Details</h2>
                                        <p style={{ margin: "4px 0 0", opacity: 0.85, fontSize: 13 }}>Review before taking action</p>
                                    </div>
                                    <button onClick={() => setDetailsModal(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                                </div>

                                {/* Scrollable body */}
                                <div style={{ overflowY: "auto", flex: 1, padding: 24 }}>
                                    {/* Ad Preview Banner */}
                                    <div style={{ borderRadius: 16, overflow: "hidden", position: "relative", marginBottom: 20, height: 200 }}>
                                        <img
                                            src={detailsModal.imageUrl}
                                            alt={detailsModal.shopName}
                                            style={{ width: "100%", height: "100%", objectFit: "cover" as any }}
                                            onError={(e: any) => { e.target.src = "https://placehold.co/600x200/1a1a2e/fff?text=Ad+Preview"; }}
                                        />
                                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }} />
                                        <div style={{ position: "absolute", bottom: 16, left: 16, color: "#fff" }}>
                                            {detailsModal.badge && (
                                                <span style={{ background: detailsModal.badgeColor || "#FF4B6E", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginBottom: 6, display: "inline-block" }}>{detailsModal.badge}</span>
                                            )}
                                            <div style={{ fontSize: 20, fontWeight: 700 }}>{detailsModal.shopName}</div>
                                            <div style={{ fontSize: 13, opacity: 0.9 }}>{detailsModal.tagline}</div>
                                        </div>
                                        <span style={{
                                            position: "absolute", top: 14, right: 14,
                                            background: detailsModal.status === "Pending" ? "#fef3c7" : detailsModal.status === "Approved" ? "#dbeafe" : detailsModal.status === "Live" ? "#d1fae5" : detailsModal.status === "Rejected" ? "#fee2e2" : "#ede9fe",
                                            color: detailsModal.status === "Pending" ? "#92400e" : detailsModal.status === "Approved" ? "#1e40af" : detailsModal.status === "Live" ? "#065f46" : detailsModal.status === "Rejected" ? "#991b1b" : "#5b21b6",
                                            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                        }}>
                                            {detailsModal.status === "PaymentPending" ? "💳 Awaiting Payment Verification" : detailsModal.status}
                                        </span>
                                    </div>

                                    {/* Info Grid */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                                        {[
                                            { icon: "👤", label: "Seller", value: detailsModal.sellerName },
                                            { icon: "📧", label: "Email", value: detailsModal.sellerEmail },
                                            { icon: "📱", label: "Phone", value: detailsModal.sellerPhone || "—" },
                                            { icon: "📅", label: "Duration", value: `${detailsModal.durationDays} days` },
                                            { icon: "💰", label: "Requested Price", value: detailsModal.requestedPrice ? `₹${detailsModal.requestedPrice}` : "Not specified" },
                                            { icon: "💎", label: "Admin Set Price", value: detailsModal.adPrice > 0 ? `₹${detailsModal.adPrice}` : "Not set yet" },
                                            { icon: "🕐", label: "Submitted", value: new Date(detailsModal.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
                                            { icon: "🔗", label: "CTA Link", value: detailsModal.ctaLink || "—" },
                                        ].map((item: any) => (
                                            <div key={item.label} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 14px" }}>
                                                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{item.icon} {item.label}</div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", wordBreak: "break-all" as any }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Description */}
                                    {detailsModal.description && (
                                        <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                                            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>📝 Description</div>
                                            <div style={{ fontSize: 13, color: "#374151" }}>{detailsModal.description}</div>
                                        </div>
                                    )}

                                    {/* Admin Note */}
                                    {detailsModal.adminNote && (
                                        <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                                            <div style={{ fontSize: 11, color: "#92400e", marginBottom: 4 }}>🗒 Admin Note to Seller</div>
                                            <div style={{ fontSize: 13, color: "#78350f" }}>{detailsModal.adminNote}</div>
                                        </div>
                                    )}

                                    {/* Payment Proof (if PaymentPending) */}
                                    {detailsModal.status === "PaymentPending" && (
                                        <div style={{ background: "#faf5ff", border: "2px solid #d8b4fe", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
                                            <h4 style={{ margin: "0 0 12px", color: "#7c3aed", fontSize: 14 }}>💳 Payment Proof Submitted by Seller</h4>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                                                <div style={{ background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                                                    <div style={{ fontSize: 10, color: "#9ca3af" }}>Payment Method</div>
                                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{detailsModal.paymentMethod || "N/A"}</div>
                                                </div>
                                                <div style={{ background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                                                    <div style={{ fontSize: 10, color: "#9ca3af" }}>Reference / UTR</div>
                                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{detailsModal.paymentReference || "N/A"}</div>
                                                </div>
                                            </div>
                                            {detailsModal.paymentNote && (
                                                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Note: {detailsModal.paymentNote}</div>
                                            )}
                                            {detailsModal.paymentScreenshotUrl && (
                                                <div>
                                                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Payment Screenshot:</div>
                                                    <img
                                                        src={detailsModal.paymentScreenshotUrl}
                                                        alt="Payment proof"
                                                        style={{ width: "100%", borderRadius: 10, border: "1px solid #d8b4fe", maxHeight: 300, objectFit: "contain" as any, background: "#f5f3ff", cursor: "pointer" }}
                                                        onClick={() => window.open(detailsModal.paymentScreenshotUrl, "_blank")}
                                                    />
                                                    <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 4, textAlign: "center" as any }}>Click image to open full size</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Action Footer */}
                                <div style={{ padding: "16px 24px", borderTop: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 10, flexWrap: "wrap" as any, justifyContent: "flex-end" as any }}>
                                    <button onClick={() => setDetailsModal(null)} style={{ padding: "10px 20px", border: "2px solid #e5e7eb", borderRadius: 10, fontWeight: 600, cursor: "pointer", background: "#fff", fontSize: 13 }}>Close</button>

                                    {detailsModal.status === "Pending" && (
                                        <>
                                            <button
                                                onClick={() => { setDetailsModal(null); setRejectModal(detailsModal); setRejectNote(""); }}
                                                style={{ padding: "10px 20px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                                            >❌ Reject</button>
                                            <button
                                                onClick={() => { setDetailsModal(null); setApproveModal(detailsModal); setApprovePrice(""); setApproveNote(""); }}
                                                style={{ padding: "10px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                                            >🚀 Approve & Make Live</button>
                                        </>
                                    )}

                                    {detailsModal.status === "PaymentPending" && (
                                        <>
                                            <button
                                                onClick={() => { setDetailsModal(null); setRejectModal(detailsModal); setRejectNote(""); }}
                                                style={{ padding: "10px 20px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                                            >❌ Reject Payment</button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await adminVerifyPaymentAndActivate(detailsModal._id);
                                                        showToast("✅ Payment verified! Ad is now LIVE on the website 🎉", "success");
                                                        setDetailsModal(null);
                                                        fetchAdRequests();
                                                        fetchAds();
                                                    } catch (e: any) {
                                                        showToast(e?.response?.data?.message || "Failed to activate", "error");
                                                    }
                                                }}
                                                style={{ padding: "10px 24px", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(16,185,129,0.4)" }}
                                            >🟢 Confirm & Make LIVE</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MANAGE ADS TAB */}
            {activeTab === "ads" && (
                <div>
                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner} />
                            <p style={styles.loadingText}>Loading shop ads...</p>
                        </div>
                    ) : ads.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>📢</div>
                            <h3 style={styles.emptyTitle}>No Shop Ads Yet</h3>
                            <p style={styles.emptyDesc}>Create your first shop ad to start showing it on the home page carousel.</p>
                            <button style={styles.addBtn} onClick={handleOpenCreate}>Add First Ad</button>
                        </div>
                    ) : (
                        <div style={styles.adsGrid}>
                            {ads.map((ad, index) => (

                                <div key={ad._id} style={styles.adCard} id={`ad-card-${ad._id}`}>
                                    {/* Image */}
                                    <div style={styles.adImageWrapper}>
                                        <img
                                            src={ad.imageUrl}
                                            alt={ad.shopName}
                                            style={styles.adImage}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = "https://placehold.co/400x160/1a1a2e/ffffff?text=No+Image";
                                            }}
                                        />
                                        <div style={styles.adImageOverlay} />
                                        {/* Badge */}
                                        {ad.badge && (
                                            <div style={{ ...styles.adBadge, backgroundColor: ad.badgeColor || "#FF4B6E" }}>
                                                {ad.badge}
                                            </div>
                                        )}
                                        {/* Order number */}
                                        <div style={styles.adOrder}>#{index + 1}</div>
                                        {/* Status toggle */}
                                        <button
                                            style={{ ...styles.adStatusToggle, backgroundColor: ad.isActive ? "#10b981" : "#6b7280" }}
                                            onClick={() => handleToggle(ad._id)}
                                            id={`toggle-ad-${ad._id}`}
                                        >
                                            {ad.isActive ? "● Active" : "○ Inactive"}
                                        </button>
                                    </div>

                                    {/* Card Body */}
                                    <div style={styles.adCardBody}>
                                        <h3 style={styles.adCardTitle}>{ad.shopName}</h3>
                                        <p style={styles.adCardTagline}>{ad.tagline}</p>

                                        {ad.requestedBy && (
                                            <div style={styles.adMetaRow}>
                                                <span style={styles.adMetaIcon}>👤</span>
                                                <span style={styles.adMetaText}>Requested by: <strong>{ad.requestedBy}</strong></span>
                                            </div>
                                        )}
                                        {ad.contactInfo?.phone && (
                                            <div style={styles.adMetaRow}>
                                                <span style={styles.adMetaIcon}>📞</span>
                                                <span style={styles.adMetaText}>{ad.contactInfo.phone}</span>
                                            </div>
                                        )}
                                        {ad.contactInfo?.email && (
                                            <div style={styles.adMetaRow}>
                                                <span style={styles.adMetaIcon}>✉️</span>
                                                <span style={styles.adMetaText}>{ad.contactInfo.email}</span>
                                            </div>
                                        )}
                                        {ad.expiresAt && (
                                            <div style={styles.adMetaRow}>
                                                <span style={styles.adMetaIcon}>🗓</span>
                                                <span style={{ ...styles.adMetaText, color: new Date(ad.expiresAt) < new Date() ? "#ef4444" : "inherit" }}>
                                                    Expires: {new Date(ad.expiresAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div style={styles.adActions}>
                                            <button
                                                style={styles.editBtn}
                                                onClick={() => handleOpenEdit(ad)}
                                                id={`edit-ad-${ad._id}`}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                Edit
                                            </button>
                                            <button
                                                style={styles.deleteBtn}
                                                onClick={() => setDeleteConfirm(ad._id)}
                                                id={`delete-ad-${ad._id}`}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Delete Confirm Modal */}
                    {deleteConfirm && (
                        <div style={styles.overlay}>
                            <div style={styles.confirmModal}>
                                <div style={{ fontSize: "40px", marginBottom: "12px" }}>🗑️</div>
                                <h3 style={{ margin: "0 0 8px", color: "#111" }}>Delete this ad?</h3>
                                <p style={{ margin: "0 0 20px", color: "#666", fontSize: "14px" }}>This action cannot be undone.</p>
                                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                                    <button style={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                                    <button style={{ ...styles.deleteBtn, padding: "10px 24px", fontSize: "14px" }} onClick={() => handleDelete(deleteConfirm)}>Delete</button>
                                </div>
                            </div>
                        </div>
                    )}


                    {/* Create/Edit Modal */}
                    {showModal && (
                        <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                            <div style={styles.modal}>

                                {/* Modal Header */}
                                <div style={styles.modalHeader}>
                                    <h2 style={styles.modalTitle}>
                                        {editingAd ? "✏️ Edit Shop Ad" : "➕ Create Shop Ad"}
                                    </h2>
                                    <button style={styles.closeBtn} onClick={() => setShowModal(false)}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} style={styles.modalBody}>
                                    {/* Live Preview */}
                                    {form.imageUrl && (
                                        <div style={styles.previewSection}>
                                            <p style={styles.previewLabel}>Live Preview</p>
                                            <div style={{
                                                ...styles.previewCard,
                                                backgroundImage: `url(${form.imageUrl})`,
                                                backgroundSize: "cover",
                                                backgroundPosition: "center",
                                            }}>
                                                <div style={styles.previewGradient} />
                                                {form.badge && (
                                                    <div style={{ ...styles.adBadge, position: "absolute", top: 10, left: 10, backgroundColor: form.badgeColor || "#FF4B6E" }}>
                                                        {form.badge}
                                                    </div>
                                                )}
                                                <div style={{ position: "relative", zIndex: 3 }}>
                                                    <div style={{ color: "#fff", fontWeight: 800, fontSize: "18px" }}>{form.shopName || "Shop Name"}</div>
                                                    <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12px" }}>{form.tagline || "Your tagline here"}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Grid Layout */}
                                    <div style={styles.formGrid}>
                                        {/* Left column */}
                                        <div style={styles.formCol}>
                                            <div style={styles.formSection}>
                                                <p style={styles.sectionTitle}>📌 Basic Information</p>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Shop Name *</label>
                                                    <input
                                                        style={styles.input}
                                                        value={form.shopName || ""}
                                                        onChange={e => setForm(p => ({ ...p, shopName: e.target.value }))}
                                                        placeholder="e.g. Gourmet Garden"
                                                        required
                                                        id="shop-ad-name-input"
                                                    />
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Tagline *</label>
                                                    <input
                                                        style={styles.input}
                                                        value={form.tagline || ""}
                                                        onChange={e => setForm(p => ({ ...p, tagline: e.target.value }))}
                                                        placeholder="e.g. Exotic Organic Produce"
                                                        required
                                                        id="shop-ad-tagline-input"
                                                    />
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Description</label>
                                                    <textarea
                                                        style={{ ...styles.input, resize: "vertical", minHeight: "70px" }}
                                                        value={form.description || ""}
                                                        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                                                        placeholder="Short description (optional)"
                                                    />
                                                </div>
                                                <div style={styles.formRow}>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>Badge Text</label>
                                                        <input
                                                            style={styles.input}
                                                            value={form.badge || ""}
                                                            onChange={e => setForm(p => ({ ...p, badge: e.target.value }))}
                                                            placeholder="PREMIUM"
                                                        />
                                                    </div>
                                                    <div style={{ ...styles.formGroup, width: "70px" }}>
                                                        <label style={styles.label}>Color</label>
                                                        <input
                                                            type="color"
                                                            style={{ ...styles.input, padding: "2px 4px", height: "42px", cursor: "pointer" }}
                                                            value={form.badgeColor || "#FF4B6E"}
                                                            onChange={e => setForm(p => ({ ...p, badgeColor: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={styles.formRow}>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>CTA Button Text</label>
                                                        <input
                                                            style={styles.input}
                                                            value={form.ctaText || ""}
                                                            onChange={e => setForm(p => ({ ...p, ctaText: e.target.value }))}
                                                            placeholder="Visit Shop"
                                                        />
                                                    </div>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>CTA Link</label>
                                                        <input
                                                            style={styles.input}
                                                            value={form.ctaLink || ""}
                                                            onChange={e => setForm(p => ({ ...p, ctaLink: e.target.value }))}
                                                            placeholder="https://..."
                                                        />
                                                    </div>
                                                </div>
                                                <div style={styles.formRow}>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>Display Order</label>
                                                        <input
                                                            type="number"
                                                            style={styles.input}
                                                            value={form.order ?? 0}
                                                            onChange={e => setForm(p => ({ ...p, order: parseInt(e.target.value) || 0 }))}
                                                            min={0}
                                                        />
                                                    </div>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>Expires On</label>
                                                        <input
                                                            type="date"
                                                            style={styles.input}
                                                            value={form.expiresAt as string || ""}
                                                            onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.switchLabel}>
                                                        <span>Active</span>
                                                        <div
                                                            style={{ ...styles.switch, backgroundColor: form.isActive ? "#10b981" : "#d1d5db" }}
                                                            onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                                                        >
                                                            <div style={{ ...styles.switchThumb, transform: form.isActive ? "translateX(22px)" : "translateX(0px)" }} />
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right column */}
                                        <div style={styles.formCol}>
                                            <div style={styles.formSection}>
                                                <p style={styles.sectionTitle}>🖼 Ad Image *</p>
                                                {/* Upload zone */}
                                                <div
                                                    style={styles.uploadZone}
                                                    onClick={() => document.getElementById("ad-image-upload")?.click()}
                                                >
                                                    {form.imageUrl ? (
                                                        <img src={form.imageUrl} alt="Preview" style={styles.uploadPreviewImg} />
                                                    ) : (
                                                        <div style={styles.uploadPlaceholder}>
                                                            {uploadingImage ? (
                                                                <><div style={styles.spinner} /><p>Uploading...</p></>
                                                            ) : (
                                                                <>
                                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>
                                                                    <p style={{ margin: "8px 0 4px", color: "#374151", fontWeight: 600 }}>Click to upload image</p>
                                                                    <p style={{ margin: 0, color: "#9ca3af", fontSize: "12px" }}>PNG, JPG, WebP — recommended 800×300</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <input
                                                    id="ad-image-upload"
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: "none" }}
                                                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                                                />
                                                {form.imageUrl && (
                                                    <button type="button" style={styles.changeImgBtn} onClick={() => document.getElementById("ad-image-upload")?.click()}>
                                                        Change Image
                                                    </button>
                                                )}
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Or paste image URL</label>
                                                    <input
                                                        style={styles.input}
                                                        value={form.imageUrl || ""}
                                                        onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                                                        placeholder="https://example.com/image.jpg"
                                                    />
                                                </div>
                                            </div>

                                            <div style={styles.formSection}>
                                                <p style={styles.sectionTitle}>👤 Shopkeeper Contact</p>
                                                <p style={styles.sectionDesc}>Record the shopkeeper/business who requested this ad placement.</p>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Requested By (Name / Business)</label>
                                                    <input
                                                        style={styles.input}
                                                        value={form.requestedBy || ""}
                                                        onChange={e => setForm(p => ({ ...p, requestedBy: e.target.value }))}
                                                        placeholder="e.g. Rahul Sharma - Gourmet Garden"
                                                    />
                                                </div>
                                                <div style={styles.formRow}>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>Phone</label>
                                                        <input
                                                            style={styles.input}
                                                            value={form.contactInfo?.phone || ""}
                                                            onChange={e => setForm(p => ({ ...p, contactInfo: { ...p.contactInfo, phone: e.target.value } }))}
                                                            placeholder="+91 9876543210"
                                                        />
                                                    </div>
                                                    <div style={{ ...styles.formGroup, flex: 1 }}>
                                                        <label style={styles.label}>Email</label>
                                                        <input
                                                            type="email"
                                                            style={styles.input}
                                                            value={form.contactInfo?.email || ""}
                                                            onChange={e => setForm(p => ({ ...p, contactInfo: { ...p.contactInfo, email: e.target.value } }))}
                                                            placeholder="shop@email.com"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div style={styles.modalFooter}>
                                        <button type="button" style={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
                                        <button
                                            type="submit"
                                            style={{ ...styles.addBtn, opacity: submitting ? 0.7 : 1 }}
                                            disabled={submitting}
                                            id="shop-ad-submit-btn"
                                        >
                                            {submitting ? "Saving..." : editingAd ? "Update Ad" : "Create Ad"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                </div>
            )}

        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        padding: "24px",
        minHeight: "100vh",
        background: "#f8f9fb",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
    },
    toast: {
        position: "fixed",
        top: "24px",
        right: "24px",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "14px",
        fontWeight: 600,
        zIndex: 9999,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        animation: "fadeInSlide 0.3s ease",
    },
    pageHeader: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: "24px",
        flexWrap: "wrap" as const,
        gap: "12px",
    },
    pageTitle: {
        margin: "0 0 4px",
        fontSize: "24px",
        fontWeight: 800,
        color: "#111827",
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    pageTitleIcon: { fontSize: "22px" },
    pageSubtitle: {
        margin: 0,
        color: "#6b7280",
        fontSize: "14px",
        maxWidth: "500px",
    },
    addBtn: {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        background: "linear-gradient(135deg, #FF4B6E, #FF8C42)",
        color: "#fff",
        border: "none",
        borderRadius: "12px",
        fontSize: "14px",
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(255,75,110,0.35)",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap" as const,
    },
    statsRow: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
    },
    statCard: {
        background: "#fff",
        borderRadius: "14px",
        padding: "16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid #f0f0f0",
    },
    statIcon: {
        width: "44px",
        height: "44px",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "20px",
        flexShrink: 0,
    },
    statValue: { fontSize: "22px", fontWeight: 800, lineHeight: 1 },
    statLabel: { fontSize: "12px", color: "#6b7280", marginTop: "2px" },
    loadingContainer: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        padding: "60px",
        gap: "12px",
    },
    spinner: {
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        border: "3px solid #f3f3f3",
        borderTop: "3px solid #FF4B6E",
        animation: "spin 0.8s linear infinite",
    },
    loadingText: { color: "#6b7280", fontSize: "14px" },
    emptyState: {
        textAlign: "center" as const,
        padding: "60px 24px",
        background: "#fff",
        borderRadius: "20px",
        border: "2px dashed #e5e7eb",
    },
    emptyIcon: { fontSize: "48px", marginBottom: "16px" },
    emptyTitle: { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#111" },
    emptyDesc: { margin: "0 0 24px", color: "#6b7280", maxWidth: "400px", marginLeft: "auto", marginRight: "auto" },
    adsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "20px",
    },
    adCard: {
        background: "#fff",
        borderRadius: "18px",
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        border: "1px solid #f0f0f0",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
    },
    adImageWrapper: {
        position: "relative",
        height: "160px",
        overflow: "hidden",
    },
    adImage: {
        width: "100%",
        height: "100%",
        objectFit: "cover" as const,
    },
    adImageOverlay: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.5))",
    },
    adBadge: {
        position: "absolute",
        top: "10px",
        left: "10px",
        padding: "3px 10px",
        borderRadius: "50px",
        fontSize: "10px",
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
    },
    adOrder: {
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "rgba(0,0,0,0.5)",
        color: "#fff",
        fontSize: "11px",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: "20px",
        backdropFilter: "blur(4px)",
    },
    adStatusToggle: {
        position: "absolute",
        bottom: "10px",
        right: "10px",
        color: "#fff",
        fontSize: "10px",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: "20px",
        border: "none",
        cursor: "pointer",
        letterSpacing: "0.04em",
    },
    adCardBody: {
        padding: "16px",
    },
    adCardTitle: {
        margin: "0 0 4px",
        fontSize: "16px",
        fontWeight: 700,
        color: "#111827",
    },
    adCardTagline: {
        margin: "0 0 10px",
        fontSize: "12px",
        color: "#6b7280",
        lineHeight: 1.4,
    },
    adMetaRow: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "4px",
    },
    adMetaIcon: { fontSize: "12px" },
    adMetaText: {
        fontSize: "12px",
        color: "#374151",
    },
    adActions: {
        display: "flex",
        gap: "8px",
        marginTop: "14px",
        paddingTop: "14px",
        borderTop: "1px solid #f0f0f0",
    },
    editBtn: {
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: "8px 0",
        backgroundColor: "#f0fdf4",
        color: "#16a34a",
        border: "1px solid #bbf7d0",
        borderRadius: "10px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s",
    },
    deleteBtn: {
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: "8px 0",
        backgroundColor: "#fff5f5",
        color: "#ef4444",
        border: "1px solid #fecaca",
        borderRadius: "10px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s",
    },
    overlay: {
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
    },
    confirmModal: {
        background: "#fff",
        borderRadius: "20px",
        padding: "32px",
        textAlign: "center" as const,
        maxWidth: "360px",
        width: "100%",
        boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
    },
    modal: {
        background: "#fff",
        borderRadius: "20px",
        width: "100%",
        maxWidth: "860px",
        maxHeight: "90vh",
        overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column" as const,
    },
    modalHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        borderBottom: "1px solid #f0f0f0",
        flexShrink: 0,
    },
    modalTitle: {
        margin: 0,
        fontSize: "18px",
        fontWeight: 700,
        color: "#111827",
    },
    closeBtn: {
        background: "#f3f4f6",
        border: "none",
        borderRadius: "8px",
        width: "32px",
        height: "32px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#374151",
    },
    modalBody: {
        overflowY: "auto" as const,
        flexGrow: 1,
        padding: "24px",
        display: "flex",
        flexDirection: "column" as const,
        gap: "16px",
    },
    previewSection: {
        marginBottom: "4px",
    },
    previewLabel: {
        margin: "0 0 8px",
        fontSize: "12px",
        fontWeight: 600,
        color: "#6b7280",
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
    },
    previewCard: {
        position: "relative",
        height: "120px",
        borderRadius: "14px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column" as const,
        justifyContent: "flex-end",
        padding: "14px",
    },
    previewGradient: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(135deg, rgba(0,0,0,0.1), rgba(0,0,0,0.65))",
        borderRadius: "14px",
    },
    formGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px",
    },
    formCol: { display: "flex", flexDirection: "column" as const, gap: "16px" },
    formSection: {
        background: "#f9fafb",
        borderRadius: "14px",
        padding: "16px",
        border: "1px solid #f0f0f0",
    },
    sectionTitle: {
        margin: "0 0 14px",
        fontSize: "13px",
        fontWeight: 700,
        color: "#374151",
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
    },
    sectionDesc: {
        margin: "0 0 12px",
        fontSize: "12px",
        color: "#6b7280",
        lineHeight: 1.5,
    },
    formGroup: { marginBottom: "12px" },
    formRow: { display: "flex", gap: "10px" },
    label: {
        display: "block",
        fontSize: "12px",
        fontWeight: 600,
        color: "#374151",
        marginBottom: "5px",
    },
    input: {
        width: "100%",
        padding: "10px 12px",
        border: "1.5px solid #e5e7eb",
        borderRadius: "10px",
        fontSize: "13px",
        color: "#111827",
        background: "#fff",
        outline: "none",
        transition: "border-color 0.2s",
        boxSizing: "border-box" as const,
        fontFamily: "inherit",
    },
    switchLabel: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 600,
        color: "#374151",
    },
    switch: {
        width: "46px",
        height: "24px",
        borderRadius: "50px",
        position: "relative" as const,
        cursor: "pointer",
        transition: "background-color 0.3s",
    },
    switchThumb: {
        position: "absolute" as const,
        top: "2px",
        left: "2px",
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        transition: "transform 0.3s ease",
    },
    uploadZone: {
        border: "2px dashed #e5e7eb",
        borderRadius: "12px",
        minHeight: "120px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        cursor: "pointer",
        overflow: "hidden",
        marginBottom: "8px",
        transition: "border-color 0.2s",
        backgroundColor: "#fff",
    },
    uploadPreviewImg: {
        width: "100%",
        height: "100%",
        objectFit: "cover" as const,
        borderRadius: "8px",
        maxHeight: "120px",
    },
    uploadPlaceholder: {
        textAlign: "center" as const,
        color: "#6b7280",
        fontSize: "13px",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
    },
    changeImgBtn: {
        background: "none",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "5px 12px",
        fontSize: "12px",
        color: "#374151",
        cursor: "pointer",
        marginBottom: "8px",
        fontWeight: 500,
    },
    modalFooter: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "12px",
        paddingTop: "16px",
        borderTop: "1px solid #f0f0f0",
        marginTop: "4px",
        flexShrink: 0,
    },
    cancelBtn: {
        padding: "10px 20px",
        background: "#f3f4f6",
        color: "#374151",
        border: "none",
        borderRadius: "12px",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
    },
};

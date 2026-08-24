import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getInquiries,
  replyToInquiry,
  deleteInquiry,
  type Inquiry,
} from "../../../services/api/admin/adminContactService";
import { useToast } from "../../../context/ToastContext";

export default function AdminContact() {
  const { showToast } = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);

  // Search & Status Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Replied">("All");

  // Reply Form State
  const [replyData, setReplyData] = useState({
    subject: "",
    message: "",
  });
  const [isSending, setIsSending] = useState(false);
  const [subjectError, setSubjectError] = useState("");
  const [replyMessageError, setReplyMessageError] = useState("");

  // Deletion Modal State
  const [deleteTarget, setDeleteTarget] = useState<Inquiry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getInquiries({
        search: debouncedSearch || undefined,
        status: statusFilter !== "All" ? statusFilter : undefined,
      });

      if (response.success && Array.isArray(response.data)) {
        setInquiries(response.data);
        // Maintain selection or select first
        if (selectedInquiry) {
          const updated = response.data.find((i: Inquiry) => i._id === selectedInquiry._id);
          if (updated) {
            setSelectedInquiry(updated);
          }
        }
      } else {
        setInquiries([]);
      }
    } catch (error: any) {
      console.error("Error fetching inquiries:", error);
      showToast(error.response?.data?.message || "Failed to fetch inquiries", "error");
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, showToast, selectedInquiry]);

  useEffect(() => {
    fetchInquiries();
  }, [debouncedSearch, statusFilter]);

  const handleSelectInquiry = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setSubjectError("");
    setReplyMessageError("");
    setReplyData({
      subject: inquiry.subject
        ? `Regarding your inquiry: ${inquiry.subject}`
        : "Regarding your inquiry to HelloLocal",
      message: "",
    });
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;

    let hasError = false;
    const subject = replyData.subject.trim();
    const message = replyData.message.trim();

    if (!subject) {
      setSubjectError("Email subject is required");
      hasError = true;
    } else if (subject.length < 5) {
      setSubjectError("Subject must be at least 5 characters");
      hasError = true;
    } else {
      setSubjectError("");
    }

    if (!message) {
      setReplyMessageError("Reply message is required");
      hasError = true;
    } else if (message.length < 10) {
      setReplyMessageError("Message must be at least 10 characters");
      hasError = true;
    } else {
      setReplyMessageError("");
    }

    if (hasError) return;

    setIsSending(true);
    try {
      const response = await replyToInquiry({
        inquiryId: selectedInquiry._id,
        email: selectedInquiry.email,
        subject,
        message,
      });

      if (response.success) {
        showToast(`Reply sent to ${selectedInquiry.email} successfully!`, "success");
        setSubjectError("");
        setReplyMessageError("");
        setReplyData({ subject: "", message: "" });
        
        // Update local inquiry status
        setSelectedInquiry((prev) =>
          prev
            ? {
                ...prev,
                status: "Replied",
                repliedAt: new Date().toISOString(),
                replySubject: subject,
                replyMessage: message,
              }
            : null
        );
        setInquiries((prev) =>
          prev.map((i) =>
            i._id === selectedInquiry._id
              ? {
                  ...i,
                  status: "Replied",
                  repliedAt: new Date().toISOString(),
                  replySubject: subject,
                  replyMessage: message,
                }
              : i
          )
        );
      }
    } catch (error: any) {
      console.error("Error sending reply:", error);
      showToast(error.response?.data?.message || "Failed to send email reply", "error");
    } finally {
      setIsSending(false);
    }
  };

  const confirmDeleteInquiry = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await deleteInquiry(deleteTarget._id);
      if (response.success) {
        showToast("Inquiry deleted successfully", "success");
        setInquiries((prev) => prev.filter((i) => i._id !== deleteTarget._id));
        if (selectedInquiry?._id === deleteTarget._id) {
          setSelectedInquiry(null);
        }
        setDeleteTarget(null);
      } else {
        showToast(response.message || "Failed to delete inquiry", "error");
      }
    } catch (error: any) {
      console.error("Error deleting inquiry:", error);
      showToast(error.response?.data?.message || "Error deleting inquiry", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingCount = inquiries.filter((i) => (i.status || "Pending") === "Pending").length;
  const repliedCount = inquiries.filter((i) => i.status === "Replied").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            Contact Inquiries & Support Desk
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Review inbound website queries, manage resolution states, and dispatch direct email replies
          </p>
        </div>

        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500">
          <Link
            to="/admin/dashboard"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">Contact Inquiries</span>
        </nav>
      </div>

      {/* Main Support Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Inquiries Queue */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden flex flex-col h-[750px]">
          {/* Header */}
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              Inbound Tickets ({inquiries.length})
            </h2>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="bg-amber-400 text-neutral-900 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {pendingCount} Pending
              </span>
              <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px]">
                {repliedCount} Replied
              </span>
            </div>
          </div>

          {/* Search & Status Filters */}
          <div className="p-3.5 border-b border-neutral-200/70 bg-neutral-50/50 space-y-2.5">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search sender, email, subject..."
                className="w-full pl-8 pr-7 py-2 border border-neutral-300 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[40px]"
              />
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs font-bold"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5">
              {(["All", "Pending", "Replied"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    statusFilter === tab
                      ? "bg-rose-700 text-white shadow-sm"
                      : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Inquiry List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-rose-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-neutral-500 font-medium">Loading inquiries...</p>
              </div>
            ) : inquiries.length === 0 ? (
              <div className="p-10 text-center text-neutral-400">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-50">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <p className="text-xs font-bold text-neutral-700">No inquiries found</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  {searchTerm ? `No results matching "${searchTerm}"` : "Inbound messages will appear here"}
                </p>
              </div>
            ) : (
              inquiries.map((inquiry) => {
                const isSelected = selectedInquiry?._id === inquiry._id;
                const isReplied = inquiry.status === "Replied";

                return (
                  <div
                    key={inquiry._id}
                    onClick={() => handleSelectInquiry(inquiry)}
                    className={`p-4 cursor-pointer transition-colors relative ${
                      isSelected
                        ? "bg-rose-50/70 border-l-4 border-rose-700"
                        : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-bold text-neutral-900 text-xs truncate max-w-[180px]">
                        {inquiry.name}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isReplied
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isReplied ? "Replied" : "Pending"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(inquiry);
                          }}
                          className="text-neutral-400 hover:text-red-600 p-1 rounded transition-colors"
                          title="Delete inquiry"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] text-neutral-500 truncate mb-1">
                      {inquiry.email}
                    </div>

                    {inquiry.subject && (
                      <div className="text-xs font-semibold text-neutral-800 truncate mb-0.5">
                        {inquiry.subject}
                      </div>
                    )}

                    <p className="text-[11px] text-neutral-600 line-clamp-2 leading-relaxed">
                      {inquiry.message}
                    </p>

                    <div className="text-[10px] text-neutral-400 font-mono mt-1.5">
                      {formatDate(inquiry.createdAt)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Inquiry Details & Email Dispatch */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden flex flex-col h-[750px]">
          {selectedInquiry ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Inquiry Header */}
              <div className="p-5 border-b border-neutral-200/80 bg-neutral-50/60">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900">
                      {selectedInquiry.name}
                    </h2>
                    <p className="text-xs font-mono text-neutral-500 mt-0.5">
                      ✉️ {selectedInquiry.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        selectedInquiry.status === "Replied"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {selectedInquiry.status === "Replied" ? "✓ Replied" : "⏳ Pending Response"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selectedInquiry)}
                      className="text-neutral-400 hover:text-red-600 p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-red-50 transition-colors"
                      title="Delete inquiry"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Sender Message Card */}
                <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-bold uppercase tracking-wider">
                    <span>
                      {selectedInquiry.subject ? `Subject: ${selectedInquiry.subject}` : "Inquiry Message"}
                    </span>
                    <span className="font-mono text-[10px] normal-case text-neutral-400">
                      {formatDate(selectedInquiry.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed">
                    {selectedInquiry.message}
                  </p>
                </div>

                {/* Sent Reply Card if previously resolved */}
                {selectedInquiry.status === "Replied" && selectedInquiry.replyMessage && (
                  <div className="mt-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 text-xs text-emerald-950 space-y-1">
                    <div className="flex items-center justify-between font-bold text-emerald-900 text-[11px]">
                      <span>✓ Previous Reply Sent</span>
                      <span className="text-[10px] font-mono text-emerald-700">
                        {formatDate(selectedInquiry.repliedAt)}
                      </span>
                    </div>
                    {selectedInquiry.replySubject && (
                      <p className="text-emerald-800 font-semibold text-[11px]">
                        Subject: {selectedInquiry.replySubject}
                      </p>
                    )}
                    <p className="text-emerald-900 text-[11px] whitespace-pre-wrap">
                      {selectedInquiry.replyMessage}
                    </p>
                  </div>
                )}
              </div>

              {/* Compose Reply Form */}
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-3 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>Compose Email Reply to {selectedInquiry.email}</span>
                </h3>

                <form onSubmit={handleReplySubmit} className="space-y-3.5 flex-1 flex flex-col">
                  {/* Subject Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="replySubjectInput" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                        Email Subject <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] font-mono text-neutral-400">
                        {replyData.subject.length}/200
                      </span>
                    </div>
                    <input
                      id="replySubjectInput"
                      type="text"
                      value={replyData.subject}
                      onChange={(e) => {
                        setReplyData({ ...replyData, subject: e.target.value.slice(0, 200) });
                        if (subjectError) setSubjectError("");
                      }}
                      maxLength={200}
                      disabled={isSending}
                      className={`w-full px-3 py-2 border rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none min-h-[44px] ${
                        subjectError ? "border-red-400 bg-red-50/20" : "border-neutral-300"
                      }`}
                    />
                    {subjectError && <p className="text-[11px] font-semibold text-red-500 mt-1">{subjectError}</p>}
                  </div>

                  {/* Message Input */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="replyMessageTextarea" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                        Reply Body <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] font-mono text-neutral-400">
                        {replyData.message.length}/2000
                      </span>
                    </div>
                    <textarea
                      id="replyMessageTextarea"
                      value={replyData.message}
                      onChange={(e) => {
                        setReplyData({ ...replyData, message: e.target.value.slice(0, 2000) });
                        if (replyMessageError) setReplyMessageError("");
                      }}
                      placeholder="Write your email reply to the customer (min 10 characters)..."
                      maxLength={2000}
                      disabled={isSending}
                      className={`w-full flex-1 min-h-[140px] px-3 py-2 border rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 outline-none resize-none ${
                        replyMessageError ? "border-red-400 bg-red-50/20" : "border-neutral-300"
                      }`}
                    />
                    {replyMessageError && <p className="text-[11px] font-semibold text-red-500 mt-1">{replyMessageError}</p>}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isSending ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending Email Reply...</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        <span>Send Reply via Email</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400">
              <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-3 text-neutral-400">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <p className="text-sm font-bold text-neutral-800">Select an inquiry</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Choose a ticket from the left panel to inspect message details and send email responses
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  Delete Contact Inquiry
                </h3>
                <p className="text-xs text-neutral-500">
                  This inquiry will be permanently deleted from the database.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 text-xs text-neutral-700 space-y-1">
              <p>
                <span className="font-bold">Sender:</span> {deleteTarget.name} ({deleteTarget.email})
              </p>
              {deleteTarget.subject && (
                <p>
                  <span className="font-bold">Subject:</span> {deleteTarget.subject}
                </p>
              )}
              <p className="line-clamp-2 text-neutral-500">
                <span className="font-bold text-neutral-700">Message:</span> {deleteTarget.message}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteInquiry}
                disabled={isDeleting}
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Customer Support Desk
      </footer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { getInquiries, replyToInquiry, Inquiry } from '../../../services/api/admin/adminContactService';
import { useToast } from '../../../context/ToastContext';

export default function AdminContact() {
  const { showToast } = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [replyData, setReplyData] = useState({
    subject: '',
    message: ''
  });
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchInquiries();
  }, []);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const response = await getInquiries();
      if (response.success) {
        setInquiries(response.data);
      }
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      showToast('Failed to fetch inquiries', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInquiry = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setReplyData({
      subject: inquiry.subject ? `Regarding your inquiry: ${inquiry.subject}` : 'Regarding your inquiry to HelloLocal',
      message: ''
    });
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;

    setIsSending(true);
    try {
      const response = await replyToInquiry({
        email: selectedInquiry.email,
        subject: replyData.subject,
        message: replyData.message
      });

      if (response.success) {
        showToast('Reply sent successfully!', 'success');
        setReplyData({ subject: '', message: '' });
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to send reply', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-neutral-800">Contact Inquiries</h1>
          <div className="text-sm">
            <span className="text-blue-600">Home</span>
            <span className="text-neutral-400 mx-1">/</span>
            <span className="text-neutral-600">Contact Inquiries</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Inquiries List */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden flex flex-col h-[70vh]">
            <div className="bg-neutral-800 text-white px-6 py-4">
              <h2 className="text-lg font-semibold">User Inquiries</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                </div>
              ) : inquiries.length === 0 ? (
                <div className="p-8 text-center text-neutral-400">No inquiries found</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {inquiries.map((inquiry) => (
                    <div
                      key={inquiry._id}
                      onClick={() => handleSelectInquiry(inquiry)}
                      className={`p-4 cursor-pointer hover:bg-neutral-50 transition-colors ${selectedInquiry?._id === inquiry._id ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-neutral-800 truncate">{inquiry.name}</h3>
                        <span className="text-[10px] text-neutral-400 whitespace-nowrap">{formatDate(inquiry.createdAt)}</span>
                      </div>
                      <p className="text-xs text-neutral-500 mb-2 truncate">{inquiry.email}</p>
                      <p className="text-sm text-neutral-600 line-clamp-2">{inquiry.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Inquiry Details & Reply */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-neutral-200 flex flex-col h-[70vh]">
            {selectedInquiry ? (
              <>
                <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-neutral-800">{selectedInquiry.name}</h2>
                      <p className="text-sm text-neutral-500">{selectedInquiry.email}</p>
                    </div>
                    <span className="px-3 py-1 bg-neutral-200 text-neutral-700 rounded-full text-xs font-medium">
                      Received: {formatDate(selectedInquiry.createdAt)}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-neutral-200">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase mb-2">Message</h4>
                    <p className="text-neutral-700 whitespace-pre-wrap">{selectedInquiry.message}</p>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col overflow-y-auto">
                  <h3 className="text-lg font-bold text-neutral-800 mb-4">Reply via Email</h3>
                  <form onSubmit={handleReplySubmit} className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">Subject</label>
                      <input
                        type="text"
                        value={replyData.subject}
                        onChange={(e) => setReplyData({ ...replyData, subject: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-neutral-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-neutral-700 mb-2">Message</label>
                      <textarea
                        value={replyData.message}
                        onChange={(e) => setReplyData({ ...replyData, message: e.target.value })}
                        required
                        placeholder="Write your reply here..."
                        className="w-full px-4 py-2 border border-neutral-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none h-full min-h-[150px]"
                      ></textarea>
                    </div>
                    <button
                      type="submit"
                      disabled={isSending}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg shadow-lg shadow-orange-200 transition-all disabled:opacity-50"
                    >
                      {isSending ? 'Sending Reply...' : 'Send Reply via Email'}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-20">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <p className="text-lg">Select an inquiry to view details and reply</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

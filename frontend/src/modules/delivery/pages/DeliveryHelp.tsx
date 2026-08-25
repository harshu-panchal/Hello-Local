import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { getHelpSupport } from '../../../services/api/delivery/deliveryService';
import { useToast } from '../../../context/ToastContext';

// Icon mapping helper
const getIcon = (iconName: string) => {
  if (iconName === 'phone') return '📞';
  if (iconName === 'email') return '✉️';
  if (iconName === 'chat') return '💬';
  return 'ℹ️';
};

export default function DeliveryHelp() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [faqs, setFaqs] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const fetchHelp = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await getHelpSupport();
      setFaqs(data.faqs || []);
      setContacts(data.contact || []);

      if (isManualRefresh) {
        showToast('Help & support data refreshed', 'success');
      }
    } catch (error: any) {
      console.error("Failed to load help data", error);
      showToast(error.message || 'Failed to load help content', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchHelp();
  }, [fetchHelp]);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <DeliveryHeader />
        <div className="px-4 py-4 space-y-3 animate-pulse max-w-lg mx-auto">
          <div className="h-8 bg-slate-200 rounded-xl w-1/3" />
          <div className="h-36 bg-slate-200 rounded-3xl" />
          <div className="h-44 bg-slate-200 rounded-3xl" />
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Header with Live Refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700"
              aria-label="Go back"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <h2 className="text-slate-900 text-xl font-black tracking-tight">Help & Support</h2>
          </div>

          <button
            onClick={() => fetchHelp(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 active:scale-95 transition-all min-h-[40px]"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Contact Channels Grid */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 p-5 space-y-3">
          <h3 className="text-slate-900 font-black text-sm">Direct Contact Channels</h3>
          <div className="grid grid-cols-1 gap-2.5">
            {contacts.map((option, index) => (
              <button
                key={index}
                onClick={() => {
                  if (option.icon === 'phone') window.location.href = `tel:${option.value}`;
                  else if (option.icon === 'email') window.location.href = `mailto:${option.value}`;
                  else if (option.value) window.open(option.value, '_blank');
                }}
                className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100/80 active:scale-[0.99] transition-all flex items-center justify-between text-left min-h-[48px]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl bg-white p-2 rounded-xl shadow-2xs border border-slate-100">
                    {getIcon(option.icon)}
                  </span>
                  <div>
                    <p className="text-slate-900 text-xs sm:text-sm font-bold">{option.label}</p>
                    <p className="text-slate-500 text-[11px] font-medium">{option.value}</p>
                  </div>
                </div>
                <span className="text-emerald-700 font-black text-xs bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                  Tap to Connect
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* FAQ Section with Search & Accordion */}
        <div className="bg-white rounded-3xl shadow-2xs border border-slate-200/80 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-900 font-black text-sm">Frequently Asked Questions</h3>
            <span className="text-[11px] text-slate-400 font-bold">{filteredFaqs.length} Guides</span>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search delivery questions..."
              className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[44px]"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* FAQ Accordion List */}
          <div className="divide-y divide-slate-100 pt-1">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((item, index) => {
                const isOpen = expandedFaq === index;
                return (
                  <div key={index} className="py-2.5">
                    <button
                      onClick={() => toggleFaq(index)}
                      className="w-full flex items-center justify-between text-left gap-2 py-1.5 focus:outline-none min-h-[44px]"
                    >
                      <p className="text-slate-900 text-xs sm:text-sm font-bold">{item.question}</p>
                      <span className={`text-slate-400 text-xs font-bold transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {isOpen && (
                      <div className="pt-1.5 pb-2 text-slate-600 text-xs leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 mt-1">
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs font-medium">
                No matching answers found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Primary Support Action */}
        <button
          onClick={() => {
            const phone = contacts.find((c) => c.icon === 'phone');
            const email = contacts.find((c) => c.icon === 'email');
            if (phone) window.location.href = `tel:${phone.value}`;
            else if (email) window.location.href = `mailto:${email.value}`;
            else showToast('Support line available during operational hours', 'info');
          }}
          className="w-full bg-emerald-600 text-white rounded-2xl py-3.5 font-black text-xs sm:text-sm hover:bg-emerald-700 transition-all shadow-xs active:scale-[0.98] min-h-[44px]"
        >
          📞 Call Partner Helpline
        </button>
      </div>
      <DeliveryBottomNav />
    </div>
  );
}

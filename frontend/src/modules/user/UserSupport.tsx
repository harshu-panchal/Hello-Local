import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  {
    category: 'Orders & Delivery',
    question: 'How fast is Hello Local delivery?',
    answer: 'We connect you directly with neighborhood retail shops within your local area. Most daily essentials, fruits, vegetables, and packaged groceries arrive within 10 to 15 minutes depending on traffic and courier proximity.',
  },
  {
    category: 'Orders & Delivery',
    question: 'Can I track my delivery rider in real time?',
    answer: 'Yes! Once a nearby delivery partner accepts your order, you can track their route live from the "My Orders" screen. You will also receive an OTP that you must share with the delivery partner upon arrival to confirm receipt.',
  },
  {
    category: 'Returns & Refunds',
    question: 'What is the return and refund policy for damaged or missing goods?',
    answer: 'If you receive damaged, expired, or incorrect products, you can submit a return request through "My Orders" within 24 hours of delivery. Once verified, refunds are credited immediately to your Hello Local Wallet or within 3–5 business days to your original UPI/bank account.',
  },
  {
    category: 'Payments & Invoicing',
    question: 'What payment options are accepted and can I get a GST invoice?',
    answer: 'We accept UPI (Google Pay, PhonePe, Paytm, BHIM), Credit/Debit Cards, Net Banking, and Cash on Delivery (COD). You can also add your business GSTIN under Account Settings to automatically receive GST-compliant invoices.',
  },
  {
    category: 'Cancellations',
    question: 'Can I cancel my order after placing it?',
    answer: 'You can cancel free of charge before the merchant packs your order. Once the delivery executive has collected the package from the store, cancellations cannot be processed through the app. Please contact support immediately if an emergency arises.',
  },
];

export default function UserSupport() {
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const contactInfo = {
    name: 'Vivek Jagdale',
    email: 'hellolocal.in@gmail.com',
    mobile: '+91 9960700792',
    phoneRaw: '+919960700792',
    hours: 'Mon – Sun: 7:00 AM – 11:00 PM IST',
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16 text-slate-800">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors border border-slate-200/60"
              aria-label="Go back"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-[#FF8A00]">Hello</span>
                <span className="text-base font-extrabold text-[#FF2E7A]">Local</span>
                <span className="text-xs font-bold text-slate-400">/ Support</span>
              </div>
              <h1 className="text-xs text-slate-500 font-semibold">Customer Care & Grievance Desk</h1>
            </div>
          </div>

          <Link
            to="/privacy"
            className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] hover:underline px-2.5 py-1 rounded-lg bg-[#FFF1F4] border border-[#FFE4EA] transition-colors"
          >
            Privacy Policy →
          </Link>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-[#FFF5F7] via-white to-[#FFF9F2] rounded-3xl border border-[#FFE4EA] p-6 sm:p-8 text-center shadow-xs">
          <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-white border border-[#FFE4EA] shadow-2xs flex items-center justify-center text-2xl text-[#FF2E7A]">
            🎧
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            How Can We Assist You Today?
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto mt-1.5 font-medium leading-relaxed">
            Need help with an ongoing 10-minute order, instant wallet refund, damaged product, or payment inquiry? Our dedicated team is here to help.
          </p>

          {/* Quick Support Channels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto mt-6">
            <a
              href={`tel:${contactInfo.phoneRaw}`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#FF2E7A] hover:bg-[#E02269] text-white rounded-2xl text-xs sm:text-sm font-bold shadow-xs active:scale-[0.98] transition-all"
            >
              <span>📞</span>
              <span>Call Helpline</span>
            </a>
            <a
              href={`mailto:${contactInfo.email}?subject=Hello%20Local%20Customer%20Support`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl text-xs sm:text-sm font-bold border border-slate-200/80 shadow-2xs active:scale-[0.98] transition-all"
            >
              <span>✉️</span>
              <span>Email Support</span>
            </a>
          </div>
        </div>

        {/* Nodal Officer & Direct Contact Box */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF2E7A] bg-[#FFF1F4] border border-[#FFE4EA] px-2.5 py-0.5 rounded-full">
                Designated Officer
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
                Customer Support & Grievance Redressal
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Under the Information Technology Act & Consumer Protection (E-Commerce) Rules
              </p>
            </div>
            <div className="text-xs text-slate-500 font-semibold bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/60 flex items-center gap-2 self-start md:self-center">
              <span>🕒</span>
              <span>{contactInfo.hours}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
            {/* Officer Name */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Representative / Officer</span>
              <p className="text-sm sm:text-base font-black text-slate-900">{contactInfo.name}</p>
              <p className="text-xs text-slate-500 font-medium">Head of Customer Experience</p>
            </div>

            {/* Email Contact */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1 relative">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Official Email</span>
              <p className="text-xs sm:text-sm font-bold text-slate-900 break-all">
                <a href={`mailto:${contactInfo.email}`} className="text-[#FF2E7A] hover:underline">
                  {contactInfo.email}
                </a>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(contactInfo.email, 'email')}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 transition-colors"
                >
                  {copiedField === 'email' ? '✓ Copied' : 'Copy Email'}
                </button>
              </div>
            </div>

            {/* Phone Contact */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1 relative">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Helpline & Phone</span>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                <a href={`tel:${contactInfo.phoneRaw}`} className="text-[#FF2E7A] hover:underline">
                  {contactInfo.mobile}
                </a>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(contactInfo.mobile, 'phone')}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 transition-colors"
                >
                  {copiedField === 'phone' ? '✓ Copied' : 'Copy Phone'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Common Issue Resolution Cards */}
        <div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 mb-3">
            Common Support Topics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">⚡</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">10-15 Min Order Live Status</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Track assigned delivery partner coordinates and store dispatch updates in real time.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">🔄</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Damaged & Return Goods</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Report damaged or missing items within 24 hours for instant wallet refunds.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">👛</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Wallet & Refunds</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Automatic refunds credited straight to your Hello Local Wallet for next purchases.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">🧾</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">GST Invoice Downloads</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Download tax invoice receipts directly from your completed order summary.
              </p>
            </div>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">Frequently Asked Questions</h3>
              <p className="text-xs text-slate-500 font-medium">Quick answers regarding shopping on Hello Local</p>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-xl">
              {faqs.length} Answers
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div key={index} className="py-3">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-3 text-left py-1 hover:text-[#FF2E7A] transition-colors focus:outline-none"
                  >
                    <span className="text-xs sm:text-sm font-bold text-slate-900">{faq.question}</span>
                    <span className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 bg-[#FFF1F4] text-[#FF2E7A]' : 'text-slate-500'}`}>
                      ▼
                    </span>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <div className="pt-2 text-xs sm:text-sm text-slate-600 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-2xl border border-slate-100 mt-2">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-center py-4 space-y-2 border-t border-slate-200/60">
          <p className="text-xs text-slate-500 font-medium">
            Hello Local Technologies Pvt. Ltd. • Empowering Neighborhood Commerce
          </p>
          <div className="flex justify-center items-center gap-4 text-xs font-bold text-slate-600">
            <Link to="/privacy" className="hover:text-[#FF2E7A] transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link to="/about-us" className="hover:text-[#FF2E7A] transition-colors">About Us</Link>
            <span>•</span>
            <Link to="/faq" className="hover:text-[#FF2E7A] transition-colors">FAQs</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

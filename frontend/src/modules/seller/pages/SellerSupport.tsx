import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface SellerFAQ {
  question: string;
  answer: string;
  tag: string;
}

const sellerFaqs: SellerFAQ[] = [
  {
    tag: 'Onboarding & KYC',
    question: 'How do I get my store verified and approved on Hello Local?',
    answer: 'Once you sign up on the Hello Local Seller portal, complete your store profile in "Account Settings" with valid PAN details, GSTIN (if applicable), store address, and bank account for payouts. Our merchant verification team typically reviews and activates merchant stores within 24–48 hours.',
  },
  {
    tag: 'POS & Inventory',
    question: 'How does the POS / Quick Billing feature work with our physical store?',
    answer: 'The integrated POS Billing screen lets you scan barcodes or quickly search inventory to generate customer bills directly at your retail counter. All sales are tracked in your daily bills and automatically reflect in your sales reports.',
  },
  {
    tag: 'Orders & Handover',
    question: 'What is the procedure when an online order arrives?',
    answer: 'You will receive real-time audio and push alerts when a customer places an order. Simply accept the order, pack the items, and click "Ready for Pickup". An assigned Hello Local delivery partner will arrive at your store with the order ID to collect the parcel.',
  },
  {
    tag: 'Wallet & Payouts',
    question: 'How and when are store payouts credited to my bank account?',
    answer: 'Net sales (after platform commission) are credited to your Seller Wallet upon order completion. You can request a withdrawal to your registered bank account directly from the Wallet tab at any time.',
  },
  {
    tag: 'Delivery Radius',
    question: 'How do I adjust my store delivery service radius?',
    answer: 'Go to "Account Settings" → "Store Location & Service Radius". You can pin your store on Google Maps and set your service radius (typically 5 to 15 km) to target neighborhood buyers.',
  },
];

export default function SellerSupport() {
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const contactInfo = {
    name: 'Vivek Jagdale',
    email: 'hellolocal.in@gmail.com',
    mobile: '+91 9960700792',
    phoneRaw: '+919960700792',
    hours: 'Mon – Sun: 8:00 AM – 10:00 PM IST',
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-lg user-safe-top">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-700"
              aria-label="Back"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-purple-400">Hello Local</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                  Seller Hub
                </span>
              </div>
              <h1 className="text-xs text-slate-400 font-medium">Merchant Help & Partner Escalations</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/seller/privacy"
              className="text-xs font-bold text-purple-300 hover:text-white px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              Seller Privacy →
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-850 to-purple-950/40 rounded-3xl border border-slate-700/80 p-6 sm:p-8 text-center shadow-xl">
          <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-2xl text-purple-400 shadow-inner">
            🏪
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Seller Partner Support Desk
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto mt-2 font-normal leading-relaxed">
            Need urgent help with product approvals, catalog synchronization, POS billing, or settlement payouts? Our merchant relationship team is here to assist your store.
          </p>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto mt-6">
            <a
              href={`tel:${contactInfo.phoneRaw}`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-all"
            >
              <span>📞</span>
              <span>Call Merchant Helpline</span>
            </a>
            <a
              href={`mailto:${contactInfo.email}?subject=Hello%20Local%20Seller%20Support`}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-2xl text-xs sm:text-sm font-bold border border-slate-700 shadow-sm active:scale-[0.98] transition-all"
            >
              <span>✉️</span>
              <span>Email Support</span>
            </a>
          </div>
        </div>

        {/* Nodal Officer & Escalation Desk */}
        <div className="bg-slate-800/90 rounded-3xl border border-slate-700 p-5 sm:p-7 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-700/80">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 bg-purple-950/80 border border-purple-800 px-2.5 py-0.5 rounded-full">
                Seller Relationship & Operations Lead
              </span>
              <h3 className="text-base sm:text-lg font-black text-white mt-1">
                Merchant Operations & Partner Redressal
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Direct escalation channel for registered shopkeepers and wholesale partners
              </p>
            </div>
            <div className="text-xs text-slate-300 font-semibold bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-2 self-start md:self-center">
              <span>🕒</span>
              <span>{contactInfo.hours}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
            {/* Officer Name */}
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Relationship Lead</span>
              <p className="text-sm sm:text-base font-black text-white">{contactInfo.name}</p>
              <p className="text-xs text-purple-300 font-medium">Merchant Onboarding & Growth</p>
            </div>

            {/* Email Contact */}
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-1 relative">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Official Email</span>
              <p className="text-xs sm:text-sm font-bold text-white break-all">
                <a href={`mailto:${contactInfo.email}`} className="text-purple-400 hover:underline">
                  {contactInfo.email}
                </a>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(contactInfo.email, 'email')}
                  className="text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-slate-700 transition-colors"
                >
                  {copiedField === 'email' ? '✓ Copied' : 'Copy Email'}
                </button>
              </div>
            </div>

            {/* Phone Contact */}
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-1 relative">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Direct Phone & Helpline</span>
              <p className="text-xs sm:text-sm font-bold text-white">
                <a href={`tel:${contactInfo.phoneRaw}`} className="text-purple-400 hover:underline">
                  {contactInfo.mobile}
                </a>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(contactInfo.mobile, 'phone')}
                  className="text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-slate-700 transition-colors"
                >
                  {copiedField === 'phone' ? '✓ Copied' : 'Copy Phone'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Pillars */}
        <div>
          <h3 className="text-sm sm:text-base font-black text-white mb-3">
            Merchant Support Services
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 shadow-sm space-y-1.5">
              <span className="text-2xl">📋</span>
              <h4 className="text-xs sm:text-sm font-bold text-white">KYC & Account Approvals</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                Expedite verification of store documents, GSTIN numbers, and bank account setups.
              </p>
            </div>

            <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 shadow-sm space-y-1.5">
              <span className="text-2xl">📦</span>
              <h4 className="text-xs sm:text-sm font-bold text-white">Product Catalog & Stock</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                Bulk upload guidance, tax bracket mapping, and barcode inventory sync.
              </p>
            </div>

            <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 shadow-sm space-y-1.5">
              <span className="text-2xl">💳</span>
              <h4 className="text-xs sm:text-sm font-bold text-white">Wallet & Bank Settlements</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                Same-day wallet payouts, transaction dispute reviews, and commission clarifications.
              </p>
            </div>

            <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 shadow-sm space-y-1.5">
              <span className="text-2xl">🛵</span>
              <h4 className="text-xs sm:text-sm font-bold text-white">Delivery Partner Coordination</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                Immediate support if a rider is delayed or unable to locate your store pickup point.
              </p>
            </div>
          </div>
        </div>

        {/* Seller FAQs */}
        <div className="bg-slate-800/80 rounded-3xl border border-slate-700 p-5 sm:p-7 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Merchant FAQs</h3>
              <p className="text-xs text-slate-400 font-medium">Standard procedures and operational answers</p>
            </div>
            <span className="text-xs font-bold text-purple-300 bg-purple-950/80 px-2.5 py-1 rounded-xl border border-purple-800">
              {sellerFaqs.length} Guides
            </span>
          </div>

          <div className="divide-y divide-slate-700/80">
            {sellerFaqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div key={index} className="py-3">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-3 text-left py-1 hover:text-purple-300 transition-colors focus:outline-none"
                  >
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                        {faq.tag}
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-100">{faq.question}</p>
                    </div>
                    <span className={`w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 bg-purple-600 text-white' : 'text-slate-400'}`}>
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
                        <div className="pt-2 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal bg-slate-900/60 p-3.5 rounded-2xl border border-slate-700/60 mt-2">
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

        {/* Footer */}
        <div className="text-center py-4 space-y-2 border-t border-slate-800">
          <p className="text-xs text-slate-400 font-medium">
            Hello Local Merchant Network • Empowering India&rsquo;s Local Retailers
          </p>
          <div className="flex justify-center items-center gap-4 text-xs font-bold text-slate-400">
            <Link to="/seller/privacy" className="hover:text-purple-400 transition-colors">Seller Privacy Policy</Link>
            <span>•</span>
            <Link to="/seller/login" className="hover:text-purple-400 transition-colors">Seller Login</Link>
            <span>•</span>
            <Link to="/" className="hover:text-purple-400 transition-colors">Customer Marketplace</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface DeliveryFAQ {
  question: string;
  answer: string;
  topic: string;
}

const deliveryFaqs: DeliveryFAQ[] = [
  {
    topic: 'Pickups & Deliveries',
    question: 'How do I confirm pickup at the merchant store?',
    answer: 'Once you reach the seller store, show the 6-digit Order ID. Inspect the packed items to verify the bill, then click "Confirm Store Pickup". The customer will automatically be notified that their order is out for delivery.',
  },
  {
    topic: 'Doorstep OTP Verification',
    question: 'What should I do if the customer does not have the delivery OTP?',
    answer: 'Every customer receives a 4-digit Delivery OTP on their app and via SMS when the order is placed. If the customer has not received it, you can tap "Resend Delivery OTP" on your screen to trigger a fresh SMS to their registered number.',
  },
  {
    topic: 'Cash on Delivery (COD)',
    question: 'How does Cash on Delivery (COD) collection work?',
    answer: 'For COD orders, collect the exact cash amount shown on your screen before handing over the parcel. The collected amount will be added to your pending cash collection ledger, which can be settled with the hub or deducted from wallet payouts.',
  },
  {
    topic: 'Earnings & Wallet Payouts',
    question: 'How are delivery partner earnings calculated and withdrawn?',
    answer: 'You earn a base fulfillment fee per delivery plus distance incentives. Earnings are added to your Delivery Wallet in real time upon successful OTP completion. You can request direct bank transfers from the Delivery Wallet tab.',
  },
  {
    topic: 'Customer Unreachable',
    question: 'What if the customer is unreachable or the address is incorrect?',
    answer: 'Wait at the location for at least 5 minutes and attempt calling the customer through the masked calling button. If there is no response, contact the Fleet Helpline immediately. Never mark an order delivered without the customer OTP.',
  },
];

export default function DeliverySupport() {
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const contactInfo = {
    name: 'Vivek Jagdale',
    email: 'hellolocal.in@gmail.com',
    mobile: '+91 9960700792',
    phoneRaw: '+919960700792',
    hours: 'Mon – Sun: 7:00 AM – 11:30 PM IST (Fleet Active Hours)',
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center transition-colors shadow-2xs"
              aria-label="Back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-900">Hello Local</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Fleet Partner
                </span>
              </div>
              <h1 className="text-xs text-slate-500 font-semibold">Delivery Partner Helpline & Support</h1>
            </div>
          </div>

          <Link
            to="/delivery/privacy"
            className="text-xs font-bold text-rose-700 hover:text-rose-800 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            Fleet Privacy →
          </Link>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-white via-rose-50/40 to-white rounded-3xl border border-rose-200/80 p-6 sm:p-8 text-center shadow-2xs">
          <div className="w-16 h-16 mx-auto mb-3.5 rounded-3xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-3xl shadow-inner">
            🛵
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Delivery Partner Support & Helpline
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto mt-2 font-medium leading-relaxed">
            Need urgent assistance with order pickup, customer OTP verification, navigation issues, cash collection, or trip earnings? We are here to keep your wheels moving.
          </p>

          {/* Quick Action Channels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto mt-6">
            <a
              href={`tel:${contactInfo.phoneRaw}`}
              className="flex items-center justify-center gap-2 px-4 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs sm:text-sm font-black shadow-md active:scale-[0.98] transition-all min-h-[48px]"
            >
              <span>📞</span>
              <span>Call Fleet Helpline</span>
            </a>
            <a
              href={`mailto:${contactInfo.email}?subject=Hello%20Local%20Delivery%20Partner%20Helpline`}
              className="flex items-center justify-center gap-2 px-4 py-3.5 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl text-xs sm:text-sm font-bold border border-slate-200 shadow-2xs active:scale-[0.98] transition-all min-h-[48px]"
            >
              <span>✉️</span>
              <span>Email Fleet Desk</span>
            </a>
          </div>
        </div>

        {/* Nodal Officer & Fleet Escalation Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                Fleet Manager & Escalation Officer
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1">
                Delivery Operations & Driver Grievance Desk
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Official contact point for all courier partners, vehicle document approvals & trip disputes
              </p>
            </div>
            <div className="text-xs text-slate-700 font-semibold bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-2 self-start md:self-center">
              <span>🕒</span>
              <span>{contactInfo.hours}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
            {/* Officer Name */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fleet Operations Manager</span>
              <p className="text-sm sm:text-base font-black text-slate-900">{contactInfo.name}</p>
              <p className="text-xs text-rose-600 font-medium">Logistics & Partner Success</p>
            </div>

            {/* Email Contact */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1 relative">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Helpline Email</span>
              <p className="text-xs sm:text-sm font-bold text-slate-900 break-all">
                <a href={`mailto:${contactInfo.email}`} className="text-rose-600 hover:underline">
                  {contactInfo.email}
                </a>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(contactInfo.email, 'email')}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200 transition-colors"
                >
                  {copiedField === 'email' ? '✓ Copied' : 'Copy Email'}
                </button>
              </div>
            </div>

            {/* Phone Contact */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1 relative">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Urgent Phone & Helpline</span>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                <a href={`tel:${contactInfo.phoneRaw}`} className="text-rose-600 hover:underline font-black">
                  {contactInfo.mobile}
                </a>
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy(contactInfo.mobile, 'phone')}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200 transition-colors"
                >
                  {copiedField === 'phone' ? '✓ Copied' : 'Copy Phone'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Fleet Issue Pillars */}
        <div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 mb-3">
            On-Road & Delivery Support Topics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">🏪</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Store Pickup Assistance</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Merchant delays, wrong item packaging, or store location guidance.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">🔑</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Customer OTP Verification</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Customer missing OTP, SMS resend triggers, or doorstep address mismatches.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">💵</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Cash Collection (COD)</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Exact change issues, customer online payment switches, or cash deposit queries.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <span className="text-2xl">💰</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900">Trip Earnings & Payouts</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Live wallet balances, bonus surge incentives, and bank transfer updates.
              </p>
            </div>
          </div>
        </div>

        {/* Fleet FAQs */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-7 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">Delivery FAQs</h3>
              <p className="text-xs text-slate-500 font-medium">Common solutions for on-duty delivery partners</p>
            </div>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">
              {deliveryFaqs.length} Guides
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {deliveryFaqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div key={index} className="py-3">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-3 text-left py-1 hover:text-rose-600 transition-colors focus:outline-none"
                  >
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                        {faq.topic}
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-900">{faq.question}</p>
                    </div>
                    <span className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 bg-rose-50 text-rose-600' : 'text-slate-500'}`}>
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

        {/* Footer */}
        <div className="text-center py-4 space-y-2 border-t border-slate-200">
          <p className="text-xs text-slate-500 font-medium">
            Hello Local Fleet Network • Fast Hyperlocal Deliveries
          </p>
          <div className="flex justify-center items-center gap-4 text-xs font-bold text-slate-600">
            <Link to="/delivery/privacy" className="hover:text-rose-600 transition-colors">Fleet Privacy Policy</Link>
            <span>•</span>
            <Link to="/delivery/login" className="hover:text-rose-600 transition-colors">Delivery Partner Login</Link>
            <span>•</span>
            <Link to="/" className="hover:text-rose-600 transition-colors">Hello Local Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

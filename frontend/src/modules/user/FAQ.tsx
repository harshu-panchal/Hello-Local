import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, PhoneCallIcon, ChevronDownIcon } from './components/common/UserIcons';

interface FAQItem {
  id: number;
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    id: 1,
    question: "How do I place an order?",
    answer: "Placing an order is simple! Browse through our categories or use the search bar to find products. Add them to your cart, review your cart, and proceed to checkout. Provide your delivery address and choose your payment method to complete the order."
  },
  {
    id: 2,
    question: "What are the delivery charges?",
    answer: "Delivery charges vary based on your order value and location. We offer free delivery on orders above ₹499. For orders below this value, a nominal delivery fee is applicable, which will be shown at the checkout page."
  },
  {
    id: 3,
    question: "How long does delivery take?",
    answer: "We offer express delivery within 15-30 minutes for most locations. You can track your order in real-time from the 'My Orders' section after placing it."
  },
  {
    id: 4,
    question: "Can I cancel my order?",
    answer: "Yes, you can cancel your order before it is out for delivery. Go to 'My Orders', select the order you wish to cancel, and click on 'Cancel Order'. Once the order is out for delivery, cancellation may not be possible."
  },
  {
    id: 5,
    question: "How can I pay for my order?",
    answer: "We accept various payment methods including Credit/Debit cards, UPI (Google Pay, PhonePe, etc.), Net Banking, and Cash on Delivery (COD)."
  },
  {
    id: 6,
    question: "What is your refund policy?",
    answer: "If you receive a damaged or incorrect product, you can request a return/refund within 24 hours of delivery. Our team will verify the request and process the refund to your original payment method or wallet."
  }
];

export default function FAQ() {
  const navigate = useNavigate();
  const [activeItem, setActiveItem] = useState<number | null>(null);

  const toggleItem = (id: number) => {
    setActiveItem(activeItem === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full transition-colors"
              aria-label="Go back"
            >
              <ArrowLeftIcon size={18} />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Frequently Asked Questions
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-5">
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start space-y-3.5 lg:space-y-0">
          {/* Left Column: Hero & Support Card */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-3.5 lg:sticky lg:top-20">
            {/* Header Hero Banner */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs text-center">
              <div className="w-12 h-12 mx-auto mb-2.5 rounded-xl bg-[#FFF1F4] border border-[#FFE4EA] flex items-center justify-center text-[#FF2E7A]">
                <PhoneCallIcon size={22} />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 mb-1">
                How can we help you today?
              </h2>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Find answers regarding delivery timelines, payments, cancellations, refunds, and store policies.
              </p>
            </div>

            {/* Still Need Help Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs text-center space-y-2.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">Still have questions?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Our customer care team is available to resolve your inquiries.
              </p>
              <a
                href="mailto:support@hellolocal.com"
                className="inline-flex items-center justify-center min-h-[44px] px-5 bg-[#FF2E7A] hover:bg-[#E02269] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-xs transition-opacity"
              >
                Email Support
              </a>
            </div>
          </div>

          {/* Right Column: FAQ Accordion List */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-2.5">
            {faqs.map((item) => {
              const isOpen = activeItem === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-2xs transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className="w-full min-h-[44px] flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-xs sm:text-sm font-bold text-slate-900 pr-3">
                      {item.question}
                    </span>
                    <span
                      className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 transition-transform duration-200 flex-shrink-0 ${
                        isOpen ? 'rotate-180 bg-[#FFF1F4] text-[#FF2E7A]' : ''
                      }`}
                    >
                      <ChevronDownIcon size={12} />
                    </span>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-3.5 sm:px-4 pb-4 pt-0.5 text-xs text-slate-600 leading-relaxed border-t border-slate-50 font-medium">
                          {item.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

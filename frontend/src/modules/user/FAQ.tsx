import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div className="pb-24 md:pb-8 bg-white min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-b from-pink-50 to-white px-4 pt-12 pb-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center mb-6 border-2 border-pink-100">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              className="text-[#FF2E7A]"
            >
              <path
                d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-neutral-900 mb-2">
            Frequently Asked Questions
          </h1>
          <p className="text-sm md:text-base text-neutral-600 text-center px-4">
            Find answers to common questions about our services
          </p>
        </div>
      </div>

      <div className="px-4 max-w-3xl mx-auto">
        <div className="space-y-3">
          {faqs.map((item) => (
            <div
              key={item.id}
              className="border border-neutral-200 rounded-xl overflow-hidden bg-white hover:border-pink-200 transition-colors"
            >
              <button
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center justify-between px-4 py-4 hover:bg-neutral-50 transition-colors text-left"
              >
                <span className="text-sm md:text-base font-semibold text-neutral-900 pr-4">
                  {item.question}
                </span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`text-neutral-400 transition-transform duration-300 ${activeItem === item.id ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <AnimatePresence>
                {activeItem === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-4 pb-4 text-sm md:text-base text-neutral-600 leading-relaxed border-t border-neutral-50 pt-3">
                      {item.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Contact Support Section */}
        <div className="mt-12 p-6 bg-neutral-50 rounded-2xl border border-neutral-100 text-center">
          <h2 className="text-lg font-bold text-neutral-900 mb-2">Still have questions?</h2>
          <p className="text-sm text-neutral-600 mb-6">
            If you can't find the answer you're looking for, please contact our support team.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:help@dhakadsnazzy.com"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#FF2E7A] text-white rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 6l-10 7L2 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Email Support
            </a>
            <a
              href="tel:+91-XXXXX-XXXXX"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-[#FF2E7A] border-2 border-[#FF2E7A] rounded-lg font-semibold hover:bg-pink-50 transition-colors text-sm"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Call Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

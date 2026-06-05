import { useEffect } from 'react';

export type PolicyTab = 'terms' | 'privacy';

interface LegalPolicyModalProps {
  open: boolean;
  initialTab?: PolicyTab;
  onClose: () => void;
}

/**
 * Reusable Terms of Service / Privacy Policy modal used on the auth pages.
 * Keeps the policy copy in one place so login & signup stay in sync.
 */
export default function LegalPolicyModal({ open, initialTab = 'terms', onClose }: LegalPolicyModalProps) {
  // Track the active tab locally so the same modal can show either document.
  // (Controlled by the trigger via `initialTab` each time it opens.)
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-900">
            {initialTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto text-sm text-neutral-700 space-y-3 leading-relaxed">
          {initialTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <p className="text-xs text-neutral-400">Last updated: June 2026</p>
      <p>
        Welcome to Hello Local. By creating a seller account and listing products on our
        platform, you agree to these Terms of Service.
      </p>
      <h3 className="font-semibold text-neutral-900">1. Eligibility &amp; Account</h3>
      <p>
        You must provide accurate business, contact, and bank details. You are responsible
        for keeping your account credentials secure and for all activity under your account.
      </p>
      <h3 className="font-semibold text-neutral-900">2. Listings &amp; Orders</h3>
      <p>
        You are responsible for the accuracy of your product information, pricing, stock, and
        for fulfilling accepted orders on time. Hello Local may remove listings that violate
        our policies or applicable law.
      </p>
      <h3 className="font-semibold text-neutral-900">3. Pricing, Fees &amp; Payouts</h3>
      <p>
        Hello Local deducts the applicable commission from each order. Net earnings are
        credited to your wallet and paid out per the withdrawal terms shown in your dashboard.
      </p>
      <h3 className="font-semibold text-neutral-900">4. Returns &amp; Cancellations</h3>
      <p>
        Returns and cancellations are handled in line with the product's return policy and
        platform guidelines. Refunds may be adjusted against your payouts where applicable.
      </p>
      <h3 className="font-semibold text-neutral-900">5. Suspension &amp; Termination</h3>
      <p>
        We may suspend or terminate accounts that breach these terms, engage in fraud, or
        harm customers or the platform.
      </p>
      <p>
        For any questions about these terms, contact us at info@hellolocal.com.
      </p>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="text-xs text-neutral-400">Last updated: June 2026</p>
      <p>
        This Privacy Policy explains how Hello Local collects, uses, and protects the
        information you provide as a seller.
      </p>
      <h3 className="font-semibold text-neutral-900">1. Information We Collect</h3>
      <p>
        We collect your name, store details, contact information, address, location, bank/PAN
        details, and the product and order data you generate on the platform.
      </p>
      <h3 className="font-semibold text-neutral-900">2. How We Use It</h3>
      <p>
        We use your information to operate your store, process orders and payouts, provide
        support, prevent fraud, and comply with legal obligations.
      </p>
      <h3 className="font-semibold text-neutral-900">3. Sharing</h3>
      <p>
        We share delivery-related details with delivery partners and customers only as needed
        to fulfill orders. We do not sell your personal information.
      </p>
      <h3 className="font-semibold text-neutral-900">4. Data Security &amp; Retention</h3>
      <p>
        We apply reasonable safeguards to protect your data and retain it for as long as your
        account is active or as required by law.
      </p>
      <h3 className="font-semibold text-neutral-900">5. Your Choices</h3>
      <p>
        You may review or update your details in Account Settings, or contact us at
        info@hellolocal.com to request changes.
      </p>
    </>
  );
}

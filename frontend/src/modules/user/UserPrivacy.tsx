import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function UserPrivacy() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const contactInfo = {
    name: 'Vivek Jagdale',
    email: 'hellolocal.in@gmail.com',
    mobile: '+91 9960700792',
    phoneRaw: '+919960700792',
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`${contactInfo.name}\nEmail: ${contactInfo.email}\nPhone: ${contactInfo.mobile}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-16 text-slate-800">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs user-safe-top">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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
                <span className="text-xs font-bold text-slate-400">/ Privacy Policy</span>
              </div>
              <h1 className="text-xs text-slate-500 font-semibold">Customer Data Protection & Privacy Terms</h1>
            </div>
          </div>

          <Link
            to="/support"
            className="text-xs font-bold text-[#FF2E7A] hover:text-[#E02269] hover:underline px-2.5 py-1 rounded-lg bg-[#FFF1F4] border border-[#FFE4EA] transition-colors"
          >
            Customer Support →
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Document Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              Legal Compliance • IT Act 2000
            </span>
            <span className="text-xs font-bold text-slate-400">
              Last Updated: October 2026
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Customer Privacy Policy
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            Hello Local Technologies Pvt. Ltd. (&ldquo;Hello Local&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to protecting the privacy, confidentiality, and security of our customers. This policy details how your information is collected, processed, and safeguarded when you access our mobile web app, place hyper-local orders, and utilize our delivery platform.
          </p>
        </div>

        {/* Grievance Officer Quick Contact Pill */}
        <div className="bg-gradient-to-br from-[#FFF5F7] to-white rounded-3xl border border-[#FFE4EA] p-5 sm:p-6 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF2E7A]">
                Designated Grievance & Nodal Officer
              </span>
              <h3 className="text-base font-black text-slate-900">{contactInfo.name}</h3>
              <p className="text-xs text-slate-500 font-medium">
                For privacy inquiries, grievance redressal, or data removal requests:
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-center transition-all"
            >
              {copied ? '✓ Officer Info Copied' : 'Copy Contact Details'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div className="flex items-center gap-2 bg-white/80 p-3 rounded-xl border border-[#FFE4EA]">
              <span className="text-base">✉️</span>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">OFFICIAL EMAIL</span>
                <a href={`mailto:${contactInfo.email}`} className="font-bold text-[#FF2E7A] hover:underline">
                  {contactInfo.email}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/80 p-3 rounded-xl border border-[#FFE4EA]">
              <span className="text-base">📞</span>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">HELPLINE & MOBILE</span>
                <a href={`tel:${contactInfo.phoneRaw}`} className="font-bold text-slate-800 hover:underline">
                  {contactInfo.mobile}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Policy Content */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs space-y-6 text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#FFF1F4] text-[#FF2E7A] text-xs flex items-center justify-center font-bold">1</span>
              Information We Collect
            </h3>
            <p className="text-slate-600">
              To operate our 10–15 minute hyperlocal delivery service, we collect the following types of information:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>
                <strong className="text-slate-800">Account & Profile Data:</strong> Mobile phone number (used for secure OTP login), customer full name, delivery address details, landmark, and optional email address.
              </li>
              <li>
                <strong className="text-slate-800">Real-Time Precise GPS Location:</strong> With your explicit browser/device permission, we access your device latitude and longitude coordinates. This is strictly required to locate nearby neighbourhood stores within a 5-10 km radius and calculate delivery route feasibility.
              </li>
              <li>
                <strong className="text-slate-800">Order & Transaction History:</strong> Items added to cart, purchase amounts, order status, applied discount coupons, and payment method choice (UPI, Netbanking, COD, or Hello Local Wallet).
              </li>
              <li>
                <strong className="text-slate-800">Invoicing & Tax Details:</strong> Voluntary GSTIN provided by customers who require business input tax credit invoices.
              </li>
              <li>
                <strong className="text-slate-800">Device & Push Notifications:</strong> Firebase Cloud Messaging (FCM) push tokens used strictly to notify you regarding live order dispatches and rider arrivals.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#FFF1F4] text-[#FF2E7A] text-xs flex items-center justify-center font-bold">2</span>
              How We Use Your Data
            </h3>
            <p className="text-slate-600">
              Your data is collected solely for order fulfillment and seamless platform operation:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Displaying real-time product catalogs and stock from local merchants near you.</li>
              <li>Providing your delivery address and contact phone number to assigned delivery executives so they can navigate to your door.</li>
              <li>Generating a secure one-time delivery confirmation PIN (OTP) to prevent unauthorized package handovers.</li>
              <li>Processing returns, item replacements, and automated wallet refunds for damaged goods.</li>
              <li>Preventing fraudulent orders, spam, and ensuring platform security.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#FFF1F4] text-[#FF2E7A] text-xs flex items-center justify-center font-bold">3</span>
              Information Sharing & Disclosure
            </h3>
            <p className="text-slate-600">
              We respect your privacy and <strong className="text-slate-800">never sell, rent, or trade your personal data</strong> to third-party advertisers. Information is disclosed only under the following strict circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>
                <strong className="text-slate-800">With Merchant Stores:</strong> Storekeepers receive your order item list and basic customer name to pack the order.
              </li>
              <li>
                <strong className="text-slate-800">With Delivery Partners:</strong> The courier assigned to your order receives your delivery address, landmark, and contact phone number to complete the drop-off.
              </li>
              <li>
                <strong className="text-slate-800">Payment Gateways:</strong> Online transactions are handled via RBI-authorized payment processors. Hello Local does not store raw credit/debit card numbers or CVVs.
              </li>
              <li>
                <strong className="text-slate-800">Legal Requirements:</strong> Disclosures made in compliance with applicable law, court summons, or official regulatory notices.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#FFF1F4] text-[#FF2E7A] text-xs flex items-center justify-center font-bold">4</span>
              Data Security & Storage
            </h3>
            <p className="text-slate-600">
              All communications between your browser/device and our servers are encrypted using modern Transport Layer Security (TLS/HTTPS). Session tokens are cryptographically signed using JSON Web Tokens (JWT) and stored securely. Access to backend databases is restricted to authorized personnel under strict confidentiality agreements.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#FFF1F4] text-[#FF2E7A] text-xs flex items-center justify-center font-bold">5</span>
              Your Choices, Rights & Data Deletion
            </h3>
            <p className="text-slate-600">
              As a valued customer, you have full control over your personal data:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>You may update or delete saved delivery addresses at any time in your Address Book.</li>
              <li>You can grant or revoke location access at any time via your device browser settings.</li>
              <li>
                To request permanent deletion of your account and associated transaction records, email our Grievance Officer at <a href={`mailto:${contactInfo.email}`} className="text-[#FF2E7A] font-bold hover:underline">{contactInfo.email}</a>. Requests are completed within 7 business days.
              </li>
            </ul>
          </section>

          <section className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              6. Grievance Officer & Contact Information
            </h3>
            <p className="text-slate-600">
              In accordance with the Information Technology Act 2000 and rules made thereunder:
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 text-xs sm:text-sm space-y-1">
              <p><strong className="text-slate-900">Officer Name:</strong> {contactInfo.name}</p>
              <p><strong className="text-slate-900">Organization:</strong> Hello Local Technologies Pvt. Ltd.</p>
              <p><strong className="text-slate-900">Email:</strong> <a href={`mailto:${contactInfo.email}`} className="text-[#FF2E7A] font-semibold hover:underline">{contactInfo.email}</a></p>
              <p><strong className="text-slate-900">Helpline / Mobile:</strong> <a href={`tel:${contactInfo.phoneRaw}`} className="text-[#16A34A] font-semibold hover:underline">{contactInfo.mobile}</a></p>
              <p><strong className="text-slate-900">Jurisdiction:</strong> Maharashtra, India</p>
            </div>
          </section>
        </div>

        {/* Footer Navigation Links */}
        <div className="text-center py-4 space-y-2 border-t border-slate-200/60">
          <p className="text-xs text-slate-500 font-medium">
            © 2026 Hello Local Technologies Pvt. Ltd. All rights reserved.
          </p>
          <div className="flex justify-center items-center gap-4 text-xs font-bold text-slate-600">
            <Link to="/support" className="hover:text-[#FF2E7A] transition-colors">Customer Support</Link>
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

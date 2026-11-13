import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function SellerPrivacy() {
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
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-lg user-safe-top">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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
              <h1 className="text-xs text-slate-400 font-medium">Merchant Partner Privacy Policy & Data Terms</h1>
            </div>
          </div>

          <Link
            to="/seller/support"
            className="text-xs font-bold text-purple-300 hover:text-white px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            Seller Support →
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Document Header Card */}
        <div className="bg-slate-800/90 rounded-3xl border border-slate-700 p-6 sm:p-8 shadow-lg space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 bg-purple-950/80 border border-purple-800 px-2.5 py-0.5 rounded-full">
              Merchant Agreement & Data Terms
            </span>
            <span className="text-xs font-bold text-slate-400">
              Last Updated: October 2026
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Seller & Merchant Partner Privacy Policy
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-normal leading-relaxed">
            This Merchant Privacy Policy sets forth how Hello Local Technologies Pvt. Ltd. (&ldquo;Hello Local&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;) collects, manages, uses, and safeguards information provided by retail store partners, shopkeepers, and independent merchants participating on the Hello Local hyper-local commerce network.
          </p>
        </div>

        {/* Nodal Officer Contact Card */}
        <div className="bg-gradient-to-br from-slate-800 to-purple-950/40 rounded-3xl border border-purple-800/50 p-5 sm:p-6 shadow-md space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                Designated Merchant Privacy & Grievance Officer
              </span>
              <h3 className="text-base font-black text-white">{contactInfo.name}</h3>
              <p className="text-xs text-slate-400 font-medium">
                For merchant data privacy concerns, KYC updates, or bank record inquiries:
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-bold text-slate-200 hover:text-white bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 shadow-sm self-start sm:self-center transition-all"
            >
              {copied ? '✓ Officer Info Copied' : 'Copy Contact Details'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div className="flex items-center gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
              <span className="text-base">✉️</span>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">OFFICIAL EMAIL</span>
                <a href={`mailto:${contactInfo.email}`} className="font-bold text-purple-400 hover:underline">
                  {contactInfo.email}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
              <span className="text-base">📞</span>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">HELPLINE & MOBILE</span>
                <a href={`tel:${contactInfo.phoneRaw}`} className="font-bold text-emerald-400 hover:underline">
                  {contactInfo.mobile}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Body */}
        <div className="bg-slate-800/90 rounded-3xl border border-slate-700 p-6 sm:p-8 shadow-lg space-y-6 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-purple-600/30 text-purple-300 text-xs flex items-center justify-center font-bold">1</span>
              Merchant Information We Collect
            </h3>
            <p className="text-slate-300">
              When you register as a seller on Hello Local, we collect information necessary to establish your legal identity, showcase your store to buyers, and disburse sales proceeds:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li>
                <strong className="text-white">Store & Proprietor Identity:</strong> Seller legal name, store business name, contact telephone, email address, physical storefront address, city, and store description.
              </li>
              <li>
                <strong className="text-white">Tax & Regulatory Identifiers:</strong> PAN card number (Permanent Account Number), Tax identification number, and GSTIN (Goods & Services Tax Identification Number) required for statutory tax reporting and input credit billing.
              </li>
              <li>
                <strong className="text-white">Bank Payout Credentials:</strong> Beneficiary account holder name, bank name, branch name, account number, and IFSC code used exclusively for processing electronic fund transfers (NEFT/IMPS/UPI) from your Hello Local Wallet.
              </li>
              <li>
                <strong className="text-white">Store Geo-Coordinates & Delivery Radius:</strong> Precise latitude and longitude coordinates of your store on Google Maps, along with your declared service radius (in kilometers) to determine which buyers can view and purchase from your catalog.
              </li>
              <li>
                <strong className="text-white">Catalog & Inventory Data:</strong> Products, barcodes, prices, stock quantities, promotional discounts, and POS sales receipts.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-purple-600/30 text-purple-300 text-xs flex items-center justify-center font-bold">2</span>
              How We Utilize Merchant Information
            </h3>
            <p className="text-slate-300">
              Seller data is processed for specific operational requirements:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li>Displaying your digital storefront, catalog items, and store operational hours to local buyers located within your service radius.</li>
              <li>Dispatching Hello Local delivery partners to your exact store GPS coordinates for seamless order pickup.</li>
              <li>Automating order dispatch notifications via WhatsApp Business API when connected.</li>
              <li>Calculating and remitting weekly or on-demand wallet withdrawals to your verified bank account.</li>
              <li>Generating GST-compliant sales summary reports and TDS deduction statements.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-purple-600/30 text-purple-300 text-xs flex items-center justify-center font-bold">3</span>
              Data Protection & Safeguards
            </h3>
            <p className="text-slate-300">
              Hello Local applies stringent security measures to protect merchant commercial data:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li>Bank account numbers are masked across the user interface (showing only the last 4 digits) to prevent shoulder surfing and unauthorized screen capture.</li>
              <li>All seller API endpoints require cryptographically signed JSON Web Tokens (JWT) verified against registered seller accounts.</li>
              <li>Customer contact details provided on incoming orders are restricted to order fulfillment purposes and must not be used for unsolicited marketing.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-purple-600/30 text-purple-300 text-xs flex items-center justify-center font-bold">4</span>
              Third-Party Sharing & Legal Compliance
            </h3>
            <p className="text-slate-300">
              We do not sell merchant lists or financial information. Data is shared strictly with:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li>Assigned delivery executives (store address, shop name, phone number) for pickup routing.</li>
              <li>Banking partners and payment gateways for payout disbursements.</li>
              <li>Statutory tax authorities where mandated by applicable GST regulations.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-purple-600/30 text-purple-300 text-xs flex items-center justify-center font-bold">5</span>
              Account Modifications & Merchant Rights
            </h3>
            <p className="text-slate-300">
              Merchants retain full rights to update their store profile, modify their service radius, update bank account numbers, or deactivate store listings through the Account Settings tab. For permanent merchant account closure and data archival requests, contact our Merchant Grievance Officer.
            </p>
          </section>

          <section className="space-y-2 pt-2 border-t border-slate-700/80">
            <h3 className="text-sm sm:text-base font-bold text-white">
              6. Merchant Grievance Officer
            </h3>
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-700 text-xs sm:text-sm space-y-1">
              <p><strong className="text-white">Officer Name:</strong> {contactInfo.name}</p>
              <p><strong className="text-white">Designation:</strong> Merchant Operations & Data Protection Officer</p>
              <p><strong className="text-white">Company:</strong> Hello Local Technologies Pvt. Ltd.</p>
              <p><strong className="text-white">Email:</strong> <a href={`mailto:${contactInfo.email}`} className="text-purple-400 font-semibold hover:underline">{contactInfo.email}</a></p>
              <p><strong className="text-white">Helpline / Mobile:</strong> <a href={`tel:${contactInfo.phoneRaw}`} className="text-emerald-400 font-semibold hover:underline">{contactInfo.mobile}</a></p>
              <p><strong className="text-white">Jurisdiction:</strong> Maharashtra, India</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="text-center py-4 space-y-2 border-t border-slate-800">
          <p className="text-xs text-slate-400 font-medium">
            © 2026 Hello Local Technologies Pvt. Ltd. All rights reserved.
          </p>
          <div className="flex justify-center items-center gap-4 text-xs font-bold text-slate-400">
            <Link to="/seller/support" className="hover:text-purple-400 transition-colors">Seller Support</Link>
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

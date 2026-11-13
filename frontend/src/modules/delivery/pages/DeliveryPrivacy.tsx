import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function DeliveryPrivacy() {
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
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs user-safe-top">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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
              <h1 className="text-xs text-slate-500 font-semibold">Delivery Partner Privacy Policy & Location Terms</h1>
            </div>
          </div>

          <Link
            to="/delivery/support"
            className="text-xs font-bold text-rose-700 hover:text-rose-800 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            Fleet Support →
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Document Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
              Fleet Partner Agreement & Location Terms
            </span>
            <span className="text-xs font-bold text-slate-400">
              Last Updated: October 2026
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Delivery Partner Privacy Policy
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            This Delivery Partner Privacy Policy outlines how Hello Local Technologies Pvt. Ltd. (&ldquo;Hello Local&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and safeguards information from independent delivery executives, bike riders, and fleet partners operating on the Hello Local delivery network.
          </p>
        </div>

        {/* Nodal Officer Contact Card */}
        <div className="bg-gradient-to-br from-white via-rose-50/50 to-white rounded-3xl border border-rose-200/80 p-5 sm:p-6 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                Designated Fleet Grievance Officer
              </span>
              <h3 className="text-base font-black text-slate-900">{contactInfo.name}</h3>
              <p className="text-xs text-slate-500 font-medium">
                For fleet verification, location tracking questions, or partner data requests:
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
            <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-rose-200/60 shadow-2xs">
              <span className="text-base">✉️</span>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">OFFICIAL EMAIL</span>
                <a href={`mailto:${contactInfo.email}`} className="font-bold text-rose-600 hover:underline">
                  {contactInfo.email}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-rose-200/60 shadow-2xs">
              <span className="text-base">📞</span>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">DIRECT HELPLINE & MOBILE</span>
                <a href={`tel:${contactInfo.phoneRaw}`} className="font-bold text-slate-800 hover:underline">
                  {contactInfo.mobile}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Body */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs space-y-6 text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 text-xs flex items-center justify-center font-bold">1</span>
              Delivery Partner Information We Collect
            </h3>
            <p className="text-slate-600">
              To onboard, dispatch, and disburse trip earnings to delivery partners, we collect:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>
                <strong className="text-slate-900">Personal & Identity Information:</strong> Full name, verified mobile phone number, secondary emergency contact number, and profile photograph.
              </li>
              <li>
                <strong className="text-slate-900">Verification & Vehicle Documents:</strong> Driving license number, vehicle registration certificate (RC), and government identity proof (Aadhaar/PAN) for statutory road fleet compliance.
              </li>
              <li>
                <strong className="text-slate-900">Bank Account Details:</strong> Bank name, account number, account holder name, and IFSC code for direct deposit of weekly or on-demand delivery earnings.
              </li>
              <li>
                <strong className="text-slate-900">Trip & Cash Collection Records:</strong> Order IDs handled, timestamps of pickup and delivery, customer verification OTP records, and Cash on Delivery (COD) cash receipts.
              </li>
            </ul>
          </section>

          {/* Special Location Disclosure Box */}
          <section className="bg-amber-50/70 border border-amber-200 p-4 sm:p-5 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs sm:text-sm">
              <span className="text-lg">📍</span>
              <h3>Continuous GPS & Background Location Tracking Disclosure</h3>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              Hello Local requires access to your device&rsquo;s precise geographic location (both foreground and background) when you toggle your status to <strong className="text-amber-950">&ldquo;Online&rdquo;</strong>.
            </p>
            <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1">
              <li>
                <strong>Purpose:</strong> To assign nearby pickup orders from neighborhood stores, calculate optimized turn-by-turn routes, share estimated arrival times (ETA) with waiting customers, and ensure driver safety.
              </li>
              <li>
                <strong>Turn Off Anytime:</strong> When you finish your shift and toggle to <strong className="text-amber-950">&ldquo;Offline&rdquo;</strong>, background GPS tracking immediately halts. We do not track your location during personal or offline hours.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 text-xs flex items-center justify-center font-bold">2</span>
              How Your Information is Used
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Dispatching incoming hyper-local orders to riders based on proximity to the merchant store.</li>
              <li>Displaying your name and live GPS location to the customer while an order is actively out for delivery.</li>
              <li>Verifying successful handovers through the 4-digit customer delivery OTP.</li>
              <li>Tracking COD collections and balancing daily remittances against your Delivery Wallet.</li>
              <li>Processing electronic bank transfers for completed trips and distance incentive bonuses.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 text-xs flex items-center justify-center font-bold">3</span>
              Information Sharing & Privacy Protection
            </h3>
            <p className="text-slate-600">
              Hello Local strictly respects partner data. Information is shared only as follows:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>
                <strong className="text-slate-900">With Customers:</strong> Only your first name, vehicle type, and real-time trip GPS tracking are shown on the active order screen. Customers do not see your personal identification numbers or bank details.
              </li>
              <li>
                <strong className="text-slate-900">With Merchant Stores:</strong> Storekeepers see your partner name and Order ID to hand over packages.
              </li>
              <li>
                <strong className="text-slate-900">Safety & Emergency Contacts:</strong> In case of an accident or medical emergency reported on-road, your emergency contact phone number will be notified immediately.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 text-xs flex items-center justify-center font-bold">4</span>
              Partner Rights & Data Retention
            </h3>
            <p className="text-slate-600">
              You may review and update your vehicle information and payout bank accounts through the Delivery Profile tab. Trip logs and payment transaction receipts are archived for statutory accounting and tax compliance. If you choose to discontinue partnership with Hello Local, you may request account closure by contacting our Fleet Grievance Officer.
            </p>
          </section>

          <section className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              5. Fleet Grievance & Nodal Officer
            </h3>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 text-xs sm:text-sm space-y-1">
              <p><strong className="text-slate-900">Officer Name:</strong> {contactInfo.name}</p>
              <p><strong className="text-slate-900">Designation:</strong> Head of Logistics & Fleet Grievance Officer</p>
              <p><strong className="text-slate-900">Company:</strong> Hello Local Technologies Pvt. Ltd.</p>
              <p><strong className="text-slate-900">Email:</strong> <a href={`mailto:${contactInfo.email}`} className="text-rose-600 font-semibold hover:underline">{contactInfo.email}</a></p>
              <p><strong className="text-slate-900">Helpline / Mobile:</strong> <a href={`tel:${contactInfo.phoneRaw}`} className="text-slate-900 font-semibold hover:underline">{contactInfo.mobile}</a></p>
              <p><strong className="text-slate-900">Jurisdiction:</strong> Maharashtra, India</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="text-center py-4 space-y-2 border-t border-slate-200">
          <p className="text-xs text-slate-500 font-medium">
            © 2026 Hello Local Technologies Pvt. Ltd. All rights reserved.
          </p>
          <div className="flex justify-center items-center gap-4 text-xs font-bold text-slate-600">
            <Link to="/delivery/support" className="hover:text-rose-600 transition-colors">Fleet Support Desk</Link>
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

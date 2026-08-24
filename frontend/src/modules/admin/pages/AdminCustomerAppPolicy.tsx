import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import {
  getAppSettings,
  updateAppSettings,
} from "../../../services/api/admin/adminSettingsService";

const DEFAULT_CUSTOMER_POLICY = `Welcome to Hello Local - 10 Minute App!

By using our customer application, you agree to the following terms and conditions:

1. Account Registration & Security
   - You must provide accurate, current, and complete information during registration.
   - You are responsible for maintaining the confidentiality of your account credentials.
   - You must notify Hello Local immediately of any unauthorized account access.

2. Product Catalog & Order Placement
   - All orders are subject to real-time merchant inventory availability.
   - Prices are subject to dynamic local store updates without prior notice.
   - Hello Local reserves the right to cancel orders in the event of unforeseen supply issues.

3. Pricing & Payments
   - Payment must be completed via authorized online gateways or Cash on Delivery (COD).
   - All listed prices are inclusive of applicable GST/taxes.
   - Platform/handling fees and delivery surcharges are clearly itemized before checkout.

4. 10-Minute Instant Delivery
   - Delivery time estimates reflect standard operating conditions and road accessibility.
   - Inclement weather, traffic congestion, or force majeure events may cause delivery delays.
   - Customers must be available at the specified delivery address upon courier arrival.

5. Returns, Replacements & Refunds
   - Return requests for perishable goods must be raised immediately upon delivery.
   - Non-perishable returns are accepted in original, unopened packaging.
   - Approved refunds are credited to the original payment source or platform wallet within 3-5 business days.

6. Data Privacy & Customer Protection
   - We value your privacy; customer data is handled strictly under our Privacy Policy.
   - Location data is utilized solely for route optimization and store discovery.

7. Support Desk
   - For order issues, inquiries, or grievance redressal, contact support@hellolocal.com.

Last updated: ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

export default function AdminCustomerAppPolicy() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialContent, setInitialContent] = useState("");
  const [policyContent, setPolicyContent] = useState("");

  useEffect(() => {
    fetchPolicy();
  }, []);

  const fetchPolicy = async () => {
    setLoading(true);
    try {
      const response = await getAppSettings();
      if (response.success && response.data) {
        const content = response.data.customerAppPolicy || DEFAULT_CUSTOMER_POLICY;
        setInitialContent(content);
        setPolicyContent(content);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to load customer app policy", "error");
      setInitialContent(DEFAULT_CUSTOMER_POLICY);
      setPolicyContent(DEFAULT_CUSTOMER_POLICY);
    } finally {
      setLoading(false);
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    return policyContent !== initialContent;
  }, [policyContent, initialContent]);

  const handleReset = () => {
    setPolicyContent(initialContent);
    showToast("Policy reset to last saved version", "info");
  };

  const handleRestoreDefault = () => {
    setPolicyContent(DEFAULT_CUSTOMER_POLICY);
    showToast("Default policy template loaded", "info");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(policyContent);
    showToast("Policy text copied to clipboard!", "success");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!policyContent.trim()) {
      showToast("Policy content cannot be empty", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await updateAppSettings({
        customerAppPolicy: policyContent.trim(),
      });

      if (response.success) {
        showToast("Customer App Policy updated successfully!", "success");
        setInitialContent(policyContent.trim());
      } else {
        showToast(response.message || "Failed to update policy", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Error updating policy", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-8 h-8 border-4 border-rose-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>📜</span> Customer App Legal Policy
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Manage terms of service, customer guarantees, and legal compliance contracts
          </p>
        </div>

        <div className="flex items-center gap-3">
          <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500 hidden sm:block">
            <Link
              to="/admin/dashboard"
              className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
            >
              Dashboard
            </Link>
            <span className="mx-2 text-neutral-300">/</span>
            <span className="text-neutral-700 font-medium">Customer Policy</span>
          </nav>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !hasUnsavedChanges}
            className="bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-sm"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <span>Save Policy</span>
            )}
          </button>
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <span>⚠️</span>
            <span>You have unsaved changes in your Customer App Policy.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="underline text-amber-900 hover:text-amber-950 font-bold"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg font-bold shadow-sm"
            >
              Save Now
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Editor & Preview */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Editor Box */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>✍️</span> Policy Content Editor
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreDefault}
                className="text-[11px] bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors"
                title="Load default policy template"
              >
                Load Template
              </button>
              <button
                type="button"
                onClick={() => setPolicyContent("")}
                className="text-[11px] bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors"
                title="Clear content"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <label htmlFor="customerPolicyEditor" className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
              Legal Agreement Copy <span className="text-rose-700">*</span>
            </label>
            <textarea
              id="customerPolicyEditor"
              name="policyContent"
              value={policyContent}
              onChange={(e) => setPolicyContent(e.target.value)}
              placeholder="Type or paste Customer App Policy text..."
              rows={22}
              required
              className="w-full px-4 py-3 border border-neutral-300 rounded-xl text-xs font-mono leading-relaxed bg-white focus:border-rose-600 outline-none resize-y"
            />
            <p className="text-[11px] text-neutral-400">
              Plain text formatted with clear sections, numbering, and line breaks for customer readability.
            </p>
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden sticky top-6">
          <div className="bg-neutral-900 text-white px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>👁️</span> Storefront Live Preview
            </h3>
            <button
              type="button"
              onClick={handleCopy}
              className="text-[11px] bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg font-bold transition-colors"
            >
              Copy Text
            </button>
          </div>

          <div className="p-5 space-y-3">
            <div className="whitespace-pre-wrap text-xs text-neutral-700 bg-neutral-50 p-4 rounded-xl border border-neutral-200/80 min-h-[350px] max-h-[500px] overflow-y-auto leading-relaxed font-sans">
              {policyContent || "Policy content preview will appear here..."}
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
              <span>Character count: {policyContent.length}</span>
              <span>Line count: {policyContent.split("\n").length}</span>
            </div>
          </div>
        </div>
      </form>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Legal Compliance & Customer Trust
      </footer>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useToast } from "../../../context/ToastContext";
import {
  getAllSubscriptionPlansAdmin,
  createSubscriptionPlanAdmin,
  updateSubscriptionPlanAdmin,
  deleteSubscriptionPlanAdmin,
  getSubscriptionTransactionsAdmin,
  SubscriptionPlan,
  SubscriptionPaymentRecord,
} from "../../../services/api/subscriptionService";

export default function AdminSubscriptionPlans() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [transactions, setTransactions] = useState<SubscriptionPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"plans" | "transactions">("plans");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 499,
    durationInDays: 30,
    features: "0% Commission on all orders\nUnlimited product catalog\nDirect customer payments\nStore analytics & order management",
    isActive: true,
    isPopular: false,
    sortOrder: 0,
  });

  // Pagination & Filtering for transactions
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [txStatusFilter, setTxStatusFilter] = useState<string>("ALL");
  const [txSearch, setTxSearch] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, [activeTab, page, txStatusFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === "plans") {
        const data = await getAllSubscriptionPlansAdmin();
        setPlans(data);
      } else {
        const res = await getSubscriptionTransactionsAdmin(page, 15, txStatusFilter, txSearch);
        setTransactions(res.transactions);
        setTotalPages(res.pages);
        setTotalTransactions(res.total);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || err.message || "Failed to load subscription data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      name: "",
      description: "",
      price: 499,
      durationInDays: 30,
      features: "0% Commission on all orders\nUnlimited product catalog\nDirect customer payments\nStore analytics & order management",
      isActive: true,
      isPopular: false,
      sortOrder: (plans.length + 1),
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price: plan.price,
      durationInDays: plan.durationInDays,
      features: (plan.features || []).join("\n"),
      isActive: plan.isActive,
      isPopular: Boolean(plan.isPopular),
      sortOrder: plan.sortOrder || 0,
    });
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast("Plan name is required", "error");
      return;
    }
    if (formData.price < 0) {
      showToast("Price cannot be negative", "error");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        durationInDays: Number(formData.durationInDays),
        features: formData.features.split("\n").map((f) => f.trim()).filter(Boolean),
        isActive: formData.isActive,
        isPopular: formData.isPopular,
        sortOrder: Number(formData.sortOrder),
      };

      if (editingPlan) {
        await updateSubscriptionPlanAdmin(editingPlan._id, payload);
        showToast("Subscription plan updated successfully", "success");
      } else {
        await createSubscriptionPlanAdmin(payload);
        showToast("Subscription plan created successfully", "success");
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.message || "Failed to save plan", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      await updateSubscriptionPlanAdmin(plan._id, { isActive: !plan.isActive });
      showToast(`Plan ${plan.isActive ? "deactivated" : "activated"}`, "success");
      fetchData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to update plan status", "error");
    }
  };

  const handleDeletePlan = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`Are you sure you want to delete the plan "${plan.name}"?`)) return;
    try {
      const msg = await deleteSubscriptionPlanAdmin(plan._id);
      showToast(msg || "Plan deleted successfully", "success");
      fetchData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to delete plan", "error");
    }
  };

  const totalRevenue = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const totalSubscribers = plans.reduce((sum, p) => sum + (p.activeSubscribers || 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Seller Subscription Plans</h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Monetize sellers through upfront subscription packages with 0% platform commission.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add New Plan
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Plans</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{plans.filter((p) => p.isActive).length}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Subscribed Sellers</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{totalSubscribers}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Platform Commission</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">0%</p>
            <span className="text-[11px] text-slate-400">100% earnings to seller</span>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8l-8 8M9 9h.01M15 15h.01" />
            </svg>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("plans")}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "plans"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Subscription Packages ({plans.length})
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "transactions"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Payment Transactions
        </button>
      </div>

      {/* Plans View */}
      {activeTab === "plans" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-400">Loading subscription plans...</div>
          ) : plans.length === 0 ? (
            <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-500 font-medium">No subscription plans found.</p>
              <button
                onClick={handleOpenCreateModal}
                className="mt-4 bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                Create First Plan
              </button>
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan._id}
                className={`bg-white rounded-2xl border transition-all flex flex-col justify-between p-6 ${
                  plan.isPopular
                    ? "border-rose-400 shadow-md ring-2 ring-rose-100"
                    : "border-slate-100 shadow-sm hover:shadow"
                } ${!plan.isActive ? "opacity-60 bg-slate-50/50" : ""}`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{plan.name}</h3>
                      {plan.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{plan.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {plan.isPopular && (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Popular
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          plan.isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {plan.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  <div className="my-5 p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-slate-900">₹{plan.price}</span>
                      <span className="text-xs text-slate-500">/ {plan.durationInDays} days</span>
                    </div>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                      {plan.activeSubscribers || 0} active store subscriber{(plan.activeSubscribers || 0) === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="space-y-2 mb-6">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Included Perks:</p>
                    <ul className="space-y-1.5">
                      {(plan.features || []).map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="text-emerald-500 flex-shrink-0">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    {plan.isActive ? "Deactivate" : "Activate"}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(plan)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Transactions View */}
      {activeTab === "transactions" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-slate-800">Subscription History</h3>
              <p className="text-xs text-slate-500">Live audit log of all completed Razorpay subscription payments.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                {(["ALL", "SUCCESS", "PENDING", "FAILED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setTxStatusFilter(st);
                      setPage(1);
                    }}
                    className={`px-3 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                      txStatusFilter === st
                        ? "bg-white text-rose-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  fetchData();
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  placeholder="Search mobile, order..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="px-3 py-1 text-xs border border-slate-200 rounded-lg focus:outline-rose-500 w-36 sm:w-44"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  🔍
                </button>
              </form>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {totalTransactions} Records
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Seller Store</th>
                  <th className="py-3.5 px-4">Mobile</th>
                  <th className="py-3.5 px-4">Plan Name</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Validity Period</th>
                  <th className="py-3.5 px-4">Payment ID</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">Loading transactions...</td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">No subscription payments recorded yet.</td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {tx.sellerName}
                        {tx.sellerId?.storeName && (
                          <span className="block text-[11px] font-normal text-slate-500">{tx.sellerId.storeName}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">{tx.sellerMobile}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{tx.planName}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">₹{tx.amount}</td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(tx.startDate).toLocaleDateString("en-IN")} → {new Date(tx.endDate).toLocaleDateString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 select-all">
                        {tx.razorpayPaymentId}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-emerald-50 text-emerald-600 font-semibold px-2.5 py-0.5 rounded-full text-[10px] uppercase">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded text-slate-700 font-medium"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded text-slate-700 font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg">
                {editingPlan ? "Edit Subscription Plan" : "Create New Subscription Plan"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Starter, Quarterly Pro"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Short summary of who this plan is best suited for"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (₹ INR) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (Days) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="30, 90, 365"
                    value={formData.durationInDays}
                    onChange={(e) => setFormData({ ...formData, durationInDays: Number(e.target.value) })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Features (One per line)</label>
                <textarea
                  rows={4}
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="0% Commission on all orders&#10;Unlimited product catalog&#10;Priority store listing"
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  Active (Visible to Sellers)
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPopular}
                    onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  Show 'Popular' Badge
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm"
                >
                  {saving ? "Saving..." : editingPlan ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

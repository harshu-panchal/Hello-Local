import { useState, useEffect, useCallback } from 'react';
import { getSellerCustomers, SellerCustomer } from '../../../services/api/sellerCustomerService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerStatCard } from '../components/common/SellerStatCard';
import { SellerButton } from '../components/common/SellerButton';
import { useToast } from '../../../context/ToastContext';

export default function SellerCustomers() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<SellerCustomer[]>([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalOrders: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSellerCustomers({
        search: search.trim() || undefined,
        channel,
        page,
        limit: 15,
      });

      if (res.success) {
        setCustomers(res.data || []);
        if (res.stats) setStats(res.stats);
        if (res.pagination) setTotalPages(res.pagination.pages || 1);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, channel, page, showToast]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCustomers();
    }, 300);
    return () => clearTimeout(handler);
  }, [fetchCustomers]);

  const handleWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(`Hello ${name}, thank you for shopping with us! How can we assist you today?`);
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, '_blank');
  };

  const handleCall = (phone: string) => {
    window.open(`tel:${phone}`, '_self');
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6 pb-16">
      {/* Header */}
      <SellerPageHeader
        title="Store Customers"
        subtitle="Manage regular customers, contact details, and repeat purchase insights."
      />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <SellerStatCard
          label="TOTAL CUSTOMERS"
          value={stats.totalCustomers}
          variant="purple"
          icon={<span className="text-xl">👥</span>}
        />
        <SellerStatCard
          label="TOTAL ORDERS"
          value={stats.totalOrders}
          variant="emerald"
          icon={<span className="text-xl">🛍️</span>}
        />
        <SellerStatCard
          label="TOTAL SPEND"
          value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}
          variant="amber"
          icon={<span className="text-xl">💰</span>}
        />
      </div>

      {/* Search & Channel Filter Bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search by customer name, phone, or city..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
          />
        </div>

        {/* Channel Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          {(['ALL', 'ONLINE', 'OFFLINE'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => {
                setChannel(ch);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                channel === ch
                  ? 'bg-white text-purple-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ch === 'ALL' ? 'All Customers' : ch === 'ONLINE' ? 'Online' : 'In-Store POS'}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List / Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-slate-200/80 text-center space-y-3 shadow-2xs">
          <span className="text-4xl">👥</span>
          <h4 className="text-base font-bold text-slate-800">No customers found</h4>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            {search
              ? 'No customers match your search criteria. Try a different query.'
              : 'As customers place online orders or purchase through POS billing, they will be cataloged here automatically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((cust) => {
            const initials = cust.name ? cust.name.charAt(0).toUpperCase() : 'C';
            const channelBadge =
              cust.channel === 'BOTH'
                ? 'Online & POS'
                : cust.channel === 'OFFLINE'
                ? 'In-Store POS'
                : 'Online Delivery';

            return (
              <div
                key={cust.id || cust.phone}
                className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Left: Avatar + Details */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-100 to-indigo-100 border border-purple-200 flex items-center justify-center text-base font-black text-purple-700 flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-slate-900 truncate">
                        {cust.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {channelBadge}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
                      {cust.phone && <span>📞 {cust.phone}</span>}
                      {cust.city && <span>📍 {cust.city}</span>}
                      <span>
                        🕒 Last ordered:{' '}
                        {new Date(cust.lastOrderDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Stats + Quick Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <span className="text-xs sm:text-sm font-black text-slate-900 block">
                      ₹{cust.totalSpent.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {cust.orderCount} {cust.orderCount === 1 ? 'order' : 'orders'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {cust.phone && (
                      <>
                        <button
                          onClick={() => handleCall(cust.phone)}
                          className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 flex items-center justify-center text-sm font-bold transition-all active:scale-95"
                          title="Call Customer"
                        >
                          📞
                        </button>
                        <button
                          onClick={() => handleWhatsApp(cust.phone, cust.name)}
                          className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center text-sm font-bold transition-all active:scale-95"
                          title="WhatsApp Customer"
                        >
                          💬
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <SellerButton
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </SellerButton>
          <span className="text-xs font-bold text-slate-600 px-3">
            Page {page} of {totalPages}
          </span>
          <SellerButton
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </SellerButton>
        </div>
      )}
    </div>
  );
}

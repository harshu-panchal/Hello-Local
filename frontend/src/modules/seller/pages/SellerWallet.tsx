import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import { getSellerProfile } from '../../../services/api/auth/sellerAuthService';
import {
  getSellerWalletBalance,
  getSellerWalletTransactions,
  requestSellerWithdrawal,
  getSellerWithdrawals,
  getSellerCommissions,
} from '../../../services/api/sellerWalletService';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerStatCard } from '../components/common/SellerStatCard';
import { SellerTabs } from '../components/common/SellerTabs';
import { SellerDataTable, ColumnDef } from '../components/common/SellerDataTable';
import { SellerButton } from '../components/common/SellerButton';
import { SellerModal } from '../components/common/SellerModal';
import { SellerStatusBadge } from '../components/common/SellerStatusBadge';
import { SellerFormField } from '../components/common/SellerFormField';

type Tab = 'transactions' | 'withdrawals' | 'commissions';

export default function SellerWallet() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [hasBankDetails, setHasBankDetails] = useState(true);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any>({ commissions: [], total: 0, paid: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'UPI'>('Bank Transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MIN_WITHDRAWAL = 100;

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      const [balanceRes, transactionsRes, withdrawalsRes, commissionsRes, profileRes] = await Promise.all([
        getSellerWalletBalance(),
        getSellerWalletTransactions(),
        getSellerWithdrawals(),
        getSellerCommissions(),
        getSellerProfile(),
      ]);

      if (balanceRes.success) setBalance(balanceRes.data.balance);
      if (transactionsRes.success) setTransactions(transactionsRes.data.transactions || []);
      if (withdrawalsRes.success) setWithdrawals(withdrawalsRes.data || []);
      if (commissionsRes.success) setCommissions(commissionsRes.data);
      if (profileRes.success) {
        const p = profileRes.data || {};
        setHasBankDetails(Boolean(p.accountNumber && p.ifsc));
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to load wallet data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawRequest = async () => {
    try {
      const amount = parseFloat(withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }

      if (amount < MIN_WITHDRAWAL) {
        showToast(`Minimum withdrawal amount is ₹${MIN_WITHDRAWAL}`, 'error');
        return;
      }

      if (amount > balance) {
        showToast('Insufficient balance', 'error');
        return;
      }

      setIsSubmitting(true);
      const response = await requestSellerWithdrawal(amount, paymentMethod);
      if (response.success) {
        showToast('Withdrawal request submitted successfully', 'success');
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        setActiveTab('withdrawals');
        fetchWalletData();
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to request withdrawal', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 1. Transaction Columns
  const transactionColumns: ColumnDef<any>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (tx) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
            tx.type === 'credit'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {tx.type === 'credit' ? '↓ Credit' : '↑ Debit'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (tx) => (
        <div>
          <span className="font-bold text-slate-900 block text-xs sm:text-sm">{tx.description}</span>
          <span className="text-[10px] text-slate-400 block">{formatDate(tx.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (tx) => (
        <span
          className={`font-black text-xs sm:text-sm ${
            tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {tx.type === 'credit' ? '+' : '-'}₹{tx.amount?.toFixed(2)}
        </span>
      ),
    },
  ];

  // 2. Withdrawal Columns
  const withdrawalColumns: ColumnDef<any>[] = [
    {
      key: 'amount',
      header: 'Withdrawal Amount',
      render: (w) => (
        <div>
          <span className="font-black text-slate-900 text-sm block">₹{w.amount?.toFixed(2)}</span>
          <span className="text-[10px] text-slate-400 block">{formatDate(w.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: (w) => (
        <span className="text-xs font-bold text-slate-700">{w.paymentMethod || 'Bank Transfer'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (w) => <SellerStatusBadge status={w.status} size="sm" />,
    },
  ];

  // 3. Commission Columns
  const commissionColumns: ColumnDef<any>[] = [
    {
      key: 'orderId',
      header: 'Order Reference',
      render: (c) => (
        <div>
          <span className="font-bold text-purple-700 block text-xs sm:text-sm">
            #{c.orderId?.orderNumber || c.orderId?._id?.slice(-6).toUpperCase() || 'Order'}
          </span>
          <span className="text-[10px] text-slate-400 block">{formatDate(c.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'orderAmount',
      header: 'Order Amount',
      render: (c) => <span className="text-xs text-slate-700 font-bold">₹{c.orderAmount?.toFixed(2)}</span>,
    },
    {
      key: 'commissionAmount',
      header: 'Admin Fee',
      render: (c) => (
        <span className="font-bold text-rose-600 text-xs sm:text-sm">₹{c.commissionAmount?.toFixed(2)}</span>
      ),
    },
    {
      key: 'sellerAmount',
      header: 'Net Earning',
      render: (c) => (
        <span className="font-black text-emerald-600 text-xs sm:text-sm">₹{c.sellerAmount?.toFixed(2)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (c) => <SellerStatusBadge status={c.status || 'Paid'} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <SellerPageHeader
        title="Seller Wallet & Payouts"
        subtitle="Manage earnings, track admin commissions, and request bank payouts."
        breadcrumbs={[{ label: "Wallet" }]}
        action={
          <SellerButton
            variant="primary"
            size="md"
            onClick={() => {
              if (!hasBankDetails) {
                showToast('Please add bank details in Profile Settings before withdrawing', 'error');
                navigate('/seller/profile');
                return;
              }
              setShowWithdrawModal(true);
            }}
            disabled={balance < MIN_WITHDRAWAL}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            }
          >
            Request Payout
          </SellerButton>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <SellerStatCard
          label="Available Balance"
          value={`₹${balance.toFixed(2)}`}
          variant="purple"
          subtext={`Min payout: ₹${MIN_WITHDRAWAL}`}
        />
        <SellerStatCard
          label="Total Commissions"
          value={`₹${(commissions.total || 0).toFixed(2)}`}
          variant="default"
        />
        <SellerStatCard
          label="Paid to Platform"
          value={`₹${(commissions.paid || 0).toFixed(2)}`}
          variant="emerald"
        />
        <SellerStatCard
          label="Pending Platform Fee"
          value={`₹${(commissions.pending || 0).toFixed(2)}`}
          variant="default"
        />
      </div>

      {/* Bank Details Missing Alert */}
      {!hasBankDetails && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>Bank details not linked. Please update your account details to enable withdrawals.</span>
          </div>
          <SellerButton
            variant="secondary"
            size="sm"
            onClick={() => navigate('/seller/profile')}
            className="flex-shrink-0"
          >
            Update Bank Info
          </SellerButton>
        </div>
      )}

      {/* Wallet Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 sm:p-3 shadow-xs">
        <SellerTabs
          tabs={[
            { id: 'transactions', label: 'Wallet Transactions' },
            { id: 'withdrawals', label: 'Payout Requests' },
            { id: 'commissions', label: 'Commissions Breakdown' },
          ]}
          activeTab={activeTab}
          onChange={(t) => setActiveTab(t as Tab)}
        />
      </div>

      {/* Tab Contents */}
      {activeTab === 'transactions' && (
        <SellerDataTable
          data={transactions}
          columns={transactionColumns}
          keyExtractor={(tx, i) => tx._id || i.toString()}
          isLoading={loading}
          emptyTitle="No transactions yet"
          emptyDescription="Your wallet activity and order credits will appear here."
          renderMobileCard={(tx) => (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
              <div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    tx.type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {tx.type === 'credit' ? 'Credit' : 'Debit'}
                </span>
                <h4 className="font-bold text-slate-900 text-xs sm:text-sm mt-1">{tx.description}</h4>
                <p className="text-[10px] text-slate-400">{formatDate(tx.createdAt)}</p>
              </div>
              <span
                className={`font-black text-sm ${
                  tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {tx.type === 'credit' ? '+' : '-'}₹{tx.amount?.toFixed(2)}
              </span>
            </div>
          )}
        />
      )}

      {activeTab === 'withdrawals' && (
        <SellerDataTable
          data={withdrawals}
          columns={withdrawalColumns}
          keyExtractor={(w, i) => w._id || i.toString()}
          isLoading={loading}
          emptyTitle="No payout requests"
          emptyDescription="You have not requested any wallet withdrawals yet."
          renderMobileCard={(w) => (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-900">₹{w.amount?.toFixed(2)}</p>
                <p className="text-xs text-slate-500">{w.paymentMethod || 'Bank Transfer'}</p>
                <p className="text-[10px] text-slate-400">{formatDate(w.createdAt)}</p>
              </div>
              <SellerStatusBadge status={w.status} size="sm" />
            </div>
          )}
        />
      )}

      {activeTab === 'commissions' && (
        <SellerDataTable
          data={commissions.commissions || []}
          columns={commissionColumns}
          keyExtractor={(c, i) => c._id || i.toString()}
          isLoading={loading}
          emptyTitle="No commission entries"
          emptyDescription="Platform fees associated with online orders will be tracked here."
          renderMobileCard={(c) => (
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-700 text-xs">
                  #{c.orderId?.orderNumber || c.orderId?._id?.slice(-6).toUpperCase() || 'Order'}
                </span>
                <SellerStatusBadge status={c.status || 'Paid'} size="sm" />
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <span className="text-slate-500">Order: ₹{c.orderAmount?.toFixed(2)}</span>
                <span className="text-rose-600 font-bold">Fee: ₹{c.commissionAmount?.toFixed(2)}</span>
                <span className="text-emerald-600 font-black">Net: ₹{c.sellerAmount?.toFixed(2)}</span>
              </div>
            </div>
          )}
        />
      )}

      {/* Withdrawal Request Modal */}
      <SellerModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        title="Request Wallet Payout"
        description={`Available balance: ₹${balance.toFixed(2)} • Minimum: ₹${MIN_WITHDRAWAL}`}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => setShowWithdrawModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </SellerButton>
            <SellerButton
              variant="primary"
              size="md"
              onClick={handleWithdrawRequest}
              isLoading={isSubmitting}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) < MIN_WITHDRAWAL || parseFloat(withdrawAmount) > balance}
            >
              Submit Request
            </SellerButton>
          </div>
        }
      >
        <div className="space-y-4">
          <SellerFormField label="Withdrawal Amount (₹)" required>
            <input
              type="number"
              min={MIN_WITHDRAWAL}
              max={balance}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={`Enter amount (min ₹${MIN_WITHDRAWAL})`}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[44px]"
            />
          </SellerFormField>

          <SellerFormField label="Payout Method">
            <div className="grid grid-cols-2 gap-3">
              {(['Bank Transfer', 'UPI'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all min-h-[44px] ${
                    paymentMethod === m
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </SellerFormField>
        </div>
      </SellerModal>
    </div>
  );
}

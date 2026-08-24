import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SellerStoreBannerCard from '../components/SellerStoreBannerCard';
import SellerTodayOverview from '../components/SellerTodayOverview';
import SellerPromoCards from '../components/SellerPromoCards';
import SellerQuickActionsGrid from '../components/SellerQuickActionsGrid';
import SellerRecentOrdersFeed from '../components/SellerRecentOrdersFeed';
import OrderChart from '../components/OrderChart';
import { getSellerDashboardStats, DashboardStats, NewOrder } from '../../../services/api/dashboardService';
import { getSellerProfile, toggleShopStatus } from '../../../services/api/auth/sellerAuthService';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { SellerPageHeader } from '../components/common/SellerPageHeader';
import { SellerButton } from '../components/common/SellerButton';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [newOrders, setNewOrders] = useState<NewOrder[]>([]);
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isShopOpen, setIsShopOpen] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [statsResponse, profileResponse] = await Promise.all([
        getSellerDashboardStats(),
        getSellerProfile(),
      ]);

      if (statsResponse.success) {
        setStats(statsResponse.data.stats);
        setNewOrders(statsResponse.data.newOrders || []);
      } else {
        setError(statsResponse.message || 'Failed to fetch dashboard data');
      }

      if (profileResponse.success) {
        setSellerProfile(profileResponse.data);
        const shopStatus = profileResponse.data.isShopOpen ?? true;
        setIsShopOpen(shopStatus);
      }

      if (isManualRefresh) {
        showToast('Dashboard telemetry refreshed', 'success');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error loading dashboard data';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleToggleShop = async () => {
    try {
      setStatusLoading(true);
      const response = await toggleShopStatus();

      if (response.success) {
        const nextStatus = response.data.isShopOpen;
        setIsShopOpen(nextStatus);
        showToast(
          nextStatus
            ? 'Store is now OPEN & accepting online customer orders!'
            : 'Store is now CLOSED. Online ordering paused.',
          'success'
        );
      } else {
        showToast('Failed to toggle shop status: ' + (response.message || 'Unknown error'), 'error');
      }
    } catch (error: any) {
      showToast('Error toggling shop status: ' + (error.response?.data?.message || error.message || 'Unknown error'), 'error');
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-6 pb-12 animate-pulse">
        {/* Header Skeleton */}
        <div className="h-14 rounded-2xl bg-slate-200" />
        {/* Banner Skeleton */}
        <div className="h-36 sm:h-28 rounded-3xl bg-slate-200" />
        {/* Overview Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
          <div className="h-28 rounded-2xl bg-slate-200" />
        </div>
        {/* 2-col Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-44 rounded-3xl bg-slate-200" />
            <div className="h-64 rounded-3xl bg-slate-200" />
          </div>
          <div className="lg:col-span-4 space-y-4">
            <div className="h-36 rounded-3xl bg-slate-200" />
            <div className="h-36 rounded-3xl bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 text-center bg-white rounded-3xl shadow-sm border border-slate-200 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl">
          ⚠️
        </div>
        <h3 className="text-base font-bold text-slate-900">Unable to load dashboard</h3>
        <p className="text-xs sm:text-sm text-slate-500">{error}</p>
        <SellerButton variant="primary" size="md" onClick={() => fetchDashboardData(true)} fullWidth className="min-h-[44px]">
          Try Again
        </SellerButton>
      </div>
    );
  }

  const storeName = sellerProfile?.storeName || user?.storeName || (user as any)?.name || 'Local Merchant Store';
  const storeAddress = sellerProfile?.address || (user as any)?.address || (user as any)?.city || 'Store Address Not Set';
  const storeLogo = sellerProfile?.logo || sellerProfile?.profileImage || (user as any)?.profileImage;
  const storeSlug = sellerProfile?.slug || (user as any)?.slug || 'my-store';

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6 pb-12">
      {/* Header */}
      <SellerPageHeader
        title="Seller Dashboard"
        subtitle="Live sales overview, in-store POS, order fulfillment, and store controls."
        action={
          <div className="flex items-center gap-2">
            <SellerButton
              variant="outline"
              size="md"
              onClick={() => fetchDashboardData(true)}
              isLoading={refreshing}
              className="min-h-[44px]"
              icon={<span>🔄</span>}
            >
              Refresh
            </SellerButton>
            <SellerButton
              variant="primary"
              size="md"
              onClick={() => navigate('/seller/pos')}
              className="min-h-[44px]"
              icon={<span>⚡</span>}
            >
              Quick POS
            </SellerButton>
          </div>
        }
      />

      {/* 1. Royal Purple Store Identity Banner Card - Full Width */}
      <SellerStoreBannerCard
        storeName={storeName}
        address={storeAddress}
        logo={storeLogo}
        isShopOpen={isShopOpen}
        onToggleShop={handleToggleShop}
        statusLoading={statusLoading}
      />

      {/* 2. Today's Overview (2x2 on Mobile, 4x1 on Desktop) */}
      <SellerTodayOverview
        ordersCount={stats?.totalOrders ?? 0}
        revenueAmount={stats?.totalRevenue ?? 0}
        viewsCount={stats?.totalUser ? stats.totalUser * 12 : 0}
        newCustomersCount={stats?.totalUser ?? 0}
      />

      {/* 3. Responsive Desktop / Mobile Layout Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols on Desktop): Quick Actions, Recent Orders & Analytics */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Actions Grid */}
          <SellerQuickActionsGrid />

          {/* Recent Orders Live Feed */}
          <SellerRecentOrdersFeed orders={newOrders} />

          {/* Analytics Charts */}
          {stats && (stats.dailyOrderData || stats.yearlyOrderData) && (
            <div className="pt-4 border-t border-slate-200/80 space-y-4">
              <h3 className="text-base font-black text-slate-900 tracking-tight px-1">
                Order Trends & Analytics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.dailyOrderData && stats.dailyOrderData.length > 0 && (
                  <OrderChart
                    title={`Daily Orders (${new Date().toLocaleString('default', { month: 'short' })})`}
                    data={stats.dailyOrderData}
                    maxValue={Math.max(...stats.dailyOrderData.map(d => d.value), 5)}
                    height={280}
                  />
                )}
                {stats.yearlyOrderData && stats.yearlyOrderData.length > 0 && (
                  <OrderChart
                    title={`Yearly Orders (${new Date().getFullYear()})`}
                    data={stats.yearlyOrderData}
                    maxValue={Math.max(...stats.yearlyOrderData.map(d => d.value), 20)}
                    height={280}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (4 cols on Desktop): Promotional & Growth Cards */}
        <div className="lg:col-span-4 space-y-6">
          <SellerPromoCards storeSlug={storeSlug} />
        </div>
      </div>
    </div>
  );
}

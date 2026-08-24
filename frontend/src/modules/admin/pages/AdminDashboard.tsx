import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardCard from "../components/DashboardCard";
import OrderChart from "../components/OrderChart";
import SalesLineChart from "../components/SalesLineChart";
import GaugeChart from "../components/GaugeChart";
import ErrorBoundary from "../../../components/ErrorBoundary";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import {
  getDashboardStats,
  getSalesAnalytics,
  getOrderAnalytics,
  getTodaySales,
  getTopSellers,
  getRecentOrders,
  getSalesByLocation,
  type DashboardStats,
  type TopSeller,
  type RecentOrder,
  type SalesByLocation,
  type SalesAnalytics,
  type TodaySales,
} from "../../../services/api/admin/adminDashboardService";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [newOrders, setNewOrders] = useState<RecentOrder[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [salesByLocation, setSalesByLocation] = useState<SalesByLocation[]>([]);
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAnalytics | null>(null);
  const [orderAnalytics, setOrderAnalytics] = useState<SalesAnalytics | null>(null);
  const [orderAnalyticsDaily, setOrderAnalyticsDaily] = useState<SalesAnalytics | null>(null);
  const [todaySales, setTodaySales] = useState<TodaySales | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination for tables
  const [entriesPerPageNewOrders, setEntriesPerPageNewOrders] = useState(10);
  const [currentPageNewOrders, setCurrentPageNewOrders] = useState(1);
  const [entriesPerPageTopSellers, setEntriesPerPageTopSellers] = useState(10);
  const [currentPageTopSellers, setCurrentPageTopSellers] = useState(1);

  // Dynamic Month & Year labels
  const currentMonthName = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const currentYear = new Date().getFullYear();

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch all dashboard data in parallel
      const [
        statsResponse,
        ordersResponse,
        sellersResponse,
        locationResponse,
        analyticsResponse,
        orderAnalyticsResponse,
        orderAnalyticsDailyResponse,
        todaySalesResponse,
      ] = await Promise.all([
        getDashboardStats(),
        getRecentOrders(20),
        getTopSellers(20),
        getSalesByLocation(),
        getSalesAnalytics("day"),
        getOrderAnalytics("month"),
        getOrderAnalytics("day"),
        getTodaySales(),
      ]);

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }

      if (ordersResponse.success && ordersResponse.data) {
        setNewOrders(ordersResponse.data);
      }

      if (sellersResponse.success && sellersResponse.data) {
        setTopSellers(sellersResponse.data);
      }

      if (locationResponse.success && locationResponse.data) {
        setSalesByLocation(locationResponse.data);
      }

      if (analyticsResponse.success && analyticsResponse.data) {
        setSalesAnalytics(analyticsResponse.data);
      }

      if (orderAnalyticsResponse.success && orderAnalyticsResponse.data) {
        setOrderAnalytics(orderAnalyticsResponse.data);
      }

      if (orderAnalyticsDailyResponse.success && orderAnalyticsDailyResponse.data) {
        setOrderAnalyticsDaily(orderAnalyticsDailyResponse.data);
      }

      if (todaySalesResponse.success && todaySalesResponse.data) {
        setTodaySales(todaySalesResponse.data);
      }

      if (isManualRefresh) {
        showToast("Dashboard analytics refreshed with live data!", "success");
      }
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
      const errMsg = err.response?.data?.message || "Failed to load dashboard data. Please try again.";
      setError(errMsg);
      if (isManualRefresh) {
        showToast(errMsg, "error");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated, token, showToast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Icons for KPI cards
  const userIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const categoryIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );

  const subcategoryIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );

  const productIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );

  const ordersIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );

  const completedOrdersIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  const pendingOrdersIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );

  const cancelledOrdersIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );

  const soldOutIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </svg>
  );

  const lowStockIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  const adsIcon = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  // Transform sales analytics data for charts
  const salesThisMonth = salesAnalytics?.thisPeriod || [];
  const salesLastMonth = salesAnalytics?.lastPeriod || [];

  // Order analytics data
  const orderDataMonth = orderAnalyticsDaily?.thisPeriod || [];
  const orderDataYear = orderAnalytics?.thisPeriod || [];

  // Table pagination calculations
  const totalPagesNewOrders = Math.ceil(newOrders.length / entriesPerPageNewOrders) || 1;
  const startIndexNewOrders = (currentPageNewOrders - 1) * entriesPerPageNewOrders;
  const endIndexNewOrders = Math.min(startIndexNewOrders + entriesPerPageNewOrders, newOrders.length);
  const displayedNewOrders = newOrders.slice(startIndexNewOrders, endIndexNewOrders);

  const totalPagesTopSellers = Math.ceil(topSellers.length / entriesPerPageTopSellers) || 1;
  const startIndexTopSellers = (currentPageTopSellers - 1) * entriesPerPageTopSellers;
  const endIndexTopSellers = Math.min(startIndexTopSellers + entriesPerPageTopSellers, topSellers.length);
  const displayedTopSellers = topSellers.slice(startIndexTopSellers, endIndexTopSellers);

  // Sales metrics
  const salesToday = todaySales?.salesToday || 0;
  const salesLastWeekSameDay = todaySales?.salesLastWeekSameDay || 0;
  const salesDifference = salesToday - salesLastWeekSameDay;
  const salesPercentChange =
    salesLastWeekSameDay > 0
      ? ((salesDifference / salesLastWeekSameDay) * 100).toFixed(0)
      : salesToday > 0 ? "100" : "0";

  // Dynamic AOV gauge ceiling
  const maxGaugeValue = Math.max(1000, Math.ceil(((stats?.avgCompletedOrderValue || 0) * 1.5) / 100) * 100);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-10 h-10 border-4 border-rose-700 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-neutral-600">Aggregating executive dashboard analytics...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 max-w-md mx-auto text-center">
        <span className="text-4xl">⚠️</span>
        <h3 className="text-base font-bold text-neutral-900">Dashboard Analytics Unavailable</h3>
        <p className="text-xs text-neutral-500">{error || "Failed to load dashboard metrics."}</p>
        <button
          type="button"
          onClick={() => fetchDashboardData(false)}
          className="bg-rose-700 hover:bg-rose-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[44px] shadow-sm"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Executive Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>📊</span> Admin Analytics & Command Center
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            Real-time platform telemetry, merchant leaderboard, and 10-minute order velocity
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-800 px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[44px] flex items-center gap-2 shadow-xs"
          >
            <span className={`text-sm ${refreshing ? "animate-spin" : ""}`}>🔄</span>
            <span>{refreshing ? "Refreshing..." : "Refresh Live Data"}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid - Responsive Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <DashboardCard
          icon={userIcon}
          title="Total Users"
          value={stats.totalUser}
          accentColor="#e11d48"
          onClick={() => navigate("/admin/users")}
        />
        <DashboardCard
          icon={categoryIcon}
          title="Categories"
          value={stats.totalCategory}
          accentColor="#eab308"
          onClick={() => navigate("/admin/category")}
        />
        <DashboardCard
          icon={subcategoryIcon}
          title="Subcategories"
          value={stats.totalSubcategory ?? 0}
          accentColor="#8b5cf6"
          onClick={() => navigate("/admin/subcategory")}
        />
        <DashboardCard
          icon={productIcon}
          title="Active Products"
          value={stats.totalProduct}
          accentColor="#0284c7"
          onClick={() => navigate("/admin/product/list")}
        />
        <DashboardCard
          icon={ordersIcon}
          title="Total Orders"
          value={stats.totalOrders}
          accentColor="#2563eb"
          onClick={() => navigate("/admin/orders/all")}
        />
        <DashboardCard
          icon={completedOrdersIcon}
          title="Delivered Orders"
          value={stats.completedOrders}
          accentColor="#16a34a"
          onClick={() => navigate("/admin/orders/delivered")}
        />
        <DashboardCard
          icon={pendingOrdersIcon}
          title="Pending Orders"
          value={stats.pendingOrders}
          accentColor="#d97706"
          onClick={() => navigate("/admin/orders/pending")}
        />
        <DashboardCard
          icon={cancelledOrdersIcon}
          title="Cancelled Orders"
          value={stats.cancelledOrders}
          accentColor="#dc2626"
          onClick={() => navigate("/admin/orders/cancelled")}
        />
        <DashboardCard
          icon={soldOutIcon}
          title="Sold Out Stock"
          value={stats.soldOutProducts}
          accentColor="#be123c"
          onClick={() => navigate("/admin/product/list")}
        />
        <DashboardCard
          icon={lowStockIcon}
          title="Low on Stock"
          value={stats.lowStockProducts}
          accentColor="#ca8a04"
          onClick={() => navigate("/admin/product/list")}
        />
        <DashboardCard
          icon={adsIcon}
          title="Ad Requests"
          value={stats.pendingAdRequests || 0}
          accentColor="#7c3aed"
          onClick={() => navigate("/admin/shop-ads?tab=requests")}
        />
      </div>

      {/* Sales Velocity & Location Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
        {/* Total Sales Today */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">
                Total Storefront Sales Today
              </h2>
              <div className="mt-1 flex items-baseline gap-3">
                <p className="text-3xl font-extrabold text-neutral-900 tracking-tight">
                  ₹{salesToday.toFixed(2)}
                </p>
                {salesDifference >= 0 ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    ▲ +₹{Math.abs(salesDifference).toFixed(2)} (+{salesPercentChange}%) vs last week
                  </span>
                ) : (
                  <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md">
                    ▼ -₹{Math.abs(salesDifference).toFixed(2)} ({salesPercentChange}%) vs last week
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-neutral-400 font-medium">Daily Trend</span>
          </div>

          <SalesLineChart
            thisMonthData={salesThisMonth}
            lastMonthData={salesLastMonth}
            height={220}
          />
        </div>

        {/* Sales by Micro-Market & Average Order Value (AOV) */}
        <div className="space-y-4 sm:space-y-6">
          {/* Sales by City Location */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5">
            <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-3">
              Sales by Micro-Market / City
            </h3>
            <div className="space-y-2.5 max-h-[160px] overflow-y-auto">
              {salesByLocation.length > 0 ? (
                salesByLocation.map((location, index) => (
                  <div key={index} className="flex items-center justify-between text-xs py-1 border-b border-neutral-100 last:border-0">
                    <span className="text-neutral-600 font-medium">{location.location}</span>
                    <span className="font-bold text-neutral-900">
                      ₹{location.amount >= 1000 ? `${(location.amount / 1000).toFixed(1)}K` : location.amount.toFixed(2)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-neutral-400 italic">No geographic location sales data</p>
              )}
            </div>
          </div>

          {/* Average Order Value Gauge */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-5">
            <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
              Avg. Completed Order Value (AOV)
            </h3>
            <GaugeChart
              value={stats.avgCompletedOrderValue}
              maxValue={maxGaugeValue}
              label="Platform AOV"
            />
          </div>
        </div>
      </div>

      {/* Dynamic Order Velocity Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ErrorBoundary fallback={<div className="text-xs text-red-600 p-4">Daily chart error</div>}>
          <OrderChart
            title={`Orders — ${currentMonthName}`}
            data={orderDataMonth}
            maxValue={orderDataMonth.length > 0 ? Math.max(10, ...orderDataMonth.map((d) => Math.ceil((d.value || 0) * 1.2))) : 10}
            height={320}
          />
        </ErrorBoundary>

        <ErrorBoundary fallback={<div className="text-xs text-red-600 p-4">Annual chart error</div>}>
          <OrderChart
            title={`Annual Order Velocity (${currentYear})`}
            data={orderDataYear}
            maxValue={orderDataYear.length > 0 ? Math.max(50, ...orderDataYear.map((d) => Math.ceil((d.value || 0) * 1.2))) : 50}
            height={320}
          />
        </ErrorBoundary>
      </div>

      {/* Recent Orders & Merchant Leaderboards Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* Table 1: In-Flight Recent Orders */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>📦</span> In-Flight Recent Orders
            </h3>
            <span className="text-xs text-rose-100 font-semibold">{newOrders.length} Recent</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-xs text-neutral-800 font-medium">
                {displayedNewOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                      No recent orders in the queue
                    </td>
                  </tr>
                ) : (
                  displayedNewOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-neutral-900">
                        {order.orderNumber || `#${order.id.slice(-6)}`}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{order.customerName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-700">
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-neutral-900">₹{order.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                          className="bg-rose-700 hover:bg-rose-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors min-h-[32px]"
                          aria-label={`View order ${order.orderNumber || order.id}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
            <span>
              Showing {newOrders.length > 0 ? startIndexNewOrders + 1 : 0} to {endIndexNewOrders} of {newOrders.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPageNewOrders((prev) => Math.max(1, prev - 1))}
                disabled={currentPageNewOrders <= 1}
                className="px-2.5 py-1 border border-neutral-300 rounded-lg bg-white text-xs font-bold disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-2 font-bold">{currentPageNewOrders}</span>
              <button
                type="button"
                onClick={() => setCurrentPageNewOrders((prev) => Math.min(totalPagesNewOrders, prev + 1))}
                disabled={currentPageNewOrders >= totalPagesNewOrders}
                className="px-2.5 py-1 border border-neutral-300 rounded-lg bg-white text-xs font-bold disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* Table 2: Top Performing Merchant Stores */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-neutral-900 text-white px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <span>🏪</span> Merchant Leaderboard
            </h3>
            <span className="text-xs text-neutral-300 font-semibold">{topSellers.length} Top Stores</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Store Name</th>
                  <th className="px-4 py-3">Merchant Name</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Total Gross</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-xs text-neutral-800 font-medium">
                {displayedTopSellers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                      No merchant sales data recorded
                    </td>
                  </tr>
                ) : (
                  displayedTopSellers.map((seller) => (
                    <tr key={seller.sellerId} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-neutral-900">{seller.storeName}</td>
                      <td className="px-4 py-3 text-neutral-600">{seller.sellerName}</td>
                      <td className="px-4 py-3 font-semibold text-neutral-700">{seller.totalOrders}</td>
                      <td className="px-4 py-3 font-bold text-neutral-900">₹{seller.totalRevenue.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate("/admin/manage-seller/list")}
                          className="bg-neutral-900 hover:bg-black text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors min-h-[32px]"
                          aria-label={`View store ${seller.storeName}`}
                        >
                          Directory
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
            <span>
              Showing {topSellers.length > 0 ? startIndexTopSellers + 1 : 0} to {endIndexTopSellers} of {topSellers.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPageTopSellers((prev) => Math.max(1, prev - 1))}
                disabled={currentPageTopSellers <= 1}
                className="px-2.5 py-1 border border-neutral-300 rounded-lg bg-white text-xs font-bold disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-2 font-bold">{currentPageTopSellers}</span>
              <button
                type="button"
                onClick={() => setCurrentPageTopSellers((prev) => Math.min(totalPagesTopSellers, prev + 1))}
                disabled={currentPageTopSellers >= totalPagesTopSellers}
                className="px-2.5 py-1 border border-neutral-300 rounded-lg bg-white text-xs font-bold disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-400 py-3">
        HelloLocal Admin Panel • Real-Time Enterprise Telemetry
      </footer>
    </div>
  );
}

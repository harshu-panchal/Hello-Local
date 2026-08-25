import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import DeliveryHeader from '../components/DeliveryHeader';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { useDeliveryStatus } from '../context/DeliveryStatusContext';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

// Helper component to center and fly the camera smoothly when GPS coordinates change
function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 14, { duration: 1.2 });
  }, [center, map]);
  return null;
}

// Custom Leaflet DivIcon for Delivery Partner Courier Pin
const courierIcon = L.divIcon({
  className: 'custom-courier-pin',
  html: `
    <div style="background-color: #e11d48; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(225,29,72,0.5); border: 2.5px solid white;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      </svg>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -34],
});

// Custom Leaflet DivIcon for Store Merchant Pins
const storeIcon = L.divIcon({
  className: 'custom-store-pin',
  html: `
    <div style="background-color: #e11d48; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(225,29,72,0.4); border: 2px solid white;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

export default function DeliverySellersInRange() {
  const navigate = useNavigate();
  const {
    isOnline,
    sellersInRange,
    isLoadingSellers,
    locationError,
    currentLocation,
    refreshSellersInRange,
    sellersInRangeCount,
  } = useDeliveryStatus();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isPendingApproval = ((user as any)?.status ?? 'Active') === 'Inactive';
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (locationError) {
      setError(locationError);
    } else {
      setError('');
    }
  }, [locationError]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSellersInRange();
      showToast('Service area radar refreshed', 'success');
    } catch (err: any) {
      showToast('Failed to refresh location radar', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Unapproved partners must not see sellers in range
  if (isPendingApproval) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center pb-24 px-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-sm w-full space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl border border-amber-200">
            ⏳
          </div>
          <h2 className="text-lg font-black text-slate-900">Pending Admin Approval</h2>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">
            Your delivery partner profile is currently undergoing verification. You can access live pickup zones once approved.
          </p>
          <button
            onClick={() => navigate('/delivery')}
            className="w-full bg-rose-600 text-white py-3 rounded-2xl font-black text-xs hover:bg-rose-700 transition-all shadow-md min-h-[44px]"
          >
            Return to Dashboard
          </button>
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center pb-24 px-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-sm w-full space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-slate-200">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h2 className="text-lg font-black text-slate-900">You are Offline</h2>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">
            Switch your duty status to Online to activate GPS proximity tracking and discover nearby merchant stores.
          </p>
          <button
            onClick={() => navigate('/delivery')}
            className="w-full bg-rose-600 text-white py-3 rounded-2xl font-black text-xs hover:bg-rose-700 transition-all shadow-md min-h-[44px]"
          >
            Go Online on Dashboard
          </button>
        </div>
        <DeliveryBottomNav />
      </div>
    );
  }

  const defaultCenter: [number, number] = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : [18.5204, 73.8567]; // Fallback to Pune coordinates

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <DeliveryHeader />

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Top Header & Refresh Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-white shadow-2xs border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
              aria-label="Back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-800">
                <path d="M15 18L9 12L15 6" />
              </svg>
            </button>
            <div>
              <h1 className="text-slate-900 text-base font-black tracking-tight">Active Service Areas</h1>
              <p className="text-[11px] text-slate-500 font-semibold">
                {sellersInRangeCount} {sellersInRangeCount === 1 ? 'store' : 'stores'} in pickup range
              </p>
            </div>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing || isLoadingSellers}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black shadow-2xs hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50 min-h-[40px]"
          >
            <span className={`inline-block ${isRefreshing || isLoadingSellers ? 'animate-spin' : ''}`}>🔄</span>
            <span>{isRefreshing || isLoadingSellers ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Visual React-Leaflet Radar Map */}
        {currentLocation && (
          <div className="bg-white rounded-3xl p-2 shadow-2xs border border-slate-200/80 overflow-hidden">
            <div className="h-56 w-full rounded-2xl overflow-hidden relative">
              <MapContainer
                center={defaultCenter}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapCenterUpdater center={defaultCenter} />

                {/* Delivery Boy Current Location Pin */}
                <Marker position={defaultCenter} icon={courierIcon}>
                  <Popup>
                    <div className="p-1 text-xs">
                      <p className="font-bold text-rose-600">Your Live GPS Location</p>
                      <p className="text-[10px] text-slate-500">You are currently active here</p>
                    </div>
                  </Popup>
                </Marker>

                {/* Sellers in Range Pins and Circles */}
                {sellersInRange.map((seller) => {
                  const hasCoords =
                    seller.location &&
                    Array.isArray(seller.location.coordinates) &&
                    seller.location.coordinates.length === 2;

                  if (!hasCoords) return null;

                  const sellerPos: [number, number] = [
                    seller.location!.coordinates[1],
                    seller.location!.coordinates[0],
                  ];

                  return (
                    <div key={seller._id}>
                      <Marker position={sellerPos} icon={storeIcon}>
                        <Popup>
                          <div className="p-1 text-xs">
                            <p className="font-bold text-rose-700">{seller.storeName}</p>
                            <p className="text-[10px] text-slate-500">{seller.address}</p>
                            <p className="text-[10px] font-semibold text-slate-700 mt-1">
                              Distance: {(seller.distanceFromDeliveryBoy / 1000).toFixed(2)} km
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                      <Circle
                        center={sellerPos}
                        radius={seller.serviceRadiusKm * 1000}
                        pathOptions={{
                          color: '#e11d48',
                          fillColor: '#fb7185',
                          fillOpacity: 0.12,
                          weight: 1.5,
                        }}
                      />
                    </div>
                  );
                })}
              </MapContainer>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900"></span>
                <span>Your Live Location</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                <span>Store Coverage Zone</span>
              </div>
            </div>
          </div>
        )}

        {/* Sellers in Range List */}
        {isLoadingSellers && !isRefreshing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-slate-500 text-xs font-bold">Scanning nearby merchant pickup zones...</p>
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-3xl text-rose-600 text-xs font-semibold text-center">
            {error}
          </div>
        ) : sellersInRange.length > 0 ? (
          <div className="space-y-2.5">
            {sellersInRange.map((seller) => (
              <div
                key={seller._id}
                className="bg-white rounded-3xl p-4 shadow-2xs border border-slate-200/80 hover:border-rose-300 transition-all group active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-slate-900 font-black text-sm truncate">{seller.storeName}</h3>
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-black rounded-full border border-rose-100 flex-shrink-0">
                        IN RANGE
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-xs mb-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-slate-400">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span className="truncate">{seller.address || 'Address not specified'}</span>
                    </div>

                    <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Distance</span>
                        <span className="text-xs font-black text-slate-800">
                          {(seller.distanceFromDeliveryBoy / 1000).toFixed(2)} km
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Store Radius</span>
                        <span className="text-xs font-black text-rose-700">
                          {seller.serviceRadiusKm} km
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center group-hover:bg-rose-100 transition-colors flex-shrink-0 border border-rose-100">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs space-y-3">
            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <h3 className="text-sm font-black text-slate-900">No Stores in Immediate Range</h3>
            <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
              You are currently outside registered merchant delivery zones. Move closer to commercial clusters to receive order dispatches.
            </p>
          </div>
        )}
      </div>

      <DeliveryBottomNav />
    </div>
  );
}

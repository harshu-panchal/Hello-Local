import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in React-Leaflet
// @ts-expect-error leaflet does not type the private _getIconUrl
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom store icon
const storeIcon = new L.DivIcon({
  html: `<div style="font-size: 24px; text-align: center; line-height: 1;">🏪</div>`,
  className: 'store-marker',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

interface SellerServiceMapProps {
  latitude: number;
  longitude: number;
  radiusKm: number;
  storeName: string;
}

// Helper component to dynamically fly/pan the map whenever center coordinates change
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 13, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [center[0], center[1], map]);

  return null;
}

export default function SellerServiceMap({
  latitude,
  longitude,
  radiusKm,
  storeName,
}: SellerServiceMapProps) {
  const position: [number, number] = [latitude, longitude];
  const radiusMeters = radiusKm * 1000;

  return (
    <div className="w-full h-full min-h-[350px] rounded-2xl overflow-hidden border border-neutral-200 shadow-sm relative z-0">
      <MapContainer
        center={position}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        scrollWheelZoom={true}
      >
        <MapUpdater center={position} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position} icon={storeIcon}>
          <Popup>
            <div className="p-1">
              <div className="font-bold text-neutral-900 text-sm">{storeName}</div>
              <div className="text-xs text-rose-700 font-semibold mt-0.5">
                Service Radius: {radiusKm} km
              </div>
            </div>
          </Popup>
        </Marker>
        <Circle
          center={position}
          radius={radiusMeters}
          pathOptions={{
            color: '#BE123C', // rose-700
            fillColor: '#BE123C',
            fillOpacity: 0.18,
            weight: 2.5,
          }}
        />
      </MapContainer>
    </div>
  );
}

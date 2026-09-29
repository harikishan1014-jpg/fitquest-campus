import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { MapPin } from "lucide-react";

function FollowWalkMap({ center }: { center: LatLngExpression }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

export default function LiveWalkMap({
  route,
  tracking,
  manual,
}: {
  route: [number, number][];
  tracking: boolean;
  manual?: boolean;
}) {
  const latest = route[route.length - 1];
  if (!latest) {
    return (
      <div className="walk-map walk-map-empty">
        <MapPin size={24} />
        <strong>{manual ? "Manual walk · GPS map off" : tracking ? "Waiting for a GPS fix" : "Live map appears when GPS starts"}</strong>
        <span>{manual ? "Manual mode records your time and entered distance estimate without using location." : tracking ? "Keep this screen open outdoors. The route will appear after a usable position arrives." : "Allow location access to see your position and route."}</span>
      </div>
    );
  }
  const center: LatLngExpression = latest;
  return (
    <div className="walk-map live-map-shell" aria-label="Live GPS map">
      <MapContainer center={center} zoom={17} scrollWheelZoom className="live-leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FollowWalkMap center={center} />
        {route.length > 1 && (
          <Polyline
            positions={route as LatLngExpression[]}
            pathOptions={{ color: "#c9775d", weight: 5, opacity: 0.9 }}
          />
        )}
        <CircleMarker
          center={center}
          radius={9}
          pathOptions={{ color: "white", weight: 3, fillColor: "#668e59", fillOpacity: 1 }}
        />
      </MapContainer>
      <div className="map-caption">
        <i className={tracking ? "live-dot" : ""} />
        {tracking ? "LIVE GPS · THIS DEVICE" : "GPS ROUTE"}
      </div>
      <div className="map-compass" aria-hidden="true">
        N<br />↑
      </div>
    </div>
  );
}

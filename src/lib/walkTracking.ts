export type GpsPoint = { lat: number; lon: number; at: number };

export function distanceMeters(a: GpsPoint, b: GpsPoint): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const dlat = radians(b.lat - a.lat);
  const dlon = radians(b.lon - a.lon);
  const latA = radians(a.lat);
  const latB = radians(b.lat);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Returns a plausible walking segment length, or null for poor, stale, or noisy fixes. */
export function acceptedWalkingSegment(
  previous: GpsPoint,
  current: GpsPoint,
  accuracyMeters: number,
): number | null {
  const elapsed = (current.at - previous.at) / 1000;
  if (accuracyMeters > 65 || elapsed <= 0) return null;
  const meters = distanceMeters(previous, current);
  const noiseFloor = Math.max(3, Math.min(8, accuracyMeters * 0.12));
  return meters > noiseFloor && meters < Math.max(90, elapsed * 6) ? meters : null;
}

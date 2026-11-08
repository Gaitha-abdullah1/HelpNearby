import boundary from "./data/muscatGovernorate.json";

const pointInRing = (longitude, latitude, ring) => {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLng, currentLat] = ring[index];
    const [previousLng, previousLat] = ring[previous];
    const crosses = (currentLat > latitude) !== (previousLat > latitude);
    if (!crosses) continue;

    const edgeLng =
      ((previousLng - currentLng) * (latitude - currentLat)) / (previousLat - currentLat) +
      currentLng;
    if (longitude < edgeLng) inside = !inside;
  }

  return inside;
};

export const MUSCAT_POLYGONS = boundary.polygons;
export const MUSCAT_VIEW_BOUNDS = boundary.bounds;

const MUSCAT_WILAYATS = [
  { key: "muscat", latitude: 23.614, longitude: 58.593 },
  { key: "muttrah", latitude: 23.617, longitude: 58.566 },
  { key: "bawshar", latitude: 23.556, longitude: 58.399 },
  { key: "seeb", latitude: 23.67, longitude: 58.189 },
  { key: "amarat", latitude: 23.508, longitude: 58.489 },
  { key: "qurayyat", latitude: 23.256, longitude: 58.917 },
];

export const nearestWilayat = (latitude, longitude) => {
  let best = MUSCAT_WILAYATS[0];
  let bestDistance = Infinity;

  MUSCAT_WILAYATS.forEach((wilayat) => {
    const latitudeGap = latitude - wilayat.latitude;
    const longitudeGap = longitude - wilayat.longitude;
    const distance = latitudeGap * latitudeGap + longitudeGap * longitudeGap;
    if (distance < bestDistance) {
      best = wilayat;
      bestDistance = distance;
    }
  });

  return best.key;
};

export const isInsideMuscat = (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  return MUSCAT_POLYGONS.some(
    (polygon) =>
      pointInRing(longitude, latitude, polygon.outer) &&
      (polygon.holes || []).every((hole) => !pointInRing(longitude, latitude, hole)),
  );
};

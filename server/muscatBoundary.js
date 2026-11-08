import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const boundary = JSON.parse(
  readFileSync(path.join(directory, "data", "muscatGovernorate.json"), "utf8"),
);

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

export const MUSCAT_WILAYATS = ["muscat", "muttrah", "bawshar", "seeb", "amarat", "qurayyat"];

export const isInsideMuscat = (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  return boundary.polygons.some(
    (polygon) =>
      pointInRing(longitude, latitude, polygon.outer) &&
      (polygon.holes || []).every((hole) => !pointInRing(longitude, latitude, hole)),
  );
};

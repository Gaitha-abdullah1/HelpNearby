const reasonError = (reason) => Object.assign(new Error(reason), { reason });

const readAttempt = (options) =>
  new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve({ point: null, reason: "unavailable" });
          return;
        }
        resolve({ point: { latitude, longitude }, reason: null });
      },
      (error) => {
        const reason =
          error?.code === 1 ? "denied" : error?.code === 3 ? "timeout" : "unavailable";
        resolve({ point: null, reason });
      },
      options,
    );
  });

export const readCurrentCoordinates = async () => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw reasonError("unsupported");
  }

  const network = await readAttempt({
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 0,
  });
  if (network.reason === "denied") throw reasonError("denied");
  if (network.point) return network.point;

  const precise = await readAttempt({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  });
  if (precise.point) return precise.point;
  throw reasonError(
    precise.reason === "denied" ? "denied" : network.reason || precise.reason || "unavailable",
  );
};

const GUIDE_STORAGE_KEY = "helpnearby-guide";

export const GUIDE_STEPS = ["welcome", "request", "location", "tracking", "feedback"];

const readMap = (storage) => {
  try {
    const parsed = JSON.parse(storage.getItem(GUIDE_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

export const isGuideDismissed = (storage, userId) => {
  if (!storage || !userId) return false;
  return readMap(storage)[String(userId)] === "dismissed";
};

export const dismissGuide = (storage, userId) => {
  if (!storage || !userId) return;
  const map = readMap(storage);
  map[String(userId)] = "dismissed";
  storage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(map));
};

const isUserDashboardPath = (pathname) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  return path === "/user" || path === "/user/profile";
};

export const shouldAutoOpenGuide = ({ userId, role, pathname, dismissed }) =>
  Boolean(userId) && role === "user" && isUserDashboardPath(pathname) && dismissed !== true;

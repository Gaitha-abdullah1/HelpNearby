import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import axios from "axios";
import { FaCompress, FaExpand, FaMinus, FaPlus } from "react-icons/fa";
import {
  isInsideMuscat,
  MUSCAT_POLYGONS,
  MUSCAT_VIEW_BOUNDS,
  nearestWilayat,
} from "../muscatBoundary";

const API_URL = "http://localhost:5000/api";

const TILE_SIZE = 256;
const MIN_ZOOM = 9;
const MAX_ZOOM = 18;

const MUSCAT_CENTER = {
  latitude: (MUSCAT_VIEW_BOUNDS.minLat + MUSCAT_VIEW_BOUNDS.maxLat) / 2,
  longitude: (MUSCAT_VIEW_BOUNDS.minLng + MUSCAT_VIEW_BOUNDS.maxLng) / 2,
};

const lngToWorldX = (longitude) => (longitude + 180) / 360;

const latToWorldY = (latitude) => {
  const radians = (latitude * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
  );
};

const worldYToLat = (worldY) => {
  const angle = Math.PI - 2 * Math.PI * worldY;
  return (180 / Math.PI) * Math.atan(Math.sinh(angle));
};

const fitZoom = (width, height, bounds, maxZoom) => {
  const xSpan = Math.max(
    lngToWorldX(bounds.maxLng) - lngToWorldX(bounds.minLng),
    0.000001,
  );
  const ySpan = Math.max(
    latToWorldY(bounds.minLat) - latToWorldY(bounds.maxLat),
    0.000001,
  );
  const padding = 0.9;
  const zoomX = Math.log2((Math.max(width, 1) * padding) / (xSpan * TILE_SIZE));
  const zoomY = Math.log2((Math.max(height, 1) * padding) / (ySpan * TILE_SIZE));
  return Math.min(maxZoom, Math.max(1, Math.min(zoomX, zoomY)));
};

const POLYGON_BOUNDS = MUSCAT_POLYGONS.map((polygon) => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  polygon.outer.forEach(([longitude, latitude]) => {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
  });
  return { minLat, maxLat, minLng, maxLng };
});

const boundsOverlap = (bounds, view) =>
  bounds.maxLat >= view.south &&
  bounds.minLat <= view.north &&
  bounds.maxLng >= view.west &&
  bounds.minLng <= view.east;

const clipPolygonToRect = (points, rect) => {
  const clipEdge = (input, inside, intersect) => {
    if (!input.length) return [];
    const output = [];
    let previous = input[input.length - 1];
    input.forEach((current) => {
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside) {
        if (!previousInside) output.push(intersect(previous, current));
        output.push(current);
      } else if (previousInside) {
        output.push(intersect(previous, current));
      }
      previous = current;
    });
    return output;
  };
  const crossX = (edgeX) => (start, end) => {
    const delta = end.x - start.x;
    const ratio = delta === 0 ? 0 : (edgeX - start.x) / delta;
    return { x: edgeX, y: start.y + (end.y - start.y) * ratio };
  };
  const crossY = (edgeY) => (start, end) => {
    const delta = end.y - start.y;
    const ratio = delta === 0 ? 0 : (edgeY - start.y) / delta;
    return { x: start.x + (end.x - start.x) * ratio, y: edgeY };
  };
  return [
    [(point) => point.x >= rect.minX, crossX(rect.minX)],
    [(point) => point.x <= rect.maxX, crossX(rect.maxX)],
    [(point) => point.y >= rect.minY, crossY(rect.minY)],
    [(point) => point.y <= rect.maxY, crossY(rect.maxY)],
  ].reduce((current, [inside, intersect]) => clipEdge(current, inside, intersect), points);
};

const clipSegmentToRect = (start, end, rect) => {
  let enter = 0;
  let leave = 1;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const edges = [
    [-deltaX, start.x - rect.minX],
    [deltaX, rect.maxX - start.x],
    [-deltaY, start.y - rect.minY],
    [deltaY, rect.maxY - start.y],
  ];
  for (let index = 0; index < edges.length; index += 1) {
    const [direction, distance] = edges[index];
    if (Math.abs(direction) < 1e-9) {
      if (distance < 0) return null;
    } else {
      const ratio = distance / direction;
      if (direction < 0) {
        if (ratio > leave) return null;
        if (ratio > enter) enter = ratio;
      } else if (ratio < enter) {
        return null;
      } else if (ratio < leave) {
        leave = ratio;
      }
    }
  }
  return [
    { x: start.x + enter * deltaX, y: start.y + enter * deltaY },
    { x: start.x + leave * deltaX, y: start.y + leave * deltaY },
  ];
};

const formatSvgPoint = (point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;

const visiblePolylinePath = (points, rect) => {
  let path = "";
  let previous = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const visible = clipSegmentToRect(points[index], points[index + 1], rect);
    if (!visible) {
      previous = null;
      continue;
    }
    const [start, end] = visible;
    const continues = previous && Math.hypot(start.x - previous.x, start.y - previous.y) <= 0.6;
    path += continues
      ? `L${formatSvgPoint(end)}`
      : `M${formatSvgPoint(start)}L${formatSvgPoint(end)}`;
    previous = end;
  }
  return path;
};

const paddedBounds = (points) => {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latPad = Math.max((maxLat - minLat) * 0.45, 0.008);
  const lngPad = Math.max((maxLng - minLng) * 0.45, 0.008);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
};

const MuscatMap = ({
  latitude,
  longitude,
  onSelect,
  onOutside,
  readOnly = false,
  markerKind = "request",
  tracking = false,
  liveVolunteer = null,
  routePoints = null,
  showStraightLine = false,
  routeStale = false,
  children = null,
}) => {
  const { t } = useTranslation();
  const user = useSelector((state) => state.auth.user);
  const routeClipId = useId().replace(/:/g, "");
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 640, height: 372 });
  const [volunteers, setVolunteers] = useState([]);
  const [activeMarker, setActiveMarker] = useState("");
  const [following, setFollowing] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [displayPoint, setDisplayPoint] = useState(null);
  const [frozenView, setFrozenView] = useState(null);
  const [userZoom, setUserZoom] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [tileAlert, setTileAlert] = useState(false);
  const tileStateRef = useRef(new Map());
  const tileKeysRef = useRef([]);
  const displayRef = useRef(null);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const viewRef = useRef(null);
  const zoomAtRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const observeMap = useCallback((node) => {
    containerRef.current = node;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 2 || rect.height < 2) return;
      const width = rect.width;
      const height = rect.height;
      setSize((current) => (
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height }
      ));
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  useEffect(() => {
    if (tracking || !user?.id) return undefined;
    let active = true;

    axios
      .get(`${API_URL}/volunteers/locations`, { params: { userId: user.id } })
      .then((response) => {
        if (!active) return;
        const markers = Array.isArray(response.data?.volunteers) ? response.data.volunteers : [];
        setVolunteers(
          markers.filter(
            (volunteer) =>
              volunteer?.id &&
              typeof volunteer.latitude === "number" &&
              typeof volunteer.longitude === "number" &&
              isInsideMuscat(volunteer.latitude, volunteer.longitude) &&
              !(markerKind === "volunteer" && volunteer.id === user.id),
          ),
        );
      })
      .catch(() => {
        if (active) setVolunteers([]);
      });

    return () => {
      active = false;
    };
  }, [markerKind, tracking, user?.id]);

  useEffect(() => {
    if (tracking) return undefined;
    const frame = requestAnimationFrame(() => {
      setFollowing(true);
      setPan({ x: 0, y: 0 });
      setFrozenView(null);
      setUserZoom(null);
      setExpanded(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [tracking]);

  const requestPoint =
    typeof latitude === "number" && typeof longitude === "number"
      ? { latitude, longitude }
      : null;
  const targetLatitude =
    tracking && Number.isFinite(liveVolunteer?.latitude) ? liveVolunteer.latitude : null;
  const targetLongitude =
    tracking && Number.isFinite(liveVolunteer?.longitude) ? liveVolunteer.longitude : null;

  useEffect(() => {
    if (targetLatitude === null || targetLongitude === null) {
      displayRef.current = null;
      const frame = requestAnimationFrame(() => setDisplayPoint(null));
      return () => cancelAnimationFrame(frame);
    }

    const target = { latitude: targetLatitude, longitude: targetLongitude };
    const from = displayRef.current;
    if (
      !from ||
      (from.latitude === target.latitude && from.longitude === target.longitude)
    ) {
      displayRef.current = target;
      const frame = requestAnimationFrame(() => setDisplayPoint(target));
      return () => cancelAnimationFrame(frame);
    }

    const started = performance.now();
    let frame = 0;
    const step = (now) => {
      const progress = Math.min(1, (now - started) / 800);
      const eased = 1 - (1 - progress) ** 3;
      const next = {
        latitude: from.latitude + (target.latitude - from.latitude) * eased,
        longitude: from.longitude + (target.longitude - from.longitude) * eased,
      };
      displayRef.current = next;
      setDisplayPoint(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targetLatitude, targetLongitude]);

  const livePoint = displayPoint;
  const focusPoints = [requestPoint, livePoint].filter(Boolean);
  const focusBounds = focusPoints.length === 2 ? paddedBounds(focusPoints) : MUSCAT_VIEW_BOUNDS;
  const idealZoom = fitZoom(
    size.width,
    size.height,
    focusBounds,
    focusPoints.length === 2 ? 16 : 14,
  );
  const activeZoom = tracking && userZoom != null
    ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, userZoom))
    : idealZoom;
  const tileZoom = Math.min(19, Math.max(0, Math.floor(activeZoom)));
  const tileDisplaySize = TILE_SIZE * 2 ** (activeZoom - tileZoom);
  const scale = 2 ** activeZoom;
  const centerLatitude = focusPoints.length === 2
    ? (focusBounds.minLat + focusBounds.maxLat) / 2
    : MUSCAT_CENTER.latitude;
  const centerLongitude = focusPoints.length === 2
    ? (focusBounds.minLng + focusBounds.maxLng) / 2
    : MUSCAT_CENTER.longitude;
  const centerX = lngToWorldX(centerLongitude) * scale * TILE_SIZE;
  const centerY = latToWorldY(centerLatitude) * scale * TILE_SIZE;
  const baseLeft = centerX - size.width / 2;
  const baseTop = centerY - size.height / 2;
  const rendered = tracking && !following && frozenView
    ? {
        left: frozenView.left - pan.x,
        top: frozenView.top - pan.y,
        scale: frozenView.scale,
        tileZoom: frozenView.tileZoom,
        tileDisplaySize: frozenView.tileDisplaySize,
      }
    : {
        left: baseLeft,
        top: baseTop,
        scale,
        tileZoom,
        tileDisplaySize,
      };
  const { left, top } = rendered;
  const renderScale = rendered.scale;
  const renderTileZoom = rendered.tileZoom;
  const renderTileSize = rendered.tileDisplaySize;
  const startX = Math.floor(left / renderTileSize);
  const startY = Math.floor(top / renderTileSize);
  const endX = Math.floor((left + size.width) / renderTileSize);
  const endY = Math.floor((top + size.height) / renderTileSize);
  const tiles = [];
  const syncTileAlert = () => {
    const current = new Set(tileKeysRef.current);
    const states = tileStateRef.current;
    for (const key of states.keys()) {
      if (!current.has(key)) states.delete(key);
    }
    let failed = 0;
    let loaded = 0;
    current.forEach((key) => {
      const status = states.get(key);
      if (status === "error") failed += 1;
      else if (status === "ok") loaded += 1;
    });
    const total = current.size;
    const pending = total - failed - loaded;
    const allFailed = total > 0 && pending === 0 && loaded === 0 && failed === total;
    const mostlyFailed = loaded === 0 && failed >= 2 && failed * 2 >= total;
    const unavailable = allFailed || mostlyFailed;
    setTileAlert((currentAlert) => (currentAlert === unavailable ? currentAlert : unavailable));
  };
  const recordTile = (key, ok) => {
    tileStateRef.current.set(key, ok ? "ok" : "error");
    syncTileAlert();
  };

  for (let tileX = startX; tileX <= endX; tileX += 1) {
    for (let tileY = startY; tileY <= endY; tileY += 1) {
      const maxTile = 2 ** renderTileZoom;
      if (tileX < 0 || tileY < 0 || tileX >= maxTile || tileY >= maxTile) continue;
      tiles.push({
        key: `${renderTileZoom}-${tileX}-${tileY}`,
        left: tileX * renderTileSize - left,
        top: tileY * renderTileSize - top,
        size: renderTileSize,
        url: user?.id
          ? `${API_URL}/map-tiles/${renderTileZoom}/${tileX}/${tileY}?userId=${encodeURIComponent(user.id)}`
          : `https://tile.openstreetmap.org/${renderTileZoom}/${tileX}/${tileY}.png`,
      });
    }
  }

  const tileKeyList = tiles.map((tile) => tile.key).join("\n");
  tileKeysRef.current = tiles.map((tile) => tile.key);
  useEffect(() => {
    syncTileAlert();
  }, [tileKeyList]);

  const project = (pointLatitude, pointLongitude) => ({
    left: lngToWorldX(pointLongitude) * renderScale * TILE_SIZE - left,
    top: latToWorldY(pointLatitude) * renderScale * TILE_SIZE - top,
  });

  const marker = requestPoint ? project(requestPoint.latitude, requestPoint.longitude) : null;
  const liveMarker = livePoint ? project(livePoint.latitude, livePoint.longitude) : null;
  const roadPoints = tracking && Array.isArray(routePoints)
    ? routePoints.filter((point) => (
      Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude)
    ))
    : [];
  const roadScreenPoints = roadPoints.map((point) => {
    const projected = project(point.latitude, point.longitude);
    return { x: projected.left, y: projected.top };
  });
  const drawStraightLine = roadScreenPoints.length < 2 && showStraightLine && marker && liveMarker;

  const worldSpan = renderScale * TILE_SIZE;
  const viewNorth = worldYToLat(top / worldSpan);
  const viewSouth = worldYToLat((top + size.height) / worldSpan);
  const viewWest = (left / worldSpan) * 360 - 180;
  const viewEast = ((left + size.width) / worldSpan) * 360 - 180;
  const latitudeMargin = Math.max(Math.abs(viewNorth - viewSouth) * 0.2, 0.002);
  const longitudeMargin = Math.max(Math.abs(viewEast - viewWest) * 0.2, 0.002);
  const visibleBounds = {
    north: Math.max(viewNorth, viewSouth) + latitudeMargin,
    south: Math.min(viewNorth, viewSouth) - latitudeMargin,
    west: Math.min(viewWest, viewEast) - longitudeMargin,
    east: Math.max(viewWest, viewEast) + longitudeMargin,
  };
  const clipRect = {
    minX: -8,
    minY: -8,
    maxX: size.width + 8,
    maxY: size.height + 8,
  };
  const formatMaskPoint = (point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  let outsideHoles = "";
  let boundaryPath = "";
  MUSCAT_POLYGONS.forEach((polygon, index) => {
    if (!boundsOverlap(POLYGON_BOUNDS[index], visibleBounds)) return;
    const projected = polygon.outer.map(([pointLongitude, pointLatitude]) => (
      project(pointLatitude, pointLongitude)
    ));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    projected.forEach((point) => {
      minX = Math.min(minX, point.left);
      maxX = Math.max(maxX, point.left);
      minY = Math.min(minY, point.top);
      maxY = Math.max(maxY, point.top);
    });
    const screenPoints = projected.map((point) => ({ x: point.left, y: point.top }));
    const insideView = minX >= clipRect.minX && maxX <= clipRect.maxX
      && minY >= clipRect.minY && maxY <= clipRect.maxY;
    if (insideView) {
      const ring = screenPoints.map(formatMaskPoint).join("L");
      outsideHoles += `M${ring}Z`;
      boundaryPath += `M${ring}Z`;
      return;
    }
    const clipped = clipPolygonToRect(screenPoints, clipRect);
    if (clipped.length >= 3) {
      outsideHoles += `M${clipped.map(formatMaskPoint).join("L")}Z`;
    }
    for (let pointIndex = 0; pointIndex < screenPoints.length; pointIndex += 1) {
      const start = screenPoints[pointIndex];
      const end = screenPoints[(pointIndex + 1) % screenPoints.length];
      if (start.x === end.x && start.y === end.y) continue;
      const visible = clipSegmentToRect(start, end, clipRect);
      if (!visible) continue;
      boundaryPath += `M${formatMaskPoint(visible[0])}L${formatMaskPoint(visible[1])}`;
    }
  });
  const outsidePath = `M0 0H${size.width}V${size.height}H0Z${outsideHoles}`;
  const roadPath = roadScreenPoints.length >= 2
    ? visiblePolylinePath(roadScreenPoints, clipRect)
    : "";
  const straightPath = drawStraightLine
    ? visiblePolylinePath([
      { x: marker.left, y: marker.top },
      { x: liveMarker.left, y: liveMarker.top },
    ], clipRect)
    : "";

  const pointFromEvent = (event) => {
    const rect = containerRef.current.getBoundingClientRect();
    const pixelX = event.clientX - rect.left;
    const pixelY = event.clientY - rect.top;
    const worldX = (left + pixelX) / (renderScale * TILE_SIZE);
    const worldY = (top + pixelY) / (renderScale * TILE_SIZE);
    return {
      longitude: worldX * 360 - 180,
      latitude: worldYToLat(worldY),
    };
  };

  const rejectOutside = (event) => {
    event.stopPropagation();
    if (readOnly) return;
    onOutside?.();
  };

  const handleClick = (event) => {
    if (readOnly) return;

    const point = pointFromEvent(event);
    if (!isInsideMuscat(point.latitude, point.longitude)) {
      onOutside?.();
      return;
    }

    setActiveMarker("");
    onSelect?.({
      latitude: Number(point.latitude.toFixed(6)),
      longitude: Number(point.longitude.toFixed(6)),
      wilayat: nearestWilayat(point.latitude, point.longitude),
    });
  };

  const showMarker = (event, markerId) => {
    event.stopPropagation();
    setActiveMarker(markerId);
  };

  const freezeView = () => {
    setFrozenView((current) => current || ({
      left: baseLeft,
      top: baseTop,
      scale,
      tileZoom,
      tileDisplaySize,
    }));
  };

  const zoomAt = (clientX, clientY, nextZoom) => {
    const view = viewRef.current;
    const element = containerRef.current;
    if (!view || !element) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const rect = element.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const ratio = 2 ** (clamped - Math.log2(view.scale));
    const nextLeft = (view.left + px) * ratio - px;
    const nextTop = (view.top + py) * ratio - py;
    if (!view.following) {
      const nextTileZoom = Math.min(19, Math.max(0, Math.floor(clamped)));
      setFrozenView({
        left: nextLeft,
        top: nextTop,
        scale: 2 ** clamped,
        tileZoom: nextTileZoom,
        tileDisplaySize: TILE_SIZE * 2 ** (clamped - nextTileZoom),
      });
      setPan({ x: 0, y: 0 });
    }
    setUserZoom(clamped);
    viewRef.current = {
      left: view.following ? view.left : nextLeft,
      top: view.following ? view.top : nextTop,
      scale: 2 ** clamped,
      following: view.following,
    };
  };

  const zoomBy = (direction) => {
    const view = viewRef.current;
    const element = containerRef.current;
    if (!view || !element) return;
    const rect = element.getBoundingClientRect();
    zoomAt(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      Math.log2(view.scale) + direction,
    );
  };

  const currentZoom = Math.log2(renderScale);

  const startPan = (event) => {
    if (!tracking || event.button !== 0) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.max(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), 1),
        zoom: Math.log2(viewRef.current?.scale || renderScale),
      };
      dragRef.current = null;
      setPanning(false);
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const points = [...pointersRef.current.values()];
      const distance = Math.max(Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), 1);
      const nextZoom = pinchRef.current.zoom + Math.log2(distance / pinchRef.current.distance);
      zoomAt((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2, nextZoom);
      pinchRef.current = { distance, zoom: nextZoom };
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      freezeView();
      setFollowing(false);
      setPanning(true);
      if (viewRef.current) {
        viewRef.current = { ...viewRef.current, following: false };
      }
    }
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  };

  const endPan = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resumeFollow = () => {
    setFrozenView(null);
    setPan({ x: 0, y: 0 });
    setFollowing(true);
  };

  const openExpanded = () => {
    if (following) setUserZoom(null);
    setExpanded(true);
  };

  useEffect(() => {
    viewRef.current = {
      left,
      top,
      scale: renderScale,
      following,
    };
    zoomAtRef.current = zoomAt;
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!tracking || !element) return undefined;
    const onWheel = (event) => {
      const view = viewRef.current;
      if (!view) return;
      event.preventDefault();
      const step = Math.max(-0.75, Math.min(0.75, -event.deltaY / 240));
      if (Math.abs(step) < 0.01) return;
      zoomAtRef.current?.(
        event.clientX,
        event.clientY,
        Math.log2(view.scale) + step,
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [expanded, tracking]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
    };
    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  const block = (
    <div className={`muscat-map-block${expanded ? " is-expanded" : ""}`}>
      <div className="muscat-map-frame">
      <div
        ref={observeMap}
        className={`muscat-map${readOnly ? " is-readonly" : ""}${tracking ? " is-tracking" : ""}${panning ? " is-panning" : ""}`}
        onClick={handleClick}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        role="application"
        aria-label={t("helpRequests.mapLabel")}
      >
        {tiles.map((tile) => (
          <img
            key={tile.key}
            className="muscat-map-tile"
            src={tile.url}
            alt=""
            draggable="false"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => recordTile(tile.key, true)}
            onError={() => recordTile(tile.key, false)}
            style={{
              left: tile.left,
              top: tile.top,
              width: tile.size + 1,
              height: tile.size + 1,
            }}
          />
        ))}
        <svg
          className="muscat-map-mask"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={routeClipId}>
              <rect width={size.width} height={size.height} />
            </clipPath>
          </defs>
          <path
            className="muscat-map-outside"
            fillRule="evenodd"
            d={outsidePath}
            onClick={rejectOutside}
          />
          <path className="muscat-map-boundary" d={boundaryPath} />
          {(roadPath || straightPath) && (
            <g clipPath={`url(#${routeClipId})`}>
              {roadPath && (
                <>
                  <path
                    className={`muscat-map-route-casing${routeStale ? " is-stale" : ""}`}
                    d={roadPath}
                  />
                  <path
                    className={`muscat-map-route${routeStale ? " is-stale" : ""}`}
                    d={roadPath}
                  />
                </>
              )}
              {straightPath && (
                <path className="muscat-map-live-line is-straight" d={straightPath} />
              )}
            </g>
          )}
        </svg>
        {!tracking && volunteers.map((volunteer) => {
          const point = project(volunteer.latitude, volunteer.longitude);
          return (
            <button
              key={volunteer.id}
              type="button"
              className={`muscat-map-marker is-volunteer${activeMarker === volunteer.id ? " is-active" : ""}`}
              style={{ left: point.left, top: point.top }}
              aria-label={t("map.volunteer")}
              aria-pressed={activeMarker === volunteer.id}
              onClick={(event) => showMarker(event, volunteer.id)}
            />
          );
        })}
        {marker && (
          <button
            type="button"
            className={`muscat-map-marker${markerKind === "volunteer" ? " is-volunteer" : " is-request"}${activeMarker === "primary" ? " is-active" : ""}`}
            style={{ left: marker.left, top: marker.top }}
            aria-label={t(markerKind === "volunteer" ? "map.yourLocation" : "map.request")}
            aria-pressed={activeMarker === "primary"}
            onClick={(event) => showMarker(event, "primary")}
          />
        )}
        {liveMarker && (
          <button
            type="button"
            className={`muscat-map-marker is-volunteer is-live${activeMarker === "live" ? " is-active" : ""}`}
            style={{ left: liveMarker.left, top: liveMarker.top }}
            aria-label={t("map.liveVolunteer")}
            aria-pressed={activeMarker === "live"}
            onClick={(event) => showMarker(event, "live")}
          />
        )}
      </div>
      {tracking && (
        <div className="muscat-map-controls">
          <button
            type="button"
            className="muscat-map-control"
            aria-pressed={expanded}
            aria-label={t(expanded ? "map.exitExpanded" : "map.expand")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (expanded) setExpanded(false);
              else openExpanded();
            }}
          >
            {expanded ? <FaCompress /> : <FaExpand />}
          </button>
          <button
            type="button"
            className="muscat-map-control"
            aria-label={t("map.zoomIn")}
            disabled={currentZoom >= MAX_ZOOM - 0.01}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(1);
            }}
          >
            <FaPlus />
          </button>
          <button
            type="button"
            className="muscat-map-control"
            aria-label={t("map.zoomOut")}
            disabled={currentZoom <= MIN_ZOOM + 0.01}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(-1);
            }}
          >
            <FaMinus />
          </button>
        </div>
      )}
      </div>
      {activeMarker && (
        <p className="help-request-note muscat-map-marker-label" role="status">
          {activeMarker === "primary"
            ? t(markerKind === "volunteer" ? "map.yourLocation" : "map.request")
            : activeMarker === "live"
              ? t("map.liveVolunteer")
              : t("map.volunteer")}
        </p>
      )}
      {tileAlert && (
        <p className="help-request-note" role="alert">
          {t("map.tilesUnavailable")}
        </p>
      )}
      <p className="muscat-map-attribution">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          {t("helpRequests.mapAttribution")}
        </a>
      </p>
      {tracking && !following && (
        <div className="muscat-map-toolbar">
          <button type="button" className="muscat-map-follow" onClick={resumeFollow}>
            {t("map.resumeFollow")}
          </button>
        </div>
      )}
      {drawStraightLine && (
        <p className="help-request-note muscat-map-live-note">{t("map.straightLine")}</p>
      )}
      {children}
    </div>
  );

  return expanded ? createPortal(block, document.body) : block;
};

export default MuscatMap;

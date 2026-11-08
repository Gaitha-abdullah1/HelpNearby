import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { FaCheck, FaEye, FaSearch, FaTimes } from "react-icons/fa";

import ActivityFeed from "./ActivityFeed";
import BackButton from "./BackButton";
import DashboardLayout from "./DashboardLayout";
import StatusChart from "./StatusChart";
import Pagination from "./Pagination";
import { usePagination } from "./usePagination";
import MuscatMap from "./MuscatMap";
import RequestTimeline from "./RequestTimeline";
import { readCurrentCoordinates } from "../deviceLocation";
import { localizedRequestService } from "../bilingualText";
import { isInsideMuscat } from "../muscatBoundary";
import {
  expireVolunteerHelpRequestFetch,
  fetchVolunteerHelpRequests,
  resetVolunteerHelpRequests,
  updateHelpRequestStatus,
  selectVolunteerDistanceAvailable,
  selectVolunteerHelpRequestOwnerId,
  selectVolunteerHelpRequestStatus,
  selectVolunteerHelpRequests,
} from "../features/helpRequestsSlice";

const toastOptions = { duration: 3000 };
const API_URL = "http://localhost:5000/api";
const POLL_INTERVAL = 12000;
const SUPPORTED_SECTIONS = ["home", "requests", "location", "activity"];

const comparePendingByDistance = (first, second) => {
  const firstDistance =
    typeof first.distanceKm === "number" ? first.distanceKm : Number.POSITIVE_INFINITY;
  const secondDistance =
    typeof second.distanceKm === "number" ? second.distanceKm : Number.POSITIVE_INFINITY;
  if (firstDistance !== secondDistance) return firstDistance - secondDistance;
  return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
};

const ActionButton = ({ label, className, disabled, onClick, children }) => (
  <button
    type="button"
    className={`admin-icon-button ${className}`}
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);

const VolunteerDashboard = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const requests = useSelector(selectVolunteerHelpRequests);
  const requestsStatus = useSelector(selectVolunteerHelpRequestStatus);
  const requestsOwnerId = useSelector(selectVolunteerHelpRequestOwnerId);
  const distanceAvailable = useSelector(selectVolunteerDistanceAvailable);
  useLayoutEffect(() => {
    dispatch(resetVolunteerHelpRequests(user?.id || ""));
  }, [dispatch, user?.id]);
  const section = new URLSearchParams(location.search).get("section") || "home";
  const requestedFilter = new URLSearchParams(location.search).get("filter");
  const requestFilter =
    requestedFilter === "available" || requestedFilter === "assigned" ? requestedFilter : "all";
  const [requestQuery, setRequestQuery] = useState("");
  const [ratingStatus, setRatingStatus] = useState("loading");
  const [ratingOwnerId, setRatingOwnerId] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const signedInUserId = user?.id || "";
  const [dialogOwnerId, setDialogOwnerId] = useState(signedInUserId);
  if (signedInUserId !== dialogOwnerId) {
    setDialogOwnerId(signedInUserId);
    setSelectedRequest(null);
  }
  const [busyId, setBusyId] = useState(null);
  const [savedLocation, setSavedLocation] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("loading");
  const [locationSaving, setLocationSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [ratingSummary, setRatingSummary] = useState({
    averageRating: null,
    ratingCount: 0,
  });
  const requestsSeq = useRef(0);
  const ratingSeq = useRef(0);
  const locationSeq = useRef(0);
  const [locationRequestKey, setLocationRequestKey] = useState("");
  const nextLocationKey = section === "location" && user?.id ? user.id : "";
  if (nextLocationKey !== locationRequestKey) {
    setLocationRequestKey(nextLocationKey);
    if (nextLocationKey) {
      setLocationStatus("loading");
      setLocationError("");
    }
  }

  const showError = useCallback((errorCode) => {
    const code = errorCode || "SERVER_ERROR";
    const key = `helpRequests.errors.${code}`;
    toast.error(
      t(key) === key ? t("helpRequests.errors.SERVER_ERROR") : t(key),
      toastOptions,
    );
  }, [t, toastOptions]);

  useEffect(() => {
    if (SUPPORTED_SECTIONS.includes(section)) return undefined;
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
    return undefined;
  }, [location.pathname, navigate, section]);

  useEffect(() => {
    if (section !== "home" || !user?.id) return undefined;
    let active = true;

    const loadRating = (reportError) => {
      const requestId = ratingSeq.current + 1;
      ratingSeq.current = requestId;
      axios
        .get(`${API_URL}/feedback/summary`, { params: { userId: user.id } })
        .then((response) => {
          if (!active || ratingSeq.current !== requestId) return;
          setRatingSummary({
            averageRating: response.data?.averageRating ?? null,
            ratingCount: response.data?.ratingCount || 0,
          });
          setRatingOwnerId(user.id);
          setRatingStatus("success");
        })
        .catch((error) => {
          if (!active || ratingSeq.current !== requestId) return;
          setRatingStatus("error");
          if (reportError) showError(error.response?.data?.errorCode);
        });
    };

    loadRating(true);
    const timer = setInterval(() => loadRating(false), POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [section, showError, user?.id]);

  useEffect(() => {
    if ((section !== "home" && section !== "requests") || !user?.id) return undefined;
    let active = true;

    const load = (reportError) => {
      const requestId = requestsSeq.current + 1;
      requestsSeq.current = requestId;
      dispatch(fetchVolunteerHelpRequests({ userId: user.id, requestId })).then((result) => {
        if (!active || requestsSeq.current !== requestId) return;
        if (fetchVolunteerHelpRequests.fulfilled.match(result)) {
          const rows = result.payload?.requests || [];
          setSelectedRequest((current) => {
            if (!current) return current;
            const fresh = rows.find((request) => request.id === current.id);
            if (!fresh) return current.status === "pending" ? null : current;
            return fresh;
          });
          return;
        }
        if (reportError) showError(result.payload?.errorCode);
      });
    };

    load(true);
    const onRefresh = () => load(false);
    window.addEventListener("helpnearby-requests-refresh", onRefresh);
    const timer = setInterval(() => load(false), POLL_INTERVAL);

    return () => {
      active = false;
      window.removeEventListener("helpnearby-requests-refresh", onRefresh);
      dispatch(expireVolunteerHelpRequestFetch());
      clearInterval(timer);
    };
  }, [dispatch, section, showError, user?.id]);

  useEffect(() => {
    if (section !== "location" || !user?.id) return undefined;
    let active = true;
    const requestId = locationSeq.current + 1;
    locationSeq.current = requestId;

    axios
      .get(`${API_URL}/volunteer/location`, { params: { userId: user.id } })
      .then((response) => {
        if (!active || locationSeq.current !== requestId) return;
        const latitude = response.data?.latitude;
        const longitude = response.data?.longitude;
        const point =
          typeof latitude === "number" && typeof longitude === "number"
            ? { latitude, longitude }
            : null;
        setSavedLocation(point);
        setSelectedLocation(point);
        setLocationStatus("success");
      })
      .catch(() => {
        if (!active || locationSeq.current !== requestId) return;
        setSavedLocation(null);
        setSelectedLocation(null);
        setLocationStatus("error");
      });

    return () => {
      active = false;
    };
  }, [section, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    axios
      .get(`${API_URL}/volunteer/location`, { params: { userId: user.id } })
      .then((response) => {
        if (!active) return;
        const latitude = response.data?.latitude;
        const longitude = response.data?.longitude;
        if (typeof latitude !== "number" || typeof longitude !== "number") return;
        setSavedLocation({ latitude, longitude });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  const saveLocation = async () => {
    if (!user?.id || !selectedLocation) return;
    setLocationSaving(true);
    setLocationError("");
    try {
      const response = await axios.put(`${API_URL}/volunteer/location`, {
        userId: user.id,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      });
      const point = {
        latitude: response.data.latitude,
        longitude: response.data.longitude,
      };
      setSavedLocation(point);
      setSelectedLocation(point);
      toast.success(t("volunteerDashboard.location.saved"), toastOptions);
    } catch (error) {
      const code = error.response?.data?.errorCode;
      setLocationError(
        code === "INVALID_LOCATION"
          ? t("volunteerDashboard.location.outside")
          : t("volunteerDashboard.location.saveError"),
      );
    } finally {
      setLocationSaving(false);
    }
  };

  const requestCurrentLocation = async () => {
    setLocating(true);
    setLocationError("");
    try {
      const point = await readCurrentCoordinates();
      if (!isInsideMuscat(point.latitude, point.longitude)) {
        setLocationError(t("volunteerDashboard.location.outside"));
        return;
      }
      setSelectedLocation({
        latitude: point.latitude,
        longitude: point.longitude,
      });
    } catch (error) {
      const reason = error?.reason;
      const key =
        reason === "denied"
          ? "volunteerDashboard.location.denied"
          : reason === "timeout"
            ? "volunteerDashboard.location.timeout"
            : reason === "unsupported"
              ? "volunteerDashboard.location.unavailable"
              : "volunteerDashboard.location.failed";
      setLocationError(t(key));
    } finally {
      setLocating(false);
    }
  };

  const updateStatus = async (request, status) => {
    if (!user?.id) return;
    setBusyId(request.id);
    let updated = false;
    try {
      const result = await dispatch(updateHelpRequestStatus({
        id: request.id,
        userId: user.id,
        status,
      }));
      if (updateHelpRequestStatus.fulfilled.match(result)) {
        updated = true;
        const messageCode = result.payload?.messageCode;
        const successKey =
          messageCode === "OFFER_DECLINED"
            ? "helpRequests.success.OFFER_DECLINED"
            : status === "accepted"
              ? "helpRequests.success.REQUEST_ACCEPTED"
              : status === "in-progress"
                ? "helpRequests.success.REQUEST_STARTED"
                : status === "completed"
                  ? "helpRequests.success.REQUEST_COMPLETED"
                  : "helpRequests.success.REQUEST_REJECTED";
        toast.success(t(successKey), toastOptions);
        setSelectedRequest(null);
        window.dispatchEvent(new Event("helpnearby-notifications"));
        window.dispatchEvent(new Event("helpnearby-activity"));
        const requestId = requestsSeq.current + 1;
        requestsSeq.current = requestId;
        const refreshed = await dispatch(fetchVolunteerHelpRequests({
          userId: user.id,
          requestId,
        }));
        if (requestsSeq.current !== requestId) return;
        if (!fetchVolunteerHelpRequests.fulfilled.match(refreshed)) {
          showError(refreshed.payload?.errorCode);
        }
      } else {
        const code = result.payload?.errorCode;
        showError(code);
        if (code === "REQUEST_CANCELLED" || code === "INVALID_STATUS_TRANSITION") {
          const requestId = requestsSeq.current + 1;
          requestsSeq.current = requestId;
          const refreshed = await dispatch(fetchVolunteerHelpRequests({
            userId: user.id,
            requestId,
            preserveStatusOnError: !updated,
          }));
          if (requestsSeq.current !== requestId) return;
          if (!fetchVolunteerHelpRequests.fulfilled.match(refreshed)) return;
          const rows = refreshed.payload?.requests || [];
          setSelectedRequest((current) => {
            if (!current || current.id !== request.id) return current;
            return rows.find((row) => row.id === current.id) || null;
          });
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value) =>
    value ? new Date(value).toLocaleString(i18n.language) : "—";

  const formatDistance = (request) => {
    if (request.status !== "pending" || typeof request.distanceKm !== "number") return "—";
    return t("volunteerDashboard.distanceKm", {
      distance: request.distanceKm.toFixed(1),
    });
  };

  const requestsConfirmed = Boolean(user?.id) && requestsOwnerId === user.id;
  const ratingConfirmed = Boolean(user?.id) && ratingOwnerId === user.id;
  const visibleRequests = useMemo(
    () => (requestsConfirmed ? requests : []),
    [requestsConfirmed, requests],
  );
  const volunteerIsBusy = visibleRequests.some(
    (request) => request.status === "accepted" || request.status === "in-progress",
  );
  const tableRequests = useMemo(() => {
    const pending = visibleRequests
      .filter((request) => request.status === "pending")
      .sort(comparePendingByDistance);
    if (requestFilter === "available") return pending;
    if (requestFilter === "assigned") {
      return visibleRequests.filter(
        (request) => request.status === "accepted" || request.status === "in-progress",
      );
    }
    const rest = visibleRequests.filter((request) => request.status !== "pending");
    return [...pending, ...rest];
  }, [requestFilter, visibleRequests]);
  const wilayatLabel = (value) => {
    const wilayats = ["muscat", "muttrah", "bawshar", "seeb", "amarat", "qurayyat"];
    return wilayats.includes(value) ? t(`helpRequests.wilayats.${value}`) : "—";
  };
  const renderRequestActions = (request) => (
    <div className="admin-actions">
      <ActionButton
        label={t("helpRequests.view")}
        className="admin-icon-edit"
        onClick={() => setSelectedRequest(request)}
      >
        <FaEye />
      </ActionButton>
      {request.status === "pending" && (
        <>
          <ActionButton
            label={volunteerIsBusy ? t("helpRequests.volunteerBusy") : t("helpRequests.accept")}
            className="admin-icon-approve"
            disabled={busyId === request.id || volunteerIsBusy}
            onClick={() => updateStatus(request, "accepted")}
          >
            <FaCheck />
          </ActionButton>
          <ActionButton
            label={t("helpRequests.reject")}
            className="admin-icon-reject"
            disabled={busyId === request.id}
            onClick={() => updateStatus(request, "rejected")}
          >
            <FaTimes />
          </ActionButton>
        </>
      )}
      {request.status === "accepted" && (
        <Button
          type="button"
          className="dashboard-action-button dashboard-save-button"
          disabled={busyId === request.id}
          onClick={() => updateStatus(request, "in-progress")}
        >
          {t("helpRequests.startHelping")}
        </Button>
      )}
      {request.status === "in-progress" && (
        <Button
          type="button"
          className="dashboard-action-button dashboard-save-button"
          disabled={busyId === request.id}
          onClick={() => updateStatus(request, "completed")}
        >
          {t("helpRequests.markCompleted")}
        </Button>
      )}
    </div>
  );
  const requestCounts = useMemo(
    () => ({
      available: visibleRequests.filter((request) => request.status === "pending").length,
      accepted: visibleRequests.filter((request) => request.status === "accepted").length,
      inProgress: visibleRequests.filter((request) => request.status === "in-progress").length,
      completed: visibleRequests.filter((request) => request.status === "completed").length,
    }),
    [visibleRequests],
  );
  const requestStatusItems = useMemo(
    () => [
      ["available", requestCounts.available],
      ["accepted", requestCounts.accepted],
      ["inProgress", requestCounts.inProgress],
      ["completed", requestCounts.completed],
    ].map(([key, value]) => ({
      key,
      label: t(`volunteerDashboard.stats.${key}`),
      value,
    })),
    [requestCounts, t],
  );
  const newestFirst = (items) =>
    [...items].sort(
      (first, second) =>
        new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime(),
    );
  const availableRequests = newestFirst(
    visibleRequests.filter((request) => request.status === "pending"),
  ).slice(0, 3);
  const assignedRequests = newestFirst(
    visibleRequests.filter(
      (request) => request.status === "accepted" || request.status === "in-progress",
    ),
  ).slice(0, 3);
  const requestSearchActive = requestQuery.trim() !== "";
  const searchedRequests = useMemo(() => {
    const query = requestQuery.trim().toLowerCase();
    if (!query) return tableRequests;
    return tableRequests.filter((request) => [
      localizedRequestService(request, i18n.language),
      request.description,
      wilayatLabel(request.wilayat),
      t(`helpRequests.statuses.${request.status}`),
    ].join(" ").toLowerCase().includes(query));
  }, [i18n.language, requestQuery, t, tableRequests]);
  const requestPage = usePagination(
    searchedRequests,
    `${requestFilter}:${requestQuery.trim().toLowerCase()}`,
  );
  const greeting = user?.fullName
    ? t("volunteerDashboard.greeting", { name: user.fullName })
    : t("volunteerDashboard.greetingPlain");
  const placeLabel = (request) => {
    const wilayats = ["muscat", "muttrah", "bawshar", "seeb", "amarat", "qurayyat"];
    if (wilayats.includes(request?.wilayat)) return t(`helpRequests.wilayats.${request.wilayat}`);
    return request?.area || "—";
  };

  const openRequests = (filter = "all") => {
    const search = new URLSearchParams({ section: "requests" });
    if (filter === "available" || filter === "assigned" || filter === "all") {
      search.set("filter", filter);
    }
    navigate({ pathname: "/volunteer", search: search.toString() });
  };

  const openProfile = () => {
    navigate("/volunteer/profile");
  };
  const requestFailure = requestsStatus === "error";
  const showRequestData = requestsConfirmed;
  const ratingFailure = ratingStatus === "error";

  return (
    <DashboardLayout>
      <div className="admin-page">
        {!user?.id ? (
          <section className="user-home">
            <div className="user-home-panel">
              <p className="help-request-note">{t("volunteerDashboard.sessionRequired")}</p>
              <div className="user-home-actions">
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-password-open-button"
                  onClick={() => navigate("/login")}
                >
                  {t("login.button")}
                </Button>
              </div>
            </div>
          </section>
        ) : section === "home" && (
          <section className="user-home">
            <div className="user-home-welcome">
              <div>
                <h2>{greeting}</h2>
                <p className="dashboard-welcome">{t("volunteerDashboard.overview")}</p>
              </div>
              <Button
                type="button"
                className="dashboard-action-button dashboard-password-open-button"
                onClick={() => openRequests("available")}
              >
                {t("volunteerDashboard.browseRequests")}
              </Button>
            </div>

            {showRequestData && requestFailure && (
              <p className="help-request-note">{t("volunteerDashboard.loadError")}</p>
            )}

            {!showRequestData && requestFailure ? (
              <p className="help-request-note">{t("volunteerDashboard.loadError")}</p>
            ) : !showRequestData ? (
              <p className="help-request-note">{t("volunteerDashboard.loading")}</p>
            ) : (
              <div className="user-home-stats">
                {[
                  ["available", requestCounts.available],
                  ["accepted", requestCounts.accepted],
                  ["inProgress", requestCounts.inProgress],
                  ["completed", requestCounts.completed],
                ].map(([key, value]) => (
                  <article key={key} className="user-home-stat">
                    <strong>{value}</strong>
                    <span>{t(`volunteerDashboard.stats.${key}`)}</span>
                  </article>
                ))}
              </div>
            )}

            {showRequestData && (
              <StatusChart
                title={t("volunteerDashboard.chartTitle")}
                emptyLabel={t("volunteerDashboard.chartEmpty")}
                items={requestStatusItems}
              />
            )}

            <div className="user-home-panel">
              <h3>{t("volunteerDashboard.yourAverage")}</h3>
              {!ratingConfirmed && ratingFailure ? (
                <p className="help-request-note">{t("volunteerDashboard.ratingError")}</p>
              ) : !ratingConfirmed ? (
                <p className="help-request-note">{t("volunteerDashboard.loading")}</p>
              ) : (
                <div className="user-home-rating">
                  {ratingFailure && (
                    <p className="help-request-note">{t("volunteerDashboard.ratingError")}</p>
                  )}
                  <strong className={ratingSummary.ratingCount ? undefined : "is-empty"}>
                    {ratingSummary.ratingCount
                      ? Number(ratingSummary.averageRating).toFixed(1)
                      : t("feedback.noRatings")}
                  </strong>
                  <span>
                    {t("volunteerDashboard.ratingTotal")}: {ratingSummary.ratingCount}
                  </span>
                </div>
              )}
            </div>

            <div className="user-home-panel">
              <div className="user-home-panel-header">
                <h3>{t("volunteerDashboard.availableTitle")}</h3>
              </div>
              {!showRequestData ? (
                <p className="help-request-note">
                  {t(requestFailure ? "volunteerDashboard.loadError" : "volunteerDashboard.loading")}
                </p>
              ) : availableRequests.length === 0 ? (
                <div className="user-home-empty">
                  <p>{t("volunteerDashboard.availableEmpty")}</p>
                  <Button
                    type="button"
                    className="dashboard-action-button dashboard-password-open-button"
                    onClick={() => openRequests("available")}
                  >
                    {t("volunteerDashboard.browseRequests")}
                  </Button>
                </div>
              ) : (
                <ul className="user-home-recent">
                  {availableRequests.map((request) => (
                    <li key={request.id}>
                      <div>
                        <strong className="user-home-request-name">
                          {localizedRequestService(request, i18n.language) || "—"}
                        </strong>
                        <div className="user-home-request-date">
                          {placeLabel(request)}
                          {" · "}
                          {formatDate(request.createdAt)}
                        </div>
                      </div>
                      <span className="admin-status is-pending">
                        {t("volunteerDashboard.availableBadge")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="user-home-panel">
              <div className="user-home-panel-header">
                <h3>{t("volunteerDashboard.assignedTitle")}</h3>
                {showRequestData && assignedRequests.length > 0 && (
                  <button type="button" className="user-home-text-action" onClick={() => openRequests("all")}>
                    {t("volunteerDashboard.viewAll")}
                  </button>
                )}
              </div>
              {!showRequestData ? (
                <p className="help-request-note">
                  {t(requestFailure ? "volunteerDashboard.loadError" : "volunteerDashboard.loading")}
                </p>
              ) : assignedRequests.length === 0 ? (
                <p className="help-request-note">{t("volunteerDashboard.assignedEmpty")}</p>
              ) : (
                <ul className="user-home-recent">
                  {assignedRequests.map((request) => (
                    <li key={request.id}>
                      <div>
                        <strong className="user-home-request-name">
                          {localizedRequestService(request, i18n.language) || "—"}
                        </strong>
                        <div className="user-home-request-date">{formatDate(request.createdAt)}</div>
                      </div>
                      <span className={`admin-status is-${request.status}`}>
                        {t(`helpRequests.statuses.${request.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="user-home-panel">
              <h3>{t("volunteerDashboard.quickActions")}</h3>
              <div className="user-home-actions">
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-password-open-button"
                  onClick={() => openRequests("available")}
                >
                  {t("volunteerDashboard.browseRequests")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => openRequests("assigned")}
                >
                  {t("volunteerDashboard.viewAssigned")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={openProfile}
                >
                  {t("volunteerDashboard.myProfile")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {user?.id && section === "activity" && <ActivityFeed />}

        {user?.id && section === "location" && (
          <section className="user-home">
            <div className="user-home-panel">
              <p className="dashboard-welcome">{t("volunteerDashboard.location.intro")}</p>
              {locationStatus === "loading" && (
                <p className="help-request-note">{t("volunteerDashboard.location.loading")}</p>
              )}
              {locationStatus === "error" && (
                <p className="help-request-note">{t("volunteerDashboard.location.loadError")}</p>
              )}
              {locationStatus === "success" && (
                <>
                  {!savedLocation && (
                    <p className="help-request-note">{t("volunteerDashboard.location.empty")}</p>
                  )}
                  <MuscatMap
                    markerKind="volunteer"
                    latitude={selectedLocation?.latitude ?? null}
                    longitude={selectedLocation?.longitude ?? null}
                    onSelect={(point) => {
                      setLocationError("");
                      setSelectedLocation({
                        latitude: point.latitude,
                        longitude: point.longitude,
                      });
                    }}
                    onOutside={() => setLocationError(t("volunteerDashboard.location.outside"))}
                  />
                  <div className="help-request-actions">
                    <Button
                      type="button"
                      className="dashboard-action-button dashboard-neutral-button"
                      disabled={locating || locationSaving}
                      onClick={requestCurrentLocation}
                    >
                      {locating ? t("helpRequests.locating") : t("helpRequests.useCurrentLocation")}
                    </Button>
                    <Button
                      type="button"
                      className="dashboard-action-button dashboard-save-button"
                      disabled={!selectedLocation || locationSaving || locating}
                      onClick={saveLocation}
                    >
                      {locationSaving
                        ? t("volunteerDashboard.location.saving")
                        : t("volunteerDashboard.location.save")}
                    </Button>
                  </div>
                  {locationError && <div className="form-error">{locationError}</div>}
                  {savedLocation && (
                    <p className="help-request-note">
                      <strong>{t("volunteerDashboard.location.savedLabel")}:</strong>{" "}
                      {savedLocation.latitude.toFixed(6)}, {savedLocation.longitude.toFixed(6)}
                    </p>
                  )}
                  {selectedLocation && (
                    <p className="help-request-note">
                      <strong>{t("volunteerDashboard.location.selectedLabel")}:</strong>{" "}
                      {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {user?.id && section === "requests" && (
          <>
            {showRequestData && requestFailure && (
              <p className="help-request-note">{t("volunteerDashboard.loadError")}</p>
            )}
            <div className="admin-section-header">
              <h2>{t(`volunteerDashboard.requestFilters.${requestFilter}`)}</h2>
            </div>
            <div className="admin-request-toolbar">
              {showRequestData && visibleRequests.length > 0 && (
                <div className="admin-request-search">
                  <FaSearch aria-hidden="true" />
                  <Input
                    type="search"
                    className="form-control"
                    value={requestQuery}
                    placeholder={t("helpRequests.listSearch")}
                    aria-label={t("helpRequests.listSearch")}
                    onChange={(event) => setRequestQuery(event.target.value)}
                  />
                </div>
              )}
              <div className="admin-section-nav">
                {["available", "assigned", "all"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`admin-section-button${requestFilter === filter ? " is-active" : ""}`}
                    aria-pressed={requestFilter === filter}
                    onClick={() => openRequests(filter)}
                  >
                    {t(`volunteerDashboard.requestFilters.${filter}`)}
                  </button>
                ))}
              </div>
              {requestSearchActive && (
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => setRequestQuery("")}
                >
                  {t("helpRequests.clearFilters")}
                </Button>
              )}
            </div>
            {showRequestData && volunteerIsBusy && (
              <p className="help-request-note">{t("helpRequests.volunteerBusy")}</p>
            )}
            {showRequestData && distanceAvailable === false && requestFilter !== "assigned" && (
              <p className="help-request-note" role="status">
                {t("volunteerDashboard.distanceUnavailable")}
              </p>
            )}
            {!showRequestData ? (
              <p className="admin-empty">
                {t(requestFailure ? "volunteerDashboard.loadError" : "volunteerDashboard.loading")}
              </p>
            ) : tableRequests.length === 0 ? (
              <p className="admin-empty">
                {t(
                  requestFilter === "available"
                    ? "volunteerDashboard.availableEmpty"
                    : requestFilter === "assigned"
                      ? "volunteerDashboard.assignedEmpty"
                      : "volunteerDashboard.emptyAll",
                )}
              </p>
            ) : searchedRequests.length === 0 ? (
              <p className="admin-empty">{t("helpRequests.noMatches")}</p>
            ) : (
              <div className="dashboard-request-section">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("helpRequests.service")}</th>
                        <th>{t("helpRequests.description")}</th>
                        <th>{t("helpRequests.wilayat")}</th>
                        <th>{t("helpRequests.status")}</th>
                        <th>{t("volunteerDashboard.distance")}</th>
                        <th>{t("helpRequests.date")}</th>
                        <th>{t("adminDashboard.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestPage.rows.map((request) => (
                        <tr key={request.id}>
                          <td>{localizedRequestService(request, i18n.language) || "—"}</td>
                          <td className="admin-cell-clip">{request.description || "—"}</td>
                          <td>{wilayatLabel(request.wilayat)}</td>
                          <td>
                            <RequestTimeline status={request.status} />
                          </td>
                          <td>{formatDistance(request)}</td>
                          <td dir="ltr">{formatDate(request.createdAt)}</td>
                          <td>{renderRequestActions(request)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-request-cards">
                  {requestPage.rows.map((request) => (
                    <article key={request.id} className="admin-request-card">
                      <div className="admin-request-card-head">
                        <h3>{localizedRequestService(request, i18n.language) || "—"}</h3>
                        <span className="dashboard-request-card-date" dir="ltr">{formatDate(request.createdAt)}</span>
                      </div>
                      <p className="dashboard-request-card-description">{request.description || "—"}</p>
                      <dl className="dashboard-request-card-fields">
                        <div>
                          <dt>{t("helpRequests.wilayat")}</dt>
                          <dd>{wilayatLabel(request.wilayat)}</dd>
                        </div>
                        <div>
                          <dt>{t("volunteerDashboard.distance")}</dt>
                          <dd>{formatDistance(request)}</dd>
                        </div>
                      </dl>
                      <div className="dashboard-request-card-status">
                        <RequestTimeline status={request.status} />
                      </div>
                      {renderRequestActions(request)}
                    </article>
                  ))}
                </div>
              </div>
            )}
            {showRequestData && (
              <Pagination
                page={requestPage.page}
                pageSize={requestPage.pageSize}
                total={requestPage.total}
                onPageChange={requestPage.setPage}
                onPageSizeChange={requestPage.setPageSize}
              />
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={!!selectedRequest}
        toggle={() => setSelectedRequest(null)}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setSelectedRequest(null)} closeAriaLabel={t("common.close")}>
          <BackButton onBack={() => setSelectedRequest(null)} />
          {t("helpRequests.view")}
        </ModalHeader>
        <ModalBody>
          {selectedRequest && (
            <>
              <p><strong>{t("helpRequests.service")}:</strong> {localizedRequestService(selectedRequest, i18n.language) || "—"}</p>
              <p>
                <strong>{t("helpRequests.governorate")}:</strong>{" "}
                {t("helpRequests.governorateMuscat")}
              </p>
              <p>
                <strong>{t("helpRequests.wilayat")}:</strong>{" "}
                {wilayatLabel(selectedRequest.wilayat)}
              </p>
              <p>
                <strong>{t("helpRequests.area")}:</strong> {selectedRequest.area || "—"}
              </p>
              <p>
                <strong>{t("helpRequests.street")}:</strong> {selectedRequest.street || "—"}
              </p>
              <p>
                <strong>{t("helpRequests.building")}:</strong> {selectedRequest.building || "—"}
              </p>
              <p>
                <strong>{t("helpRequests.landmark")}:</strong> {selectedRequest.landmark || "—"}
              </p>
              <p>
                <strong>{t("helpRequests.coordinates")}:</strong>{" "}
                {Number(selectedRequest.latitude).toFixed(6)}, {Number(selectedRequest.longitude).toFixed(6)}
              </p>
              {selectedRequest.status === "pending" && (
                <p>
                  <strong>{t("volunteerDashboard.distance")}:</strong> {formatDistance(selectedRequest)}
                </p>
              )}
              <p>
                <strong>{t("helpRequests.description")}:</strong>{" "}
                {selectedRequest.description || "—"}
              </p>
              <RequestTimeline status={selectedRequest.status} />
              <MuscatMap
                latitude={selectedRequest.latitude}
                longitude={selectedRequest.longitude}
                readOnly
                tracking={
                  (selectedRequest.status === "accepted" ||
                    selectedRequest.status === "in-progress") &&
                  Boolean(savedLocation)
                }
                liveVolunteer={
                  selectedRequest.status === "accepted" ||
                  selectedRequest.status === "in-progress"
                    ? savedLocation
                    : null
                }
                showStraightLine={
                  (selectedRequest.status === "accepted" ||
                    selectedRequest.status === "in-progress") &&
                  Boolean(savedLocation)
                }
              />
            </>
          )}
        </ModalBody>
        {selectedRequest?.status === "pending" && (
          <ModalFooter className="dashboard-modal-actions volunteer-decision-actions">
            {volunteerIsBusy && (
              <p className="help-request-note">{t("helpRequests.volunteerBusy")}</p>
            )}
            <div className="volunteer-decision-row">
              <Button
                type="button"
                className="dashboard-action-button volunteer-accept-button"
                disabled={busyId === selectedRequest.id || volunteerIsBusy}
                title={volunteerIsBusy ? t("helpRequests.volunteerBusy") : undefined}
                onClick={() => updateStatus(selectedRequest, "accepted")}
              >
                {t("helpRequests.accept")}
              </Button>
              <Button
                type="button"
                className="dashboard-action-button volunteer-reject-button"
                disabled={busyId === selectedRequest.id}
                onClick={() => updateStatus(selectedRequest, "rejected")}
              >
                {t("helpRequests.reject")}
              </Button>
            </div>
          </ModalFooter>
        )}
        {selectedRequest?.status === "accepted" && (
          <ModalFooter className="dashboard-modal-actions">
            <Button
              type="button"
              className="dashboard-action-button dashboard-save-button"
              disabled={busyId === selectedRequest.id}
              onClick={() => updateStatus(selectedRequest, "in-progress")}
            >
              {t("helpRequests.startHelping")}
            </Button>
          </ModalFooter>
        )}
        {selectedRequest?.status === "in-progress" && (
          <ModalFooter className="dashboard-modal-actions">
            <Button
              type="button"
              className="dashboard-action-button dashboard-save-button"
              disabled={busyId === selectedRequest.id}
              onClick={() => updateStatus(selectedRequest, "completed")}
            >
              {t("helpRequests.markCompleted")}
            </Button>
          </ModalFooter>
        )}
      </Modal>
    </DashboardLayout>
  );
};

export default VolunteerDashboard;

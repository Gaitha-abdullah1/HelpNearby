import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector, useStore } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { yupResolver } from "@hookform/resolvers/yup";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Button, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { FaEye, FaRegStar, FaSearch, FaStar } from "react-icons/fa";

import ActivityFeed from "./ActivityFeed";
import BackButton from "./BackButton";
import StatusChart from "./StatusChart";
import DashboardLayout from "./DashboardLayout";
import Pagination from "./Pagination";
import { usePagination } from "./usePagination";
import MuscatMap from "./MuscatMap";
import RequestTimeline from "./RequestTimeline";
import UserGuide from "./UserGuide";
import feedbackSchema from "../validation/feedbackSchema";
import helpRequestSchema from "../validation/helpRequestSchema";
import { readCurrentCoordinates } from "../deviceLocation";
import { isInsideMuscat, nearestWilayat } from "../muscatBoundary";
import { localizedCategoryName, localizedRequestService, localizedServiceName } from "../bilingualText";
import { canOwnerCancel } from "../offerWindow";
import { formatMuscatClock } from "../notificationDateTime";
import {
  ensureServicesReducer,
  fetchServiceCatalog,
  selectCatalogStatus,
  selectServiceCatalog,
} from "../features/servicesSlice";
import {
  cancelHelpRequest,
  createHelpRequest,
  expireMyHelpRequestFetch,
  fetchMyHelpRequests,
  resetMyHelpRequests,
  selectMyHelpRequestOwnerId,
  selectMyHelpRequestStatus,
  selectMyHelpRequests,
} from "../features/helpRequestsSlice";
const toastOptions = { duration: 3000 };
const API_URL = "http://localhost:5000/api";

const isActiveRouteStatus = (status) => status === "accepted" || status === "in-progress";

const formatRouteDistance = (meters) => (Number(meters) / 1000).toFixed(1);

const formatRouteMinutes = (seconds) => String(Math.max(1, Math.round(Number(seconds) / 60)));

const routePoint = (point) => (
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude) ? point : null
);

const POLL_INTERVAL = 12000;
const SUPPORTED_SECTIONS = ["home", "requests", "activity"];

const ActionButton = ({ label, className, onClick, children }) => (
  <button
    type="button"
    className={`admin-icon-button ${className}`}
    title={label}
    aria-label={label}
    onClick={onClick}
  >
    {children}
  </button>
);

const UserDashboard = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const store = useStore();
  const user = useSelector((state) => state.auth.user);
  const services = useSelector(selectServiceCatalog);
  const catalogStatus = useSelector(selectCatalogStatus);
  const servicesStatus = catalogStatus === "idle" ? "loading" : catalogStatus;
  const section = new URLSearchParams(location.search).get("section") || "home";
  useLayoutEffect(() => {
    ensureServicesReducer(store);
  }, [store]);
  const requests = useSelector(selectMyHelpRequests);
  const requestsStatus = useSelector(selectMyHelpRequestStatus);
  const requestsOwnerId = useSelector(selectMyHelpRequestOwnerId);
  useLayoutEffect(() => {
    dispatch(resetMyHelpRequests(user?.id || ""));
  }, [dispatch, user?.id]);
  const [requestQuery, setRequestQuery] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [feedbackStatus, setFeedbackStatus] = useState("loading");
  const [feedbackOwnerId, setFeedbackOwnerId] = useState("");
  const [requestsReload, setRequestsReload] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [roadRoute, setRoadRoute] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [cancelCandidate, setCancelCandidate] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [feedbackRequest, setFeedbackRequest] = useState(null);
  const signedInUserId = user?.id || "";
  const [dialogOwnerId, setDialogOwnerId] = useState(signedInUserId);
  if (signedInUserId !== dialogOwnerId) {
    setDialogOwnerId(signedInUserId);
    setSelectedRequest(null);
    setCancelCandidate(null);
    setFeedbackRequest(null);
  }
  const [submittedFeedbackIds, setSubmittedFeedbackIds] = useState([]);
  const [detectedAddress, setDetectedAddress] = useState("");
  const [geocodeStatus, setGeocodeStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const geocodeRequest = useRef(0);
  const requestsSeq = useRef(0);
  const feedbackSeq = useRef(0);
  const servicesSeq = useRef(0);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    trigger,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(helpRequestSchema),
    mode: "onChange",
    defaultValues: {
      categoryId: "",
      serviceIds: [],
      latitude: null,
      longitude: null,
      wilayat: "",
      area: "",
      street: "",
      building: "",
      landmark: "",
      locationConfirmed: false,
      description: "",
    },
  });

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [requestCategories, setRequestCategories] = useState([]);
  const [requestCategoryStatus, setRequestCategoryStatus] = useState("idle");
  const selectedCategoryId = watch("categoryId");
  const categoryServices = useMemo(
    () => services.filter((service) => service.category === selectedCategoryId),
    [services, selectedCategoryId],
  );
  const {
    control: feedbackControl,
    handleSubmit: handleFeedbackSubmit,
    reset: resetFeedback,
    setValue: setFeedbackValue,
    formState: { errors: feedbackErrors, isSubmitting: isFeedbackSubmitting },
  } = useForm({
    resolver: yupResolver(feedbackSchema),
    mode: "onChange",
    defaultValues: { rating: null, comment: "" },
  });
  const [selectedRating, setSelectedRating] = useState(0);

  const showError = useCallback((errorCode) => {
    const code = errorCode || "SERVER_ERROR";
    const key = `helpRequests.errors.${code}`;
    toast.error(
      t(key) === key ? t("helpRequests.errors.SERVER_ERROR") : t(key),
      toastOptions,
    );
  }, [t, toastOptions]);

  const unconfirmLocation = () => {
    setValue("locationConfirmed", false);
    clearErrors("locationConfirmed");
  };

  const clearSelectedAddress = () => {
    geocodeRequest.current += 1;
    setDetectedAddress("");
    setGeocodeStatus("");
    setSelectedPoint(null);
  };

  const applyPoint = async (point) => {
    const requestId = geocodeRequest.current + 1;
    geocodeRequest.current = requestId;
    setSelectedPoint(point);
    setValue("latitude", point.latitude, { shouldValidate: true });
    setValue("longitude", point.longitude, { shouldValidate: true });
    setValue("wilayat", point.wilayat, { shouldValidate: true });
    setValue("area", "");
    setValue("street", "");
    setValue("building", "");
    setValue("landmark", "");
    unconfirmLocation();
    setDetectedAddress("");
    setGeocodeStatus("loading");
    clearErrors(["latitude", "longitude"]);

    try {
      const response = await axios.get(`${API_URL}/geocode/reverse`, {
        params: { latitude: point.latitude, longitude: point.longitude },
      });
      if (geocodeRequest.current !== requestId) return;

      const address = response.data || {};
      if (!address.geocodeAvailable) {
        setGeocodeStatus("unavailable");
        return;
      }

      setDetectedAddress(address.detectedAddress || "");
      if (address.wilayat) setValue("wilayat", address.wilayat, { shouldValidate: true });
      if (address.area && !getValues("area")) setValue("area", address.area, { shouldValidate: true });
      if (address.street && !getValues("street")) setValue("street", address.street, { shouldValidate: true });
      if (address.building && !getValues("building")) {
        setValue("building", address.building, { shouldValidate: true });
      }
      unconfirmLocation();
      setGeocodeStatus("ready");
    } catch (error) {
      if (geocodeRequest.current !== requestId) return;
      if (error.response?.data?.errorCode === "INVALID_LOCATION") {
        clearSelectedAddress();
        setValue("latitude", null, { shouldValidate: true });
        setValue("longitude", null, { shouldValidate: true });
        setError("latitude", {
          type: "manual",
          message: "helpRequests.validation.outsideMuscat",
        });
        return;
      }
      setGeocodeStatus("unavailable");
    }
  };

  const requestCurrentLocation = async () => {
    setLocating(true);
    clearErrors("latitude");
    try {
      const point = await readCurrentCoordinates();
      if (!isInsideMuscat(point.latitude, point.longitude)) {
        setError("latitude", {
          type: "manual",
          message: "helpRequests.validation.outsideMuscat",
        });
        return;
      }
      applyPoint({
        latitude: point.latitude,
        longitude: point.longitude,
        wilayat: nearestWilayat(point.latitude, point.longitude),
      });
    } catch (error) {
      const reason = error?.reason;
      const message =
        reason === "denied"
          ? "helpRequests.validation.locationDenied"
          : reason === "timeout"
            ? "helpRequests.validation.locationTimeout"
            : reason === "unsupported"
              ? "helpRequests.validation.locationUnavailable"
              : "helpRequests.validation.locationFailed";
      setError("latitude", { type: "manual", message });
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (SUPPORTED_SECTIONS.includes(section)) return undefined;
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
    return undefined;
  }, [location.pathname, navigate, section]);

  useEffect(() => {
    if (!isActiveRouteStatus(selectedRequest?.status) || !selectedRequest?.id || !user?.id) {
      setRoadRoute(null);
      setRouteBusy(false);
      return undefined;
    }

    let active = true;
    const requestId = selectedRequest.id;
    setRouteBusy(true);
    axios
      .post(`${API_URL}/help-requests/${requestId}/route`, { userId: user.id })
      .then((response) => {
        if (!active) return;
        const route = response.data?.route;
        const origin = routePoint(route?.origin);
        if (!origin || !Array.isArray(route?.points) || route.points.length < 2) {
          setRoadRoute(origin ? {
            requestId,
            points: null,
            origin,
            destination: routePoint(route?.destination),
            notice: "fallback",
          } : null);
          return;
        }
        setRoadRoute({
          requestId,
          points: route.points,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          routedAt: new Date(route.routedAt).getTime(),
          origin,
          destination: routePoint(route.destination),
          notice: "ready",
        });
      })
      .catch((error) => {
        if (!active) return;
        const code = error.response?.data?.errorCode;
        const origin = routePoint(error.response?.data?.origin);
        if (code === "NO_LIVE_LOCATION" || code === "TRACKING_NOT_ACTIVE" || !origin) {
          setRoadRoute(null);
          return;
        }
        setRoadRoute({
          requestId,
          points: null,
          origin,
          destination: routePoint(error.response?.data?.destination),
          notice: "fallback",
        });
      })
      .finally(() => {
        if (active) setRouteBusy(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRequest?.id, selectedRequest?.status, user?.id]);

  useEffect(() => {
    if (section !== "requests") return undefined;
    let active = true;
    setRequestCategoryStatus("loading");
    axios
      .get(`${API_URL}/categories`)
      .then((response) => {
        if (!active) return;
        const rows = Array.isArray(response.data?.categories) ? response.data.categories : [];
        setRequestCategories(rows.filter((category) => category?.id && category.isActive !== false));
        setRequestCategoryStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setRequestCategoryStatus("error");
      });
    return () => {
      active = false;
    };
  }, [section]);

  useEffect(() => {
    if (section !== "requests" || location.hash !== "#my-help-requests") return undefined;
    document.getElementById("my-help-requests")?.scrollIntoView({ block: "start" });
    return undefined;
  }, [section, location.hash]);

  useEffect(() => {
    if ((section !== "home" && section !== "requests") || !user?.id) return undefined;
    let active = true;

    const loadRequests = (reportError) => {
      const requestId = requestsSeq.current + 1;
      requestsSeq.current = requestId;
      dispatch(fetchMyHelpRequests({ userId: user.id, requestId })).then((result) => {
        if (!active || requestsSeq.current !== requestId) return;
        if (fetchMyHelpRequests.fulfilled.match(result)) {
          const rows = result.payload || [];
          setSelectedRequest((current) => {
            if (!current) return current;
            const fresh = rows.find((request) => request.id === current.id);
            return fresh ? { ...current, ...fresh } : current;
          });
          return;
        }
        if (reportError) showError(result.payload?.errorCode);
      });
    };

    const loadFeedback = (reportError) => {
      const requestId = feedbackSeq.current + 1;
      feedbackSeq.current = requestId;
      axios
        .get(`${API_URL}/feedback/my`, { params: { userId: user.id } })
        .then((response) => {
          if (!active || feedbackSeq.current !== requestId) return;
          setSubmittedFeedbackIds(
            (response.data?.feedbacks || []).map((feedback) => feedback.helpRequestId),
          );
          setFeedbackOwnerId(user.id);
          setFeedbackStatus("success");
        })
        .catch((error) => {
          if (!active || feedbackSeq.current !== requestId) return;
          setFeedbackStatus("error");
          if (reportError) showError(error.response?.data?.errorCode);
        });
    };

    if (section === "requests") {
      const requestId = servicesSeq.current + 1;
      servicesSeq.current = requestId;
      dispatch(fetchServiceCatalog(requestId)).then((result) => {
        if (!active || servicesSeq.current !== requestId) return;
        if (fetchServiceCatalog.rejected.match(result)) {
          showError(result.payload?.errorCode);
        }
      });
      loadFeedback(true);
    }

    loadRequests(true);
    const onRefresh = () => loadRequests(false);
    window.addEventListener("helpnearby-requests-refresh", onRefresh);
    const timer = setInterval(() => {
      loadRequests(false);
      if (section === "requests") loadFeedback(false);
    }, POLL_INTERVAL);

    return () => {
      active = false;
      window.removeEventListener("helpnearby-requests-refresh", onRefresh);
      dispatch(expireMyHelpRequestFetch());
      clearInterval(timer);
    };
  }, [dispatch, requestsReload, section, showError, user?.id]);

  const creatingRequest = useRef(false);

  const onSubmit = async (data) => {
    if (!user?.id || isSubmitting || creatingRequest.current) return;
    creatingRequest.current = true;

    let result;
    try {
      result = await dispatch(createHelpRequest({
        userId: user?.id,
        serviceIds: data.serviceIds,
        description: data.description?.trim() || "",
        latitude: data.latitude,
        longitude: data.longitude,
        governorate: "muscat",
        wilayat: data.wilayat,
        area: data.area.trim(),
        street: data.street.trim(),
        building: data.building.trim(),
        landmark: data.landmark.trim(),
        locationConfirmed: true,
      }));
    } finally {
      creatingRequest.current = false;
    }
    if (!createHelpRequest.fulfilled.match(result)) {
      showError(result.payload?.errorCode);
      return;
    }
    const duplicate = result.payload?.duplicate === true;
    toast.success(
      t(duplicate
        ? "helpRequests.success.REQUEST_DUPLICATE"
        : "helpRequests.success.REQUEST_CREATED"),
      toastOptions,
    );
    reset();
    setSelectedPoint(null);
    setDetectedAddress("");
    setGeocodeStatus("");
    if (!duplicate) {
      window.dispatchEvent(new Event("helpnearby-notifications"));
      window.dispatchEvent(new Event("helpnearby-activity"));
    }
    setRequestsReload((value) => value + 1);
  };

  const openFeedback = (request) => {
    setSelectedRating(0);
    resetFeedback({ rating: null, comment: "" });
    setFeedbackRequest(request);
  };

  const onFeedbackSubmit = async (data) => {
    if (!feedbackRequest) return;

    try {
      await axios.post(`${API_URL}/feedback`, {
        userId: user?.id,
        helpRequestId: feedbackRequest.id,
        rating: data.rating,
        comment: data.comment.trim(),
      });
      toast.success(t("feedback.success"), toastOptions);
      setSubmittedFeedbackIds((current) =>
        current.includes(feedbackRequest.id) ? current : [...current, feedbackRequest.id],
      );
      setFeedbackRequest(null);
      window.dispatchEvent(new Event("helpnearby-notifications"));
      window.dispatchEvent(new Event("helpnearby-activity"));
    } catch (error) {
      showError(error.response?.data?.errorCode);
    }
  };

  const confirmCancel = async () => {
    if (!cancelCandidate || !user?.id || cancelBusy) return;
    setCancelBusy(true);
    try {
      const result = await dispatch(cancelHelpRequest({
        id: cancelCandidate.id,
        userId: user.id,
      }));
      if (!cancelHelpRequest.fulfilled.match(result)) {
        showError(result.payload?.errorCode);
        setCancelCandidate(null);
        setRequestsReload((value) => value + 1);
        return;
      }
      const next = result.payload;
      if (next?.id) {
        setSelectedRequest((current) =>
          current?.id === next.id ? { ...current, ...next } : current,
        );
      }
      setCancelCandidate(null);
      toast.success(t("helpRequests.success.REQUEST_CANCELLED"), toastOptions);
      window.dispatchEvent(new Event("helpnearby-notifications"));
      window.dispatchEvent(new Event("helpnearby-activity"));
    } finally {
      setCancelBusy(false);
    }
  };

  const formatDate = (value) =>
    value ? new Date(value).toLocaleString(i18n.language) : "—";

  const requestsConfirmed = Boolean(user?.id) && requestsOwnerId === user.id;
  const visibleRequests = useMemo(
    () => (requestsConfirmed ? requests : []),
    [requestsConfirmed, requests],
  );
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
      {canOwnerCancel(request.status) && (
        <Button
          type="button"
          className="dashboard-action-button dashboard-neutral-button"
          onClick={() => setCancelCandidate(request)}
        >
          {t("helpRequests.cancelRequest")}
        </Button>
      )}
      {feedbackOwnerId === user.id && request.status === "completed" &&
        (submittedFeedbackIds.includes(request.id) ? (
          <span className="help-request-note">{t("helpRequests.feedbackSent")}</span>
        ) : (
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            onClick={() => openFeedback(request)}
          >
            {t("helpRequests.giveFeedback")}
          </Button>
        ))}
    </div>
  );
  const requestCounts = useMemo(() => {
    const countStatus = (statuses) =>
      visibleRequests.filter((request) => statuses.includes(request.status)).length;

    return {
      total: visibleRequests.length,
      pending: countStatus(["pending"]),
      active: countStatus(["accepted", "in-progress"]),
      completed: countStatus(["completed"]),
    };
  }, [visibleRequests]);
  const requestStatusItems = useMemo(
    () =>
      ["pending", "accepted", "in-progress", "completed", "cancelled", "rejected"].map((status) => ({
        key: status,
        label: t(`helpRequests.statuses.${status}`),
        value: visibleRequests.filter((request) => request.status === status).length,
      })),
    [t, visibleRequests],
  );
  const recentRequests = useMemo(
    () =>
      [...visibleRequests]
        .sort(
          (first, second) =>
            new Date(second.createdAt || 0).getTime() -
            new Date(first.createdAt || 0).getTime(),
        )
        .slice(0, 3),
    [visibleRequests],
  );
  const requestFiltersActive = requestQuery.trim() !== "" || requestStatusFilter !== "all";
  const listedRequests = useMemo(() => {
    const query = requestQuery.trim().toLowerCase();
    return visibleRequests.filter((request) => {
      if (requestStatusFilter !== "all" && request.status !== requestStatusFilter) return false;
      if (!query) return true;
      return [
        localizedRequestService(request, i18n.language),
        request.description,
        wilayatLabel(request.wilayat),
        t(`helpRequests.statuses.${request.status}`),
      ].join(" ").toLowerCase().includes(query);
    });
  }, [i18n.language, requestQuery, requestStatusFilter, t, visibleRequests]);
  const requestPage = usePagination(
    listedRequests,
    `${section}:${requestStatusFilter}:${requestQuery.trim().toLowerCase()}`,
  );
  const greeting = user?.fullName
    ? t("userDashboard.greeting", { name: user.fullName })
    : t("userDashboard.greetingPlain");

  const openRequestForm = () => {
    navigate({ pathname: "/user", search: "section=requests" });
  };

  const openMyRequests = () => {
    navigate({
      pathname: "/user",
      search: "section=requests",
      hash: "my-help-requests",
    });
  };

  const openProfile = () => {
    navigate("/user/profile");
  };

  const requestFailure = requestsStatus === "error";
  const showRequestData = requestsConfirmed;

  return (
    <DashboardLayout>
      <UserGuide />
      <div className="admin-page">
        {!user?.id ? (
          <section className="user-home">
            <div className="user-home-panel">
              <p className="help-request-note">{t("userDashboard.sessionRequired")}</p>
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
                <p className="dashboard-welcome">{t("userDashboard.overview")}</p>
              </div>
              <Button
                type="button"
                className="dashboard-action-button dashboard-password-open-button"
                onClick={openRequestForm}
              >
                {t("userDashboard.requestHelp")}
              </Button>
            </div>

            {showRequestData && requestFailure && (
              <p className="help-request-note">{t("userDashboard.loadError")}</p>
            )}

            {!showRequestData && requestFailure ? (
              <p className="help-request-note">{t("userDashboard.loadError")}</p>
            ) : !showRequestData ? (
              <p className="help-request-note">{t("userDashboard.loading")}</p>
            ) : (
              <div className="user-home-stats">
                {[
                  ["total", requestCounts.total],
                  ["pending", requestCounts.pending],
                  ["active", requestCounts.active],
                  ["completed", requestCounts.completed],
                ].map(([key, value]) => (
                  <article key={key} className="user-home-stat">
                    <strong>{value}</strong>
                    <span>{t(`userDashboard.stats.${key}`)}</span>
                  </article>
                ))}
              </div>
            )}

            {showRequestData && (
              <StatusChart
                title={t("userDashboard.chartTitle")}
                emptyLabel={t("userDashboard.chartEmpty")}
                items={requestStatusItems}
              />
            )}

            <div className="user-home-panel">
              <div className="user-home-panel-header">
                <h3>{t("userDashboard.recent")}</h3>
                {showRequestData && visibleRequests.length > 0 && (
                  <button type="button" className="user-home-text-action" onClick={openMyRequests}>
                    {t("userDashboard.viewAll")}
                  </button>
                )}
              </div>
              {!showRequestData ? (
                <p className="help-request-note">
                  {t(requestFailure ? "userDashboard.loadError" : "userDashboard.loading")}
                </p>
              ) : recentRequests.length === 0 ? (
                <div className="user-home-empty">
                  <p>{t("userDashboard.empty")}</p>
                  <Button
                    type="button"
                    className="dashboard-action-button dashboard-password-open-button"
                    onClick={openRequestForm}
                  >
                    {t("userDashboard.requestHelp")}
                  </Button>
                </div>
              ) : (
                <ul className="user-home-recent">
                  {recentRequests.map((request) => (
                    <li key={request.id}>
                      <div>
                        <strong className="user-home-request-name">
                          {localizedRequestService(request, i18n.language) || "—"}
                        </strong>
                        <div className="user-home-request-date">{formatDate(request.createdAt)}</div>
                      </div>
                      <span className={`admin-status is-${request.status || "pending"}`}>
                        {request.status
                          ? t(`helpRequests.statuses.${request.status}`)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="user-home-panel">
              <h3>{t("userDashboard.quickActions")}</h3>
              <div className="user-home-actions">
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-password-open-button"
                  onClick={openRequestForm}
                >
                  {t("userDashboard.requestHelp")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={openMyRequests}
                >
                  {t("userDashboard.myRequests")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={openProfile}
                >
                  {t("userDashboard.myProfile")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {user?.id && section === "activity" && <ActivityFeed />}

        {user?.id && section === "requests" && (
          <>
            <div className="admin-section-header">
              <h2>{t("helpRequests.createTitle")}</h2>
            </div>
            <Form
              className="dashboard-profile-form help-request-form"
              onSubmit={handleSubmit(onSubmit)}
              noValidate
            >
              <FormGroup>
                <Label for="helpRequestCategory">{t("helpRequests.category")}</Label>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="helpRequestCategory"
                      className="app-select"
                      type="select"
                      invalid={!!errors.categoryId}
                      onChange={(event) => {
                        field.onChange(event);
                        setValue("serviceIds", [], { shouldDirty: true, shouldValidate: false });
                        clearErrors("serviceIds");
                      }}
                    >
                      <option value="">{t("helpRequests.categoryPlaceholder")}</option>
                      {requestCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {localizedCategoryName(category, i18n.language) || category.id}
                        </option>
                      ))}
                    </Input>
                  )}
                />
                {requestCategoryStatus === "loading" && (
                  <p className="help-request-note">{t("userDashboard.loading")}</p>
                )}
                {requestCategoryStatus === "error" && (
                  <p className="help-request-note">{t("userDashboard.loadError")}</p>
                )}
                {errors.categoryId && (
                  <div className="form-error">{t(errors.categoryId.message)}</div>
                )}
              </FormGroup>
              <FormGroup>
                <Label id="helpServiceLabel">{t("helpRequests.services")}</Label>
                <p className="help-request-note">{t("helpRequests.servicesHint")}</p>
                {selectedCategoryId && categoryServices.length > 0 && (
                  <Controller
                    name="serviceIds"
                    control={control}
                    render={({ field }) => {
                      const selected = Array.isArray(field.value) ? field.value : [];
                      return (
                        <div
                          className={`service-checkbox-list${errors.serviceIds ? " is-invalid" : ""}`}
                          role="group"
                          aria-labelledby="helpServiceLabel"
                        >
                          {categoryServices.map((service) => {
                            const inputId = `help-service-${service.id}`;
                            return (
                              <label key={service.id} className="service-checkbox-item" htmlFor={inputId}>
                                <Input
                                  id={inputId}
                                  type="checkbox"
                                  value={service.id}
                                  checked={selected.includes(service.id)}
                                  onChange={() => {
                                    field.onChange(
                                      selected.includes(service.id)
                                        ? selected.filter((id) => id !== service.id)
                                        : [...selected, service.id],
                                    );
                                  }}
                                  onBlur={field.onBlur}
                                />
                                <span>{localizedServiceName(service, i18n.language) || service.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                )}
                {errors.serviceIds && (
                  <div className="form-error">{t(errors.serviceIds.message)}</div>
                )}
                {selectedCategoryId && (servicesStatus === "loading" ? (
                  <p className="help-request-note">{t("userDashboard.loading")}</p>
                ) : servicesStatus === "error" ? (
                  <p className="help-request-note">{t("userDashboard.loadError")}</p>
                ) : categoryServices.length === 0 ? (
                  <p className="help-request-note">{t("helpRequests.noCategoryServices")}</p>
                ) : null)}
              </FormGroup>

              <FormGroup>
                <Label>{t("helpRequests.location")}</Label>
                <MuscatMap
                  latitude={selectedPoint?.latitude ?? null}
                  longitude={selectedPoint?.longitude ?? null}
                  onSelect={(point) => {
                    clearErrors(["latitude", "longitude"]);
                    applyPoint(point);
                  }}
                  onOutside={() => {
                    setError("latitude", {
                      type: "manual",
                      message: "helpRequests.validation.outsideMuscat",
                    });
                  }}
                />
                <div className="help-request-actions">
                  <Button
                    type="button"
                    className="dashboard-action-button dashboard-neutral-button"
                    disabled={locating}
                    onClick={requestCurrentLocation}
                  >
                    {locating ? t("helpRequests.locating") : t("helpRequests.useCurrentLocation")}
                  </Button>
                </div>
                <Controller name="latitude" control={control} render={() => null} />
                <Controller name="longitude" control={control} render={() => null} />
                {(errors.latitude || errors.longitude) && (
                  <div className="form-error">
                    {t((errors.latitude || errors.longitude).message)}
                  </div>
                )}
                {selectedPoint && (
                  <div className="address-panel">
                    <p className="help-request-note">
                      <strong>{t("helpRequests.coordinates")}:</strong>{" "}
                      {selectedPoint.latitude.toFixed(6)}, {selectedPoint.longitude.toFixed(6)}
                    </p>
                    {geocodeStatus === "loading" && (
                      <p className="help-request-note">{t("helpRequests.geocodeLoading")}</p>
                    )}
                    {geocodeStatus === "unavailable" && (
                      <p className="help-request-note">{t("helpRequests.geocodeUnavailable")}</p>
                    )}
                    {geocodeStatus === "ready" && (
                      <div className="detected-address">
                        <strong>{t("helpRequests.detectedAddress")}</strong>
                        <p>{detectedAddress || t("helpRequests.detectedAddressEmpty")}</p>
                      </div>
                    )}
                    <FormGroup>
                      <Label>{t("helpRequests.governorate")}</Label>
                      <Input value={t("helpRequests.governorateMuscat")} readOnly />
                    </FormGroup>
                    <div className="address-grid">
                      <FormGroup>
                        <Label for="helpWilayat">{t("helpRequests.wilayat")}</Label>
                        <Controller
                          name="wilayat"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              id="helpWilayat"
                              className="app-select"
                              type="select"
                              invalid={!!errors.wilayat}
                              onChange={(event) => {
                                field.onChange(event);
                                unconfirmLocation();
                              }}
                            >
                              <option value="">{t("helpRequests.wilayatPlaceholder")}</option>
                              {["muscat", "muttrah", "bawshar", "seeb", "amarat", "qurayyat"].map((key) => (
                                <option key={key} value={key}>
                                  {t(`helpRequests.wilayats.${key}`)}
                                </option>
                              ))}
                            </Input>
                          )}
                        />
                        {errors.wilayat && (
                          <div className="form-error">{t(errors.wilayat.message)}</div>
                        )}
                      </FormGroup>
                      <FormGroup>
                        <Label for="helpArea">{t("helpRequests.area")}</Label>
                        <Controller
                          name="area"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              id="helpArea"
                              invalid={!!errors.area}
                              placeholder={t("helpRequests.areaPlaceholder")}
                              onChange={(event) => {
                                field.onChange(event);
                                unconfirmLocation();
                              }}
                            />
                          )}
                        />
                        {errors.area && <div className="form-error">{t(errors.area.message)}</div>}
                      </FormGroup>
                      <FormGroup>
                        <Label for="helpStreet">{t("helpRequests.street")}</Label>
                        <Controller
                          name="street"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              id="helpStreet"
                              invalid={!!errors.street}
                              placeholder={t("helpRequests.streetPlaceholder")}
                              onChange={(event) => {
                                field.onChange(event);
                                unconfirmLocation();
                                trigger(["street", "building"]);
                              }}
                            />
                          )}
                        />
                        {errors.street && (
                          <div className="form-error">{t(errors.street.message)}</div>
                        )}
                      </FormGroup>
                      <FormGroup>
                        <Label for="helpBuilding">{t("helpRequests.building")}</Label>
                        <Controller
                          name="building"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              id="helpBuilding"
                              invalid={!!errors.building}
                              placeholder={t("helpRequests.buildingPlaceholder")}
                              onChange={(event) => {
                                field.onChange(event);
                                unconfirmLocation();
                                trigger(["street", "building"]);
                              }}
                            />
                          )}
                        />
                        {errors.building && (
                          <div className="form-error">{t(errors.building.message)}</div>
                        )}
                      </FormGroup>
                    </div>
                    <FormGroup>
                      <Label for="helpLandmark">{t("helpRequests.landmark")}</Label>
                      <Controller
                        name="landmark"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            id="helpLandmark"
                            type="textarea"
                            rows="3"
                            invalid={!!errors.landmark}
                            placeholder={t("helpRequests.landmarkPlaceholder")}
                            onChange={(event) => {
                              field.onChange(event);
                              unconfirmLocation();
                              trigger(["street", "building", "landmark"]);
                            }}
                          />
                        )}
                        />
                        {errors.landmark && (
                        <div className="form-error">{t(errors.landmark.message)}</div>
                      )}
                    </FormGroup>
                    <FormGroup check className="address-confirm">
                      <Controller
                        name="locationConfirmed"
                        control={control}
                        render={({ field }) => (
                          <Label check>
                            <Input
                              type="checkbox"
                              checked={!!field.value}
                              onBlur={field.onBlur}
                              onChange={(event) => field.onChange(event.target.checked)}
                            />{" "}
                            {t("helpRequests.confirmLocation")}
                          </Label>
                        )}
                      />
                      {errors.locationConfirmed && (
                        <div className="form-error">{t(errors.locationConfirmed.message)}</div>
                      )}
                    </FormGroup>
                  </div>
                )}
              </FormGroup>

              <FormGroup>
                <Label for="helpDescription">{t("helpRequests.description")}</Label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="helpDescription"
                      type="textarea"
                      rows="4"
                      placeholder={t("helpRequests.descriptionPlaceholder")}
                      invalid={!!errors.description}
                    />
                  )}
                />
                {errors.description && (
                  <div className="form-error">{t(errors.description.message)}</div>
                )}
              </FormGroup>

              <div className="dashboard-modal-actions help-request-actions">
                <Button
                  className="dashboard-action-button dashboard-save-button"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {t("helpRequests.submit")}
                </Button>
                <Button
                  className="dashboard-action-button dashboard-neutral-button"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    reset();
                    clearSelectedAddress();
                  }}
                >
                  {t("dashboard.cancel")}
                </Button>
              </div>
            </Form>

            <div className="admin-section-header" id="my-help-requests">
              <h2>{t("helpRequests.myRequests")}</h2>
            </div>
            {showRequestData && visibleRequests.length > 0 && (
              <div className="admin-request-toolbar">
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
                <Input
                  type="select"
                  className="app-select"
                  value={requestStatusFilter}
                  aria-label={t("helpRequests.status")}
                  onChange={(event) => setRequestStatusFilter(event.target.value)}
                >
                  <option value="all">{t("helpRequests.allStatuses")}</option>
                  {["pending", "accepted", "in-progress", "completed", "cancelled", "rejected"].map((status) => (
                    <option key={status} value={status}>{t(`helpRequests.statuses.${status}`)}</option>
                  ))}
                </Input>
                {requestFiltersActive && (
                  <Button
                    type="button"
                    className="dashboard-action-button dashboard-neutral-button"
                    onClick={() => {
                      setRequestQuery("");
                      setRequestStatusFilter("all");
                    }}
                  >
                    {t("helpRequests.clearFilters")}
                  </Button>
                )}
              </div>
            )}
            {showRequestData && requestFailure && (
              <p className="help-request-note">{t("userDashboard.loadError")}</p>
            )}
            {feedbackStatus === "error" && (
              <p className="help-request-note">{t("userDashboard.feedbackError")}</p>
            )}
            {!showRequestData ? (
              <p className="admin-empty">
                {t(requestFailure ? "userDashboard.loadError" : "userDashboard.loading")}
              </p>
            ) : visibleRequests.length === 0 ? (
              <p className="admin-empty">{t("helpRequests.noRequests")}</p>
            ) : listedRequests.length === 0 ? (
              <p className="admin-empty">{t("helpRequests.noMatches")}</p>
            ) : (
              <div className="dashboard-request-section">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t("helpRequests.service")}</th>
                        <th>{t("helpRequests.wilayat")}</th>
                        <th>{t("helpRequests.status")}</th>
                        <th>{t("helpRequests.date")}</th>
                        <th>{t("adminDashboard.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestPage.rows.map((request) => (
                        <tr key={request.id}>
                          <td>{localizedRequestService(request, i18n.language) || "—"}</td>
                          <td>{wilayatLabel(request.wilayat)}</td>
                          <td>
                            <RequestTimeline status={request.status} />
                          </td>
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
                      <dl className="dashboard-request-card-fields">
                        <div>
                          <dt>{t("helpRequests.wilayat")}</dt>
                          <dd>{wilayatLabel(request.wilayat)}</dd>
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
                <strong>{t("helpRequests.status")}:</strong>{" "}
                {t(`helpRequests.timeline.${selectedRequest.status}`)}
              </p>
              <RequestTimeline status={selectedRequest.status} />
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
              <p>
                <strong>{t("helpRequests.description")}:</strong>{" "}
                {selectedRequest.description || "—"}
              </p>
              {(selectedRequest.status === "accepted" ||
                selectedRequest.status === "in-progress" ||
                selectedRequest.status === "completed") && (
                <p>
                  <strong>{t("helpRequests.volunteer")}:</strong>{" "}
                  {selectedRequest.volunteerName || "—"}
                </p>
              )}
              {(() => {
                const routeForRequest = roadRoute?.requestId === selectedRequest.id ? roadRoute : null;
                const origin = routeForRequest?.origin || null;
                const showRoad = routeForRequest?.notice === "ready" && routeForRequest.points?.length;
                return (
                  <>
                    <MuscatMap
                      latitude={selectedRequest.latitude}
                      longitude={selectedRequest.longitude}
                      readOnly
                      tracking={Boolean(origin)}
                      liveVolunteer={origin}
                      routePoints={showRoad ? routeForRequest.points : null}
                      showStraightLine={routeForRequest?.notice === "fallback"}
                    >
                    {routeForRequest?.notice === "ready" && (
                      <p className="help-request-note map-route-summary">
                        <span>{t("map.roadRoute")}</span>
                        <span>
                          {t("map.routeDistance", {
                            distance: formatRouteDistance(routeForRequest.distanceMeters),
                          })}
                        </span>
                        <span>
                          {t("map.routeDuration", {
                            minutes: formatRouteMinutes(routeForRequest.durationSeconds),
                          })}
                        </span>
                        <span>
                          {t("map.routeUpdated", {
                            time: formatMuscatClock(routeForRequest.routedAt, i18n.language),
                          })}
                        </span>
                      </p>
                    )}
                    {routeBusy && !routeForRequest && (
                      <p className="help-request-note">{t("map.routeUpdating")}</p>
                    )}
                    {routeForRequest?.notice === "fallback" && (
                      <p className="help-request-note">{t("map.routeFallback")}</p>
                    )}
                    </MuscatMap>
                  </>
                );
              })()}
            </>
          )}
        </ModalBody>
        {selectedRequest && canOwnerCancel(selectedRequest.status) && (
          <ModalFooter className="dashboard-modal-actions">
            <Button
              type="button"
              className="dashboard-action-button dashboard-neutral-button"
              onClick={() => setCancelCandidate(selectedRequest)}
            >
              {t("helpRequests.cancelRequest")}
            </Button>
          </ModalFooter>
        )}
        {selectedRequest?.status === "completed" && (
          <ModalFooter className="dashboard-modal-actions">
            {submittedFeedbackIds.includes(selectedRequest.id) ? (
              <span className="help-request-note">{t("helpRequests.feedbackSent")}</span>
            ) : (
              <Button
                type="button"
                className="dashboard-action-button dashboard-neutral-button"
                onClick={() => openFeedback(selectedRequest)}
              >
                {t("helpRequests.giveFeedback")}
              </Button>
            )}
          </ModalFooter>
        )}
      </Modal>

      <Modal
        isOpen={!!cancelCandidate}
        toggle={() => {
          if (!cancelBusy) setCancelCandidate(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader
          closeAriaLabel={t("common.close")}
          toggle={() => {
            if (!cancelBusy) setCancelCandidate(null);
          }}
        >
          {t("helpRequests.cancelConfirmTitle")}
        </ModalHeader>
        <ModalBody>
          <p>{t("helpRequests.cancelConfirmMessage")}</p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button volunteer-reject-button"
            disabled={cancelBusy}
            onClick={confirmCancel}
          >
            {t("helpRequests.confirmCancel")}
          </Button>
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            disabled={cancelBusy}
            onClick={() => setCancelCandidate(null)}
          >
            {t("helpRequests.keepRequest")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!feedbackRequest}
        toggle={() => {
          if (!isFeedbackSubmitting) setFeedbackRequest(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <Form onSubmit={handleFeedbackSubmit(onFeedbackSubmit)} noValidate>
          <ModalHeader
            closeAriaLabel={t("common.close")}
            toggle={() => {
              if (!isFeedbackSubmitting) setFeedbackRequest(null);
            }}
          >
            {t("feedback.title")}
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label>{t("feedback.rating")}</Label>
              <div className="feedback-stars" dir="ltr" role="radiogroup" aria-label={t("feedback.rating")}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`feedback-star${selectedRating >= value ? " is-selected" : ""}`}
                    aria-label={t("feedback.starLabel", { count: value })}
                    onClick={() => {
                      setSelectedRating(value);
                      setFeedbackValue("rating", value, { shouldValidate: true });
                    }}
                  >
                    {selectedRating >= value ? <FaStar /> : <FaRegStar />}
                  </button>
                ))}
              </div>
              <Controller
                name="rating"
                control={feedbackControl}
                render={({ field }) => <input type="hidden" {...field} value={field.value ?? ""} />}
              />
              {feedbackErrors.rating && (
                <div className="form-error">{t(feedbackErrors.rating.message)}</div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="feedbackComment">{t("feedback.comment")}</Label>
              <Controller
                name="comment"
                control={feedbackControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="feedbackComment"
                    type="textarea"
                    rows="4"
                    maxLength={400}
                    placeholder={t("feedback.commentPlaceholder")}
                    invalid={!!feedbackErrors.comment}
                  />
                )}
              />
              {feedbackErrors.comment && (
                <div className="form-error">{t(feedbackErrors.comment.message)}</div>
              )}
            </FormGroup>
          </ModalBody>
          <ModalFooter className="dashboard-modal-actions">
            <Button
              className="dashboard-action-button dashboard-save-button"
              type="submit"
              disabled={isFeedbackSubmitting}
            >
              {t("feedback.submit")}
            </Button>
            <Button
              className="dashboard-action-button dashboard-neutral-button"
              type="button"
              disabled={isFeedbackSubmitting}
              onClick={() => setFeedbackRequest(null)}
            >
              {t("dashboard.cancel")}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>
    </DashboardLayout>
  );
};

export default UserDashboard;

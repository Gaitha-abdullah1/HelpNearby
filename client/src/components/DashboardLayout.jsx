import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { DayPicker } from "@daypicker/react";
import { ar } from "@daypicker/react/locale/ar";
import { enUS } from "@daypicker/react/locale/en-US";
import "@daypicker/react/style.css";
import { yupResolver } from "@hookform/resolvers/yup";
import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Button,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "reactstrap";
import {
  FaBars,
  FaBook,
  FaBell,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaClipboardList,
  FaConciergeBell,
  FaTags,
  FaEye,
  FaEyeSlash,
  FaHandHoldingHeart,
  FaHome,
  FaMapMarkerAlt,
  FaListAlt,
  FaPlus,
  FaSignOutAlt,
  FaStar,
  FaTimes,
  FaTrash,
  FaUser,
  FaUserFriends,
  FaUsers,
} from "react-icons/fa";

import { digitsOnly } from "../digits";
import { changePassword, logout, updateProfile } from "../features/authSlice";
import { formatNotificationDateTime } from "../notificationDateTime";
import {
  deleteAllNotifications as deleteAllNotificationsRequest,
  deleteNotification as deleteNotificationRequest,
  expireNotificationRequest,
  fetchNotifications,
  notificationReceived,
  resetNotificationsOwner,
  selectNotificationItems,
  selectNotificationOwnerId,
  selectNotificationStatus,
} from "../features/notificationsSlice";
import {
  adminProfileSchema,
  changePasswordSchema,
  userProfileSchema,
  volunteerProfileSchema,
} from "../validation/profileSchema";
import Navbar from "./Navbar";
import Footer from "./Footer";
import SkillCheckboxList from "./SkillCheckboxList";
import { storedSkillList } from "../skills";

const toastOptions = { duration: 3000 };
const DEFAULT_PROFILE_IMAGE = "http://localhost:5000/assets/default-profile.png";
const PROFILE_IMAGE_NAME = "default-profile.png";

const resolveProfileImage = (value) => {
  if (typeof value !== "string") return DEFAULT_PROFILE_IMAGE;

  const image = value.trim();
  if (!image || image === PROFILE_IMAGE_NAME) return DEFAULT_PROFILE_IMAGE;
  if (/^(https?:|blob:|data:)/i.test(image)) return image;

  const fileName = image.split(/[/\\]/).pop();
  if (!fileName || fileName === PROFILE_IMAGE_NAME) return DEFAULT_PROFILE_IMAGE;
  return `http://localhost:5000/assets/${fileName}`;
};

const useDefaultProfileImage = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = DEFAULT_PROFILE_IMAGE;
};
const MINIMUM_BIRTH_YEAR = 1900;
const PASSWORD_ERROR_CODES = [
  "INVALID_USER_ID",
  "USER_NOT_FOUND",
  "CURRENT_PASSWORD_REQUIRED",
  "NEW_PASSWORD_REQUIRED",
  "CONFIRM_PASSWORD_REQUIRED",
  "INVALID_CURRENT_PASSWORD",
  "INVALID_NEW_PASSWORD",
  "PASSWORD_MISMATCH",
  "PASSWORD_UNCHANGED",
  "SERVER_ERROR",
];
const PROFILE_ERROR_CODES = [
  "INVALID_USER_ID",
  "USER_NOT_FOUND",
  "INVALID_FULL_NAME",
  "INVALID_PHONE",
  "INVALID_SKILLS",
  "INVALID_DATE_OF_BIRTH",
  "DATE_OF_BIRTH_UNDERAGE",
  "SERVER_ERROR",
];

const getLatestSelectableBirthDate = (today) => {
  const year = today.getFullYear() - 18;
  const month = today.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  return new Date(year, month, Math.min(today.getDate(), lastDayOfMonth));
};

const createLocalMonth = (year, month) => {
  const date = new Date(0);
  date.setFullYear(year, month, 1);
  return date;
};

const getDateOnlyValue = (date) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

const toDateInputValue = (value) => {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const getProfileDefaults = (currentUser) => ({
  fullName: currentUser?.fullName || "",
  phone: currentUser?.phone || "",
  skills: storedSkillList(currentUser?.skills),
  dateOfBirth: toDateInputValue(currentUser?.dateOfBirth),
});

const toDateOnlyString = (value) => {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
};

const REQUEST_NOTIFICATION_TYPES = new Set([
  "help_request_created",
  "new_help_request",
  "help_request_accepted",
  "help_request_started",
  "help_request_assigned",
  "help_request_completed",
  "feedback_submitted",
  "admin_help_request_created",
  "help_request_start_reminder",
  "help_request_assignment_expired",
  "help_request_reopened",
  "help_request_unmatched",
  "help_request_cancelled",
]);
const CLOSED_REQUEST_STATUSES = new Set(["cancelled", "completed", "rejected"]);
const HISTORY_NOTIFICATION_TYPES = new Set([
  "help_request_assignment_expired",
  "help_request_cancelled",
  "help_request_completed",
]);

const notificationDestination = (notification, role) => {
  const type = notification?.type;
  if (!type) return null;
  if (role === "admin" && type.startsWith("volunteer_application")) {
    return "/admin?section=applications";
  }
  if (role === "admin" && type === "feedback_submitted") {
    return "/admin?section=feedback";
  }

  const requestId = typeof notification.relatedRequestId === "string"
    ? notification.relatedRequestId.trim()
    : "";
  if (!requestId || !REQUEST_NOTIFICATION_TYPES.has(type)) return null;

  const status = typeof notification.requestStatus === "string" ? notification.requestStatus : "";
  if (role === "admin") return "/admin?section=requests";
  if (role === "volunteer") {
    if (type === "new_help_request") {
      if (!status || status === "pending") {
        return "/volunteer?section=requests&filter=available";
      }
      return "/volunteer?section=requests&filter=all";
    }
    const closed = HISTORY_NOTIFICATION_TYPES.has(type) || CLOSED_REQUEST_STATUSES.has(status);
    if (closed) return "/volunteer?section=requests&filter=all";
    if (
      status === "accepted"
      || status === "in-progress"
      || type === "help_request_assigned"
      || type === "help_request_started"
      || type === "help_request_start_reminder"
    ) {
      return "/volunteer?section=requests&filter=assigned";
    }
    if (status === "pending") {
      return "/volunteer?section=requests&filter=available";
    }
    return "/volunteer?section=requests&filter=all";
  }
  return "/user?section=requests#my-help-requests";
};

const unreadStorageKey = (userId) => `helpnearby-notification-unread:${userId}`;
const readStorageKey = (userId) => `helpnearby-notification-read:${userId}`;

const readStoredIds = (storageKey) => {
  if (!storageKey) return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string" && id)
      : [];
  } catch {
    return [];
  }
};

const DashboardLayout = ({ children }) => {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);
  const mode = useSelector((state) => state.theme.mode);
  const isRtl = i18n.language?.startsWith("ar");
  const role = user?.role || "user";
  const isVolunteer = role === "volunteer";
  const isAdmin = role === "admin";
  const homePath =
    role === "admin" ? "/admin" : role === "volunteer" ? "/volunteer" : "/user";
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const isProfileRoute = normalizedPath.endsWith("/profile");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [closedProfilePath, setClosedProfilePath] = useState("");
  const profileOpen =
    sessionOpen || (isProfileRoute && closedProfilePath !== normalizedPath);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [imageDeleted, setImageDeleted] = useState(false);
  const [imageSnapshot, setImageSnapshot] = useState({
    imagePreview: "",
    imageDeleted: false,
  });
  const [snapshotOpen, setSnapshotOpen] = useState(profileOpen);

  if (profileOpen !== snapshotOpen) {
    setSnapshotOpen(profileOpen);

    if (profileOpen) {
      setImageSnapshot({ imagePreview, imageDeleted });
    }
  }

  if (!isProfileRoute && closedProfilePath) {
    setClosedProfilePath("");
  }
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [unreadIds, setUnreadIds] = useState([]);
  const readIdsRef = useRef(new Set(readStoredIds(user?.id ? readStorageKey(user.id) : "")));
  const notificationsOpenRef = useRef(false);
  const seenNotificationIds = useRef(new Set());
  const notificationSeq = useRef(0);
  const notificationPressTimer = useRef(null);
  const [pressedNotificationId, setPressedNotificationId] = useState(null);
  const signedInUserId = user?.id || "";
  const storedNotifications = useSelector(selectNotificationItems);
  const notificationOwnerId = useSelector(selectNotificationOwnerId);
  const notificationStatus = useSelector(selectNotificationStatus);
  const notificationError = useSelector((state) => state.notifications?.error ?? null);
  const notifications = notificationOwnerId === signedInUserId
    ? storedNotifications
    : [];
  const [trackedUserId, setTrackedUserId] = useState(signedInUserId);
  if (signedInUserId !== trackedUserId) {
    setTrackedUserId(signedInUserId);
    setDeleteAllOpen(false);
    readIdsRef.current = new Set(readStoredIds(signedInUserId ? readStorageKey(signedInUserId) : ""));
    setUnreadIds([]);
  }
  const section = new URLSearchParams(location.search).get("section") || "home";
  const sectionTitleKeys = {
    home: "dashboard.title",
    categories: "dashboard.nav.categories",
    services: "dashboard.nav.services",
    applications: "dashboard.nav.applications",
    volunteers: "dashboard.nav.volunteers",
    users: "dashboard.nav.users",
    feedback: "dashboard.nav.feedback",
    activity: "dashboard.nav.activity",
    requests: "dashboard.nav.helpRequests",
    location: "dashboard.nav.myLocation",
  };
  const navbarTitle = profileOpen
    ? t("dashboard.profile")
    : t(sectionTitleKeys[section] || "dashboard.title");
  const [passwordSectionOpen, setPasswordSectionOpen] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [openPicker, setOpenPicker] = useState(null);
  const [invalidDateAttempt, setInvalidDateAttempt] = useState(false);
  const [calendarView, setCalendarView] = useState("day");
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const latestSelectableBirthDate = getLatestSelectableBirthDate(currentDate);
  const earliestSelectableMonth = createLocalMonth(MINIMUM_BIRTH_YEAR, 0);
  const latestNavigationMonth = createLocalMonth(currentYear, 11);
  const minimumBirthDateValue = getDateOnlyValue(earliestSelectableMonth);
  const maximumBirthDateValue = getDateOnlyValue(latestSelectableBirthDate);
  const [calendarMonth, setCalendarMonth] = useState(latestNavigationMonth);
  const fileInputRef = useRef(null);
  const datePickerRef = useRef(null);
  const selectedYearRef = useRef(null);
  const imageSnapshotRef = useRef(imageSnapshot);
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  useLayoutEffect(() => {
    dispatch(resetNotificationsOwner(signedInUserId));
  }, [dispatch, signedInUserId]);

  useEffect(() => {
    notificationsOpenRef.current = notificationsOpen;
  }, [notificationsOpen]);

  useEffect(() => {
    if (!signedInUserId) return;
    sessionStorage.setItem(unreadStorageKey(signedInUserId), JSON.stringify(unreadIds));
  }, [signedInUserId, unreadIds]);

  useEffect(() => {
    if (!signedInUserId || notificationOwnerId !== signedInUserId) return;
    const next = notifications
      .map((item) => item.id)
      .filter((id) => typeof id === "string" && id && !readIdsRef.current.has(id));
    setUnreadIds((current) => (
      current.length === next.length && current.every((id, index) => id === next[index])
        ? current
        : next
    ));
  }, [notifications, notificationOwnerId, signedInUserId]);

  const markNotificationsRead = (ids) => {
    const readable = ids.filter((id) => typeof id === "string" && id);
    if (!signedInUserId || readable.length === 0) return;
    const next = new Set(readIdsRef.current);
    readable.forEach((id) => next.add(id));
    readIdsRef.current = next;
    sessionStorage.setItem(readStorageKey(signedInUserId), JSON.stringify([...next]));
    setUnreadIds((current) => current.filter((id) => !next.has(id)));
  };

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    seenNotificationIds.current = new Set();

    const loadNotifications = () => {
      notificationSeq.current += 1;
      const requestId = notificationSeq.current;
      dispatch(fetchNotifications({ userId: user.id, requestId })).then((result) => {
        if (!active || notificationSeq.current !== requestId) return;
        if (!fetchNotifications.fulfilled.match(result)) return;
        seenNotificationIds.current = new Set((result.payload || []).map((item) => item.id));
      });
    };

    loadNotifications();
    window.addEventListener("helpnearby-notifications", loadNotifications);

    return () => {
      active = false;
      dispatch(expireNotificationRequest());
      window.removeEventListener("helpnearby-notifications", loadNotifications);
    };
  }, [dispatch, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const socket = io("http://localhost:5000", {
      auth: { userId: user.id },
    });

    const onNotification = (notification) => {
      if (!notification?.id || seenNotificationIds.current.has(notification.id)) return;
      seenNotificationIds.current.add(notification.id);
      if (notificationsOpenRef.current) {
        const next = new Set(readIdsRef.current);
        next.add(notification.id);
        readIdsRef.current = next;
        sessionStorage.setItem(readStorageKey(user.id), JSON.stringify([...next]));
      }
      dispatch(notificationReceived({
        notification,
        userId: user.id,
      }));
      window.dispatchEvent(new Event("helpnearby-requests-refresh"));
    };

    const onAccountBlocked = () => {
      socket.io.reconnection(false);
      window.dispatchEvent(new CustomEvent("helpnearby-account-blocked"));
    };

    const onRequestUpdated = () => {
      window.dispatchEvent(new Event("helpnearby-requests-refresh"));
    };

    socket.on("account_blocked", onAccountBlocked);
    socket.on("new_notification", onNotification);
    socket.on("help_request_updated", onRequestUpdated);

    return () => {
      socket.off("account_blocked", onAccountBlocked);
      socket.off("new_notification", onNotification);
      socket.off("help_request_updated", onRequestUpdated);
      socket.disconnect();
    };
  }, [dispatch, user?.id]);

  const removeNotification = async (notification) => {
    if (!user?.id) return;

    const result = await dispatch(deleteNotificationRequest({
      id: notification.id,
      userId: user.id,
    }));

    if (deleteNotificationRequest.fulfilled.match(result)) {
      seenNotificationIds.current.delete(notification.id);
      setUnreadIds((current) => current.filter((id) => id !== notification.id));
      toast.success(t("notifications.deleted"), toastOptions);
      return;
    }

    const code = result.payload?.errorCode || "SERVER_ERROR";
    const key = `notifications.errors.${code}`;
    toast.error(
      t(key) === key ? t("notifications.deleteFailed") : t(key),
      toastOptions,
    );
  };

  const openNotification = (notification) => {
    const destination = notificationDestination(notification, role);
    setPressedNotificationId(notification.id);
    clearTimeout(notificationPressTimer.current);
    notificationPressTimer.current = setTimeout(() => {
      setPressedNotificationId((current) => (current === notification.id ? null : current));
    }, 450);
    if (!destination) return;
    setNotificationsOpen(false);
    markNotificationsRead([notification.id]);
    navigate(destination);
  };

  const notificationCopy = (notification) => {
    const type = notification?.type;
    const status = typeof notification?.requestStatus === "string" ? notification.requestStatus : "";
    if (type === "new_help_request" && status && status !== "pending") {
      return t("notifications.items.new_help_request.closed");
    }
    if (type === "help_request_start_reminder" && status && status !== "accepted") {
      return t("notifications.items.help_request_start_reminder.closed");
    }
    if (
      (type === "help_request_unmatched" || type === "help_request_cancelled") &&
      Number.isInteger(notification.requestNumber)
    ) {
      return (
        <>
          {t(`notifications.items.${type}.messageLead`)}
          <span dir="ltr">{notification.requestNumber}</span>
          {t(`notifications.items.${type}.messageTail`)}
        </>
      );
    }
    return t(`notifications.items.${type}.message`);
  };

  const removeAllNotifications = async () => {
    if (!user?.id || deleteAllBusy) return;

    setDeleteAllBusy(true);
    try {
      const result = await dispatch(deleteAllNotificationsRequest({
        userId: user.id,
      }));

      if (!deleteAllNotificationsRequest.fulfilled.match(result)) {
        const code = result.payload?.errorCode || "SERVER_ERROR";
        const key = `notifications.errors.${code}`;
        toast.error(
          t(key) === key ? t("notifications.deleteAllFailed") : t(key),
          toastOptions,
        );
        return;
      }

      seenNotificationIds.current = new Set();
      setUnreadIds([]);
      setDeleteAllOpen(false);
      toast.success(t("notifications.deletedAll"), toastOptions);
    } finally {
      setDeleteAllBusy(false);
    }
  };

  const openSection = (nextSection) => {
    setMobileOpen(false);
    setNotificationsOpen(false);
    navigate(nextSection === "home" ? homePath : `${homePath}?section=${nextSection}`);
  };

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(
      isVolunteer
        ? volunteerProfileSchema
        : isAdmin
          ? adminProfileSchema
          : userProfileSchema,
    ),
    mode: "onChange",
    defaultValues: getProfileDefaults(user),
  });

  const {
    control: passwordControl,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm({
    resolver: yupResolver(changePasswordSchema),
    mode: "onChange",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const isBirthDateDisabled = (date) => {
    const dateValue = getDateOnlyValue(date);
    return (
      dateValue < minimumBirthDateValue ||
      dateValue > getDateOnlyValue(currentDate)
    );
  };

  useEffect(() => {
    imageSnapshotRef.current = imageSnapshot;
  }, [imageSnapshot]);

  useEffect(() => {
    const previewUrl = imagePreview;

    return () => {
      if (previewUrl && previewUrl !== imageSnapshotRef.current.imagePreview) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    if (!openPicker) return undefined;

    const handlePointerDown = (event) => {
      if (!datePickerRef.current?.contains(event.target)) {
        setOpenPicker(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpenPicker(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPicker]);

  useEffect(() => {
    if (calendarView === "year") {
      selectedYearRef.current?.scrollIntoView({ block: "center" });
    }
  }, [calendarView, calendarMonth]);

  const profileImage = imageDeleted
    ? DEFAULT_PROFILE_IMAGE
    : resolveProfileImage(imagePreview || user?.profileImage);

  const confirmLogout = () => {
    dispatch(logout());
    setMobileOpen(false);
    setLogoutModalOpen(false);
    navigate("/login");
  };

  const resetPasswordSection = () => {
    setPasswordSectionOpen(false);
    setVisiblePasswords({});
    resetPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const openProfile = () => {
    reset(getProfileDefaults(user));
    setInvalidDateAttempt(false);
    setOpenPicker(null);
    setClosedProfilePath("");
    resetPasswordSection();
    setSessionOpen(true);
    setMobileOpen(false);
  };

  const closeProfile = (revertImage) => {
    resetPasswordSection();

    if (revertImage) {
      setImagePreview(imageSnapshot.imagePreview);
      setImageDeleted(imageSnapshot.imageDeleted);
      reset(getProfileDefaults(user));
    }

    setOpenPicker(null);
    setInvalidDateAttempt(false);
    setSessionOpen(false);

    if (isProfileRoute) {
      setClosedProfilePath(normalizedPath);
      navigate(homePath, { replace: true });
    }
  };

  const formatDateValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateValue = (value) => {
    if (!value || typeof value !== "string") return null;
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const openDatePicker = (value) => {
    if (openPicker === "date") {
      setOpenPicker(null);
      return;
    }

    const selectedDate = parseDateValue(value);
    const month = selectedDate || latestSelectableBirthDate;
    setCalendarMonth(createLocalMonth(month.getFullYear(), month.getMonth()));
    setCalendarView("day");
    setOpenPicker("date");
  };

  const changeCalendarMonth = (monthOffset) => {
    setCalendarMonth((current) => {
      const nextMonth = createLocalMonth(
        current.getFullYear(),
        current.getMonth() + monthOffset,
      );

      if (nextMonth < earliestSelectableMonth) return earliestSelectableMonth;
      if (nextMonth > latestNavigationMonth) return latestNavigationMonth;
      return nextMonth;
    });
  };

  const changeCalendarYear = (year) => {
    const boundedYear = Math.max(
      MINIMUM_BIRTH_YEAR,
      Math.min(year, currentYear),
    );
    const month = calendarMonth.getMonth();
    setCalendarMonth(createLocalMonth(boundedYear, month));
    setCalendarView("day");
  };

  const changeCalendarMonthName = (month) => {
    setCalendarMonth(createLocalMonth(calendarMonth.getFullYear(), month));
    setCalendarView("day");
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("dashboard.invalidImage"), toastOptions);
      event.target.value = "";
      return;
    }
    setImageDeleted(false);
    setImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = async (data) => {
    if (isVolunteer && invalidDateAttempt) {
      setError("dateOfBirth", {
        type: "manual",
        message: "validation.dateOfBirth.ageSelection",
      });
      return;
    }

    if (!user?.id) {
      toast.error(t("dashboard.errors.SERVER_ERROR"), toastOptions);
      return;
    }

    const payload = {
      id: user.id,
      fullName: data.fullName,
    };

    if (!isAdmin) {
      payload.phone = data.phone;
    }

    if (isVolunteer) {
      payload.skills = data.skills;
      payload.dateOfBirth = toDateOnlyString(data.dateOfBirth);
    }

    const result = await dispatch(updateProfile(payload));

    if (updateProfile.fulfilled.match(result)) {
      toast.success(
        t(
          `dashboard.success.${result.payload?.messageCode || "PROFILE_UPDATED"}`,
        ),
        toastOptions,
      );
      closeProfile(false);
      return;
    }

    const errorCode = PROFILE_ERROR_CODES.includes(result.payload?.errorCode)
      ? result.payload.errorCode
      : "SERVER_ERROR";

    toast.error(t(`dashboard.errors.${errorCode}`), toastOptions);
  };

  const onPasswordSubmit = async (data) => {
    if (!user?.id) {
      toast.error(t("dashboard.errors.SERVER_ERROR"), toastOptions);
      return;
    }

    const result = await dispatch(
      changePassword({
        id: user.id,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      }),
    );

    if (changePassword.fulfilled.match(result)) {
      toast.success(
        t(
          `dashboard.success.${result.payload?.messageCode || "PASSWORD_CHANGED"}`,
        ),
        toastOptions,
      );
      resetPasswordSection();
      return;
    }

    const errorCode = PASSWORD_ERROR_CODES.includes(result.payload?.errorCode)
      ? result.payload.errorCode
      : "SERVER_ERROR";

    toast.error(t(`dashboard.errors.${errorCode}`), toastOptions);
  };

  const requestCloseProfile = () => {
    if (isSubmitting || isPasswordSubmitting) return;
    closeProfile(true);
  };

  const notificationErrorCode = notificationError?.errorCode || "SERVER_ERROR";
  const notificationErrorKey = `notifications.errors.${notificationErrorCode}`;
  const notificationErrorText = t(notificationErrorKey);
  const notificationFailureText =
    notificationErrorText === notificationErrorKey
      ? t("notifications.errors.SERVER_ERROR")
      : notificationErrorText;

  return (
    <div
      className={`dashboard-shell${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
    >
      {mobileOpen && (
        <button
          type="button"
          className="dashboard-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-top">
          <button
            type="button"
            className="dashboard-icon-button dashboard-sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            title={t(
              collapsed ? "dashboard.expandSidebar" : "dashboard.collapseSidebar",
            )}
          >
            {collapsed ? (
              <FaBars />
            ) : isRtl ? (
              <FaChevronRight />
            ) : (
              <FaChevronLeft />
            )}
          </button>
          <button
            type="button"
            className="dashboard-icon-button dashboard-mobile-close"
            onClick={() => setMobileOpen(false)}
            title={t("dashboard.closeSidebar")}
          >
            <FaTimes />
          </button>
        </div>

        <div className="dashboard-user-summary">
          <img
            key={profileImage}
            src={profileImage}
            alt=""
            className="dashboard-avatar"
            onError={useDefaultProfileImage}
          />
          <div className="dashboard-user-copy">
            <strong>{user?.fullName || ""}</strong>
            <span>{t(`dashboard.roles.${role}`)}</span>
          </div>
        </div>

        <div className="dashboard-divider" />
        <nav className="dashboard-sidebar-main">
          {[
            { id: "home", label: t("dashboard.nav.home"), icon: <FaHome /> },
            ...(role === "admin"
              ? [
                  { id: "categories", label: t("dashboard.nav.categories"), icon: <FaTags /> },
                  { id: "services", label: t("dashboard.nav.services"), icon: <FaConciergeBell /> },
                  { id: "requests", label: t("dashboard.nav.helpRequests"), icon: <FaHandHoldingHeart /> },
                  { id: "applications", label: t("dashboard.nav.applications"), icon: <FaClipboardList /> },
                  { id: "volunteers", label: t("dashboard.nav.volunteers"), icon: <FaUserFriends /> },
                  { id: "users", label: t("dashboard.nav.users"), icon: <FaUsers /> },
                  { id: "feedback", label: t("dashboard.nav.feedback"), icon: <FaStar /> },
                  { id: "activity", label: t("dashboard.nav.activity"), icon: <FaListAlt /> },
                ]
              : [
                  { id: "requests", label: t("dashboard.nav.helpRequests"), icon: <FaHandHoldingHeart /> },
                  ...(role === "volunteer"
                    ? [{ id: "location", label: t("dashboard.nav.myLocation"), icon: <FaMapMarkerAlt /> }]
                    : []),
                  { id: "activity", label: t("dashboard.nav.activity"), icon: <FaListAlt /> },
                ]),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dashboard-nav-item${
                !profileOpen && section === item.id ? " is-active" : ""
              }`}
              onClick={() => openSection(item.id)}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          {user?.id && role === "user" && (
            <button
              type="button"
              className="dashboard-nav-item"
              onClick={() => {
                setMobileOpen(false);
                setNotificationsOpen(false);
                window.dispatchEvent(new Event("helpnearby-guide"));
              }}
              title={t("dashboard.nav.guide")}
            >
              <FaBook />
              <span>{t("dashboard.nav.guide")}</span>
            </button>
          )}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <button
            type="button"
            className={`dashboard-nav-item dashboard-profile-link${profileOpen ? " is-active" : ""}`}
            onClick={openProfile}
            title={t("dashboard.profile")}
          >
            <FaUser />
            <span>{t("dashboard.profile")}</span>
          </button>
          <button
            type="button"
            className="dashboard-nav-item dashboard-logout"
            onClick={() => setLogoutModalOpen(true)}
            title={t("dashboard.logout")}
          >
            <FaSignOutAlt />
            <span>{t("dashboard.logout")}</span>
          </button>
        </div>
      </aside>

      <div className="dashboard-area">
        <Navbar dashboardTitle={navbarTitle}>
          {user?.id && (
            <button
              type="button"
              className={`theme-button notification-bell ${mode === "light" ? "light-button" : "dark-button"}`}
              title={t("notifications.title")}
              aria-label={
                unreadIds.length > 0
                  ? t("notifications.unreadLabel")
                  : t("notifications.title")
              }
              onClick={() => {
                setNotificationsOpen((open) => !open);
                if (!notificationsOpen) {
                  markNotificationsRead(notifications.map((item) => item.id));
                }
              }}
            >
              <FaBell />
              {unreadIds.length > 0 && (
                <span className="notification-bell-dot" aria-hidden="true" />
              )}
            </button>
          )}
        </Navbar>
        {notificationsOpen && (
          <div className="notification-panel">
            <div className="notification-panel-header">
              <strong>{t("notifications.title")}</strong>
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="notification-delete-all"
                  onClick={() => setDeleteAllOpen(true)}
                >
                  <FaTrash aria-hidden="true" />
                  <span>{t("notifications.deleteAll")}</span>
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="notification-empty">
                {notificationStatus === "error"
                  ? notificationFailureText
                  : t("notifications.empty")}
              </p>
            ) : (
              <ul className="notification-list">
                {notifications.map((notification) => {
                  const destination = notificationDestination(notification, role);
                  return (
                    <li
                      key={notification.id}
                      className={`notification-item${
                        pressedNotificationId === notification.id ? " is-pressed" : ""
                      }${destination ? " is-actionable" : ""}`}
                    >
                      <button
                        type="button"
                        className="notification-open"
                        onClick={() => openNotification(notification)}
                      >
                        <span className="notification-copy">
                          <strong>{t(`notifications.items.${notification.type}.title`)}</strong>
                          <p>{notificationCopy(notification)}</p>
                          <time dateTime={notification.createdAt} dir="ltr">
                            {formatNotificationDateTime(notification.createdAt, i18n.language)}
                          </time>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="notification-delete"
                        title={t("notifications.delete")}
                        aria-label={t("notifications.delete")}
                        data-tooltip={t("notifications.delete")}
                        onClick={() => removeNotification(notification)}
                      >
                        <FaTrash aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <main className="dashboard-main">
          <button
            type="button"
            className="dashboard-icon-button dashboard-mobile-drawer-trigger"
            onClick={() => setMobileOpen(true)}
            title={t("dashboard.openSidebar")}
          >
            <FaBars />
          </button>
          {children}
        </main>
        <Footer />
      </div>

      <Modal
        isOpen={profileOpen}
        toggle={requestCloseProfile}
        centered
        className="dashboard-modal-dialog dashboard-profile-modal-dialog"
        contentClassName="dashboard-modal-content dashboard-profile-modal-content"
      >
        {passwordSectionOpen ? (
          <Form
            className="dashboard-profile-form"
            onSubmit={handlePasswordSubmit(onPasswordSubmit)}
            noValidate
          >
            <ModalHeader toggle={requestCloseProfile} closeAriaLabel={t("common.close")}>
              {t("dashboard.changePassword")}
            </ModalHeader>
            <ModalBody>
              {[
                ["currentPassword", "dashboard.currentPassword", "login.passwordPlaceholder"],
                ["newPassword", "dashboard.newPassword", "resetPassword.newPasswordPlaceholder"],
                ["confirmPassword", "dashboard.confirmPassword", "resetPassword.confirmPasswordPlaceholder"],
              ].map(([name, labelKey, placeholderKey]) => (
                <FormGroup key={name}>
                  <Label for={`change-${name}`}>{t(labelKey)}</Label>
                  <Controller
                    name={name}
                    control={passwordControl}
                    render={({ field }) => (
                      <div className="auth-password-input">
                        <Input
                          {...field}
                          id={`change-${name}`}
                          type={visiblePasswords[name] ? "text" : "password"}
                          placeholder={t(placeholderKey)}
                          invalid={!!passwordErrors[name]}
                          autoComplete={
                            name === "currentPassword"
                              ? "current-password"
                              : "new-password"
                          }
                        />
                        <button
                          type="button"
                          className="auth-password-toggle"
                          onClick={() =>
                            setVisiblePasswords((current) => ({
                              ...current,
                              [name]: !current[name],
                            }))
                          }
                          title={t(
                            visiblePasswords[name]
                              ? "dashboard.hidePassword"
                              : "dashboard.showPassword",
                          )}
                        >
                          {visiblePasswords[name] ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      </div>
                    )}
                  />
                  {passwordErrors[name] && (
                    <div className="form-error">
                      {t(passwordErrors[name].message)}
                    </div>
                  )}
                </FormGroup>
              ))}
            </ModalBody>
            <ModalFooter className="dashboard-modal-actions">
              <Button
                className="dashboard-action-button dashboard-save-button"
                type="submit"
                disabled={isPasswordSubmitting}
              >
                {t("dashboard.changePassword")}
              </Button>
              <Button
                className="dashboard-action-button dashboard-neutral-button"
                type="button"
                onClick={resetPasswordSection}
                disabled={isPasswordSubmitting}
              >
                {t("dashboard.cancel")}
              </Button>
            </ModalFooter>
          </Form>
        ) : (
        <Form
          className="dashboard-profile-form dashboard-profile-modal-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <ModalHeader toggle={requestCloseProfile} closeAriaLabel={t("common.close")}>
            {t("dashboard.profile")}
          </ModalHeader>
          <ModalBody>
            <div className="dashboard-profile-image-area">
              <div className="dashboard-profile-image-wrap">
                <img
                  key={profileImage}
                  src={profileImage}
                  alt=""
                  className="dashboard-profile-image"
                  onError={useDefaultProfileImage}
                />
                <button
                  type="button"
                  className="dashboard-image-action"
                  onClick={() => fileInputRef.current?.click()}
                  title={t("dashboard.changeImage")}
                >
                  <FaPlus />
                </button>
                <button
                  type="button"
                  className="dashboard-image-action dashboard-image-delete"
                  onClick={() => {
                    setImagePreview("");
                    setImageDeleted(true);
                  }}
                  title={t("dashboard.deleteImage")}
                >
                  <FaTrash />
                </button>
              </div>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              <span className="dashboard-image-caption">
                {t("dashboard.changeImage")}
              </span>
            </div>

            <FormGroup>
              <Label for="profileFullName">{t("registerUser.fullName")}</Label>
              <Controller
                name="fullName"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="profileFullName"
                    type="text"
                    placeholder={t("registerUser.fullNamePlaceholder")}
                    invalid={!!errors.fullName}
                  />
                )}
              />
              {errors.fullName && (
                <div className="form-error">{t(errors.fullName.message)}</div>
              )}
            </FormGroup>

            <FormGroup>
              <Label for="profileEmail">{t("dashboard.email")}</Label>
              <Input
                id="profileEmail"
                type="email"
                value={user?.email || ""}
                readOnly
              />
            </FormGroup>

            {role !== "admin" && (
            <FormGroup>
              <Label for="profilePhone">{t("registerVolunteer.phone")}</Label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="profilePhone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder={t("registerVolunteer.phonePlaceholder")}
                    invalid={!!errors.phone}
                    onChange={(event) => field.onChange(digitsOnly(event.target.value, 8))}
                  />
                )}
              />
              {errors.phone && (
                <div className="form-error">{t(errors.phone.message)}</div>
              )}
            </FormGroup>
            )}

            {isVolunteer && (
              <>
                <FormGroup>
                  <Label id="profileSkillsLabel">
                    {t("registerVolunteer.skills")}
                  </Label>
                  <Controller
                    name="skills"
                    control={control}
                    render={({ field }) => (
                      <SkillCheckboxList
                        id="profileSkills"
                        labelId="profileSkillsLabel"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={!!errors.skills}
                      />
                    )}
                  />
                  {errors.skills && (
                    <div className="form-error">{t(errors.skills.message)}</div>
                  )}
                </FormGroup>

                <FormGroup>
                  <Label for="profileDateOfBirth">
                    {t("registerVolunteer.dateOfBirth")}
                  </Label>
                  <Controller
                    name="dateOfBirth"
                    control={control}
                    render={({ field }) => {
                      const dateText =
                        typeof field.value === "string"
                          ? field.value.slice(0, 10)
                          : "";
                      const selectedDate = parseDateValue(dateText);

                      return (
                        <div
                          className={`register-picker${openPicker === "date" ? " is-open" : ""}`}
                          ref={datePickerRef}
                        >
                          <button
                            id="profileDateOfBirth"
                            ref={field.ref}
                            type="button"
                            className={`form-control register-picker-trigger${errors.dateOfBirth ? " is-invalid" : ""}`}
                            onBlur={field.onBlur}
                            onClick={() => openDatePicker(dateText)}
                          >
                            <span
                              className={`register-date-value${dateText ? "" : " register-date-placeholder"}`}
                            >
                              {dateText
                                ? `${dateText.slice(5, 7)}/${dateText.slice(8, 10)}/${dateText.slice(0, 4)}`
                                : "mm/dd/yyyy"}
                            </span>
                            <FaCalendarAlt className="register-picker-calendar-icon" />
                          </button>

                          {openPicker === "date" && (
                            <div className="register-calendar-panel">
                              <div className="register-calendar-header">
                                <button
                                  type="button"
                                  className="register-calendar-nav"
                                  onClick={() => changeCalendarMonth(-1)}
                                  disabled={
                                    calendarMonth <= earliestSelectableMonth
                                  }
                                >
                                  <FaChevronLeft />
                                </button>
                                <div className="register-calendar-caption">
                                  <button
                                    type="button"
                                    className="register-calendar-caption-button"
                                    onClick={() => setCalendarView("month")}
                                  >
                                    {new Intl.DateTimeFormat(
                                      locale === "ar" ? "ar" : "en-US",
                                      { month: "long" },
                                    ).format(calendarMonth)}
                                  </button>
                                  <button
                                    type="button"
                                    className="register-calendar-caption-button"
                                    onClick={() => setCalendarView("year")}
                                  >
                                    {new Intl.NumberFormat(
                                      locale === "ar" ? "ar" : "en-US",
                                      { useGrouping: false },
                                    ).format(calendarMonth.getFullYear())}
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="register-calendar-nav"
                                  onClick={() => changeCalendarMonth(1)}
                                  disabled={
                                    calendarMonth >= latestNavigationMonth
                                  }
                                >
                                  <FaChevronRight />
                                </button>
                              </div>

                              {calendarView === "year" ? (
                                <div className="register-calendar-year-view">
                                  <div className="register-calendar-view-title">
                                    {locale === "ar" ? "السنة" : "Year"}
                                  </div>
                                  <div className="register-calendar-year-list">
                                    {Array.from(
                                      {
                                        length:
                                          currentYear - MINIMUM_BIRTH_YEAR + 1,
                                      },
                                      (_, index) => index + MINIMUM_BIRTH_YEAR,
                                    ).map((year) => (
                                      <button
                                        key={year}
                                        ref={
                                          year === calendarMonth.getFullYear()
                                            ? selectedYearRef
                                            : null
                                        }
                                        type="button"
                                        className={`register-calendar-year${year === calendarMonth.getFullYear() ? " is-selected" : Math.abs(year - calendarMonth.getFullYear()) === 1 ? " is-nearby" : ""}`}
                                        onClick={() => changeCalendarYear(year)}
                                      >
                                        {new Intl.NumberFormat(
                                          locale === "ar" ? "ar" : "en-US",
                                          { useGrouping: false },
                                        ).format(year)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : calendarView === "month" ? (
                                <div className="register-calendar-month-view">
                                  <div className="register-calendar-view-title">
                                    {locale === "ar" ? "الشهر" : "Month"}
                                  </div>
                                  <div className="register-calendar-month-grid">
                                    {Array.from({ length: 12 }, (_, month) => (
                                      <button
                                        key={month}
                                        type="button"
                                        className={`register-calendar-month${month === calendarMonth.getMonth() ? " is-selected" : ""}`}
                                        onClick={() =>
                                          changeCalendarMonthName(month)
                                        }
                                      >
                                        {new Intl.DateTimeFormat(
                                          locale === "ar" ? "ar" : "en-US",
                                          { month: "short" },
                                        ).format(new Date(2024, month, 1))}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <DayPicker
                                  mode="single"
                                  selected={selectedDate || undefined}
                                  month={calendarMonth}
                                  onMonthChange={setCalendarMonth}
                                  startMonth={earliestSelectableMonth}
                                  endMonth={latestNavigationMonth}
                                  disabled={isBirthDateDisabled}
                                  captionLayout="label"
                                  hideNavigation
                                  locale={locale === "ar" ? ar : enUS}
                                  dir={locale === "ar" ? "rtl" : "ltr"}
                                  className="register-day-picker"
                                  onSelect={(date) => {
                                    if (!date) return;

                                    if (
                                      getDateOnlyValue(date) >
                                      maximumBirthDateValue
                                    ) {
                                      setInvalidDateAttempt(true);
                                      setError("dateOfBirth", {
                                        type: "manual",
                                        message:
                                          "validation.dateOfBirth.ageSelection",
                                      });
                                      return;
                                    }

                                    setInvalidDateAttempt(false);
                                    clearErrors("dateOfBirth");
                                    field.onChange(formatDateValue(date));
                                    field.onBlur();
                                    setOpenPicker(null);
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {errors.dateOfBirth && (
                    <div className="form-error">
                      {t(errors.dateOfBirth.message)}
                    </div>
                  )}
                </FormGroup>
              </>
            )}
            <Button
              type="button"
              className="dashboard-action-button dashboard-password-open-button dashboard-change-password-button"
              onClick={() => {
                resetPasswordForm({
                  currentPassword: "",
                  newPassword: "",
                  confirmPassword: "",
                });
                setVisiblePasswords({});
                setOpenPicker(null);
                setPasswordSectionOpen(true);
              }}
              disabled={isSubmitting}
            >
              {t("dashboard.changePassword")}
            </Button>
          </ModalBody>
          <ModalFooter className="dashboard-modal-actions">
            <Button
              className="dashboard-action-button dashboard-save-button"
              type="submit"
              disabled={isSubmitting}
            >
              {t("dashboard.saveChanges")}
            </Button>
            <Button
              className="dashboard-action-button dashboard-neutral-button"
              type="button"
              onClick={requestCloseProfile}
              disabled={isSubmitting}
            >
              {t("dashboard.cancel")}
            </Button>
          </ModalFooter>
        </Form>
        )}
      </Modal>

      <Modal
        isOpen={logoutModalOpen}
        toggle={() => setLogoutModalOpen(false)}
        centered
        className="dashboard-modal-dialog dashboard-logout-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setLogoutModalOpen(false)} closeAriaLabel={t("common.close")}>
          {t("dashboard.logoutConfirmTitle")}
        </ModalHeader>
        <ModalBody className="dashboard-logout-body">
          <div className="dashboard-logout-icon" aria-hidden="true">
            <FaSignOutAlt />
          </div>
          <p className="dashboard-logout-message">
            {t("dashboard.logoutConfirmMessage")}
          </p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            className="dashboard-action-button dashboard-neutral-button"
            type="button"
            onClick={() => setLogoutModalOpen(false)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            className="dashboard-action-button dashboard-logout-confirm"
            type="button"
            onClick={confirmLogout}
          >
            {t("dashboard.logout")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={deleteAllOpen}
        toggle={() => {
          if (!deleteAllBusy) setDeleteAllOpen(false);
        }}
        centered
        className="dashboard-modal-dialog dashboard-logout-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader
          closeAriaLabel={t("common.close")}
          toggle={() => {
            if (!deleteAllBusy) setDeleteAllOpen(false);
          }}
        >
          {t("notifications.deleteAllTitle")}
        </ModalHeader>
        <ModalBody className="dashboard-logout-body">
          <div className="dashboard-logout-icon" aria-hidden="true">
            <FaTrash />
          </div>
          <p className="dashboard-logout-message">
            {t("notifications.deleteAllMessage")}
          </p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            className="dashboard-action-button dashboard-neutral-button"
            type="button"
            onClick={() => setDeleteAllOpen(false)}
            disabled={deleteAllBusy}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            className="dashboard-action-button dashboard-logout-confirm"
            type="button"
            onClick={removeAllNotifications}
            disabled={deleteAllBusy}
          >
            {t("notifications.deleteAll")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default DashboardLayout;

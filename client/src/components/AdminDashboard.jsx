import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { DayPicker } from "@daypicker/react";
import { ar } from "@daypicker/react/locale/ar";
import { enUS } from "@daypicker/react/locale/en-US";
import "@daypicker/react/style.css";
import { yupResolver } from "@hookform/resolvers/yup";
import { Controller, useForm } from "react-hook-form";
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
import { useDispatch, useSelector, useStore } from "react-redux";
import toast from "react-hot-toast";
import {
  FaCalendarAlt,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaEdit,
  FaEye,
  FaEyeSlash,
  FaBan,
  FaFilePdf,
  FaMapMarkerAlt,
  FaRegStar,
  FaSearch,
  FaUser,
  FaStar,
  FaTimes,
  FaTrash,
  FaUnlock,
  FaUserSlash,
} from "react-icons/fa";

import AdminCategories from "./AdminCategories";
import SkillCheckboxList from "./SkillCheckboxList";
import { localizedCategoryName, localizedRejectionReason, localizedRequestService } from "../bilingualText";
import { digitsOnly } from "../digits";
import { storedSkillList } from "../skills";
import serviceSchema from "../validation/serviceSchema";
import { adminProfileSchema, volunteerProfileSchema } from "../validation/profileSchema";
import ActivityFeed from "./ActivityFeed";
import BackButton from "./BackButton";
import DashboardLayout from "./DashboardLayout";
import StatusChart from "./StatusChart";
import Pagination from "./Pagination";
import { usePagination } from "./usePagination";
import {
  createService,
  deleteService,
  ensureServicesReducer,
  fetchAdminServices,
  selectAdminServiceStatus,
  selectAdminServices,
  updateService,
} from "../features/servicesSlice";

const toastOptions = { duration: 3000 };
const ADMIN_API_URL = "http://localhost:5000/api/admin";
const SUPPORTED_SECTIONS = [
  "home",
  "categories",
  "services",
  "applications",
  "volunteers",
  "users",
  "feedback",
  "activity",
  "requests",
];
const MINIMUM_BIRTH_YEAR = 1900;

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

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const toDateInputValue = (value) => {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const toDateOnlyString = (value) => {
  if (typeof value === "string") return value.slice(0, 10);

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
};

const displayBirthDate = (value) => {
  const date = toDateInputValue(value);
  if (!date) return "—";
  return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
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

const AdminDashboard = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const store = useStore();
  const user = useSelector((state) => state.auth.user);
  const services = useSelector(selectAdminServices);
  const adminServiceStatus = useSelector(selectAdminServiceStatus);
  const adminServiceError = useSelector((state) => state.services?.adminError ?? null);
  const section = new URLSearchParams(location.search).get("section") || "home";
  const adminRequestSeq = useRef(0);
  useLayoutEffect(() => {
    ensureServicesReducer(store);
  }, [store]);
  const [applications, setApplications] = useState([]);
  const [rejectedApplications, setRejectedApplications] = useState([]);
  const [applicationToReject, setApplicationToReject] = useState(null);
  const [rejectionReasonEn, setRejectionReasonEn] = useState("");
  const [rejectionReasonAr, setRejectionReasonAr] = useState("");
  const [rejectionErrors, setRejectionErrors] = useState({ en: "", ar: "" });
  const [volunteers, setVolunteers] = useState([]);
  const [users, setUsers] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [ratingSummary, setRatingSummary] = useState({
    overall: { averageRating: null, ratingCount: 0 },
    volunteers: [],
  });
  const [busyId, setBusyId] = useState(null);
  const [serviceModal, setServiceModal] = useState(null);
  const [serviceDetails, setServiceDetails] = useState(null);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryStatus, setCategoryStatus] = useState("idle");
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [volunteerModal, setVolunteerModal] = useState(null);
  const [volunteerToDeactivate, setVolunteerToDeactivate] = useState(null);
  const [details, setDetails] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [homeState, setHomeState] = useState({
    users: "loading",
    volunteers: "loading",
    applications: "loading",
  });
  const [requestCounts, setRequestCounts] = useState(null);
  const [helpRequests, setHelpRequests] = useState([]);
  const [helpRequestsState, setHelpRequestsState] = useState("idle");
  const [requestQuery, setRequestQuery] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState("all");
  const [serviceQuery, setServiceQuery] = useState("");
  const [serviceVisibility, setServiceVisibility] = useState("all");
  const [serviceCategory, setServiceCategory] = useState("all");
  const [applicationQuery, setApplicationQuery] = useState("");
  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("all");
  const [directoryStatus, setDirectoryStatus] = useState("idle");
  const [feedbackStatus, setFeedbackStatus] = useState("idle");
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [selectedHelpRequest, setSelectedHelpRequest] = useState(null);
  const [requestChartState, setRequestChartState] = useState("loading");
  const [accountAction, setAccountAction] = useState(null);

  const {
    control: serviceControl,
    handleSubmit: handleServiceSubmit,
    reset: resetServiceForm,
    formState: { errors: serviceErrors, isSubmitting: isServiceSubmitting },
  } = useForm({
    resolver: yupResolver(serviceSchema),
    mode: "onChange",
    defaultValues: { name: "", nameAr: "", description: "", descriptionAr: "", category: "" },
  });

  const {
    control: volunteerControl,
    handleSubmit: handleVolunteerSubmit,
    reset: resetVolunteerForm,
    setError: setVolunteerError,
    clearErrors: clearVolunteerErrors,
    formState: { errors: volunteerErrors, isSubmitting: isVolunteerSubmitting },
  } = useForm({
    resolver: yupResolver(volunteerProfileSchema),
    mode: "onChange",
    defaultValues: {
      fullName: "",
      phone: "",
      skills: [],
      dateOfBirth: "",
    },
  });

  const {
    control: userControl,
    handleSubmit: handleUserSubmit,
    reset: resetUserForm,
    formState: { errors: userErrors, isSubmitting: isUserSubmitting },
  } = useForm({
    resolver: yupResolver(adminProfileSchema),
    mode: "onChange",
    defaultValues: { fullName: "" },
  });
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const latestSelectableBirthDate = getLatestSelectableBirthDate(currentDate);
  const earliestSelectableMonth = createLocalMonth(MINIMUM_BIRTH_YEAR, 0);
  const latestNavigationMonth = createLocalMonth(currentYear, 11);
  const minimumBirthDateValue = getDateOnlyValue(earliestSelectableMonth);
  const maximumBirthDateValue = getDateOnlyValue(latestSelectableBirthDate);
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [openPicker, setOpenPicker] = useState(null);
  const [invalidDateAttempt, setInvalidDateAttempt] = useState(false);
  const [calendarView, setCalendarView] = useState("day");
  const [calendarMonth, setCalendarMonth] = useState(latestNavigationMonth);
  const datePickerRef = useRef(null);
  const selectedYearRef = useRef(null);

  const isBirthDateDisabled = (date) => {
    const dateValue = getDateOnlyValue(date);
    return (
      dateValue < minimumBirthDateValue ||
      dateValue > getDateOnlyValue(currentDate)
    );
  };

  const showError = useCallback(
    (errorCode) => {
      const code = errorCode || "SERVER_ERROR";
      const key = `adminDashboard.errors.${code}`;
      toast.error(
        t(key) === key ? t("adminDashboard.errors.SERVER_ERROR") : t(key),
        toastOptions,
      );
    },
    [t, toastOptions],
  );

  const loadCategoryOptions = useCallback(async () => {
    setCategoryStatus("loading");
    try {
      const response = await axios.get("http://localhost:5000/api/categories");
      setCategoryOptions(Array.isArray(response.data?.categories) ? response.data.categories : []);
      setCategoryStatus("ready");
    } catch {
      setCategoryStatus("error");
    }
  }, []);

  const loadServices = useCallback(async () => {
    const requestId = adminRequestSeq.current + 1;
    adminRequestSeq.current = requestId;
    const result = await dispatch(fetchAdminServices(requestId));
    if (adminRequestSeq.current !== requestId) return;
    if (fetchAdminServices.rejected.match(result)) {
      showError(result.payload?.errorCode);
    }
  }, [dispatch, showError]);

  const loadApplications = useCallback(async () => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/volunteers/pending`);
      setApplications(response.data?.volunteers || []);
    } catch (error) {
      showError(error.response?.data?.errorCode || "SERVER_ERROR");
    }
  }, [showError]);

  const loadVolunteers = useCallback(async () => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/volunteers`);
      setVolunteers(response.data?.volunteers || []);
    } catch (error) {
      showError(error.response?.data?.errorCode);
    }
  }, [showError]);

  useEffect(() => {
    if (!openPicker) return undefined;

    const handlePointerDown = (event) => {
      if (!datePickerRef.current?.contains(event.target)) setOpenPicker(null);
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

  useEffect(() => {
    if (SUPPORTED_SECTIONS.includes(section)) return undefined;
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
    return undefined;
  }, [location.pathname, navigate, section]);

  useEffect(() => {
    if (!["services", "requests", "volunteers", "applications"].includes(section)) return undefined;
    loadCategoryOptions();
    return undefined;
  }, [loadCategoryOptions, section]);

  useEffect(() => {
    if (!user?.id || !SUPPORTED_SECTIONS.includes(section)) return undefined;
    let active = true;
    let refreshCounts = null;

    const apply = (setter, value) => {
      if (active) setter(value);
    };

    if (section === "services") {
      const requestId = adminRequestSeq.current + 1;
      adminRequestSeq.current = requestId;
      dispatch(fetchAdminServices(requestId)).then((result) => {
        if (!active || adminRequestSeq.current !== requestId) return;
        if (fetchAdminServices.rejected.match(result)) {
          showError(result.payload?.errorCode);
        }
      });
    } else if (section === "volunteers") {
      setDirectoryStatus("loading");
      axios
        .get(`${ADMIN_API_URL}/volunteers`)
        .then((response) => {
          apply(setVolunteers, response.data?.volunteers || []);
          if (active) setDirectoryStatus("ready");
        })
        .catch((error) => {
          if (!active) return;
          setDirectoryStatus("error");
          showError(error.response?.data?.errorCode);
        });
    } else if (section === "users") {
      setDirectoryStatus("loading");
      axios
        .get(`${ADMIN_API_URL}/users`)
        .then((response) => {
          apply(setUsers, response.data?.users || []);
          if (active) setDirectoryStatus("ready");
        })
        .catch((error) => {
          if (!active) return;
          setDirectoryStatus("error");
          showError(error.response?.data?.errorCode);
        });
    } else if (section === "feedback") {
      setFeedbackStatus("loading");
      axios
        .get("http://localhost:5000/api/feedback", { params: { userId: user?.id } })
        .then((response) => {
          apply(setFeedbacks, response.data?.feedbacks || []);
          apply(setRatingSummary, response.data?.summary || {
            overall: { averageRating: null, ratingCount: 0 },
            volunteers: [],
          });
          if (active) setFeedbackStatus("ready");
        })
        .catch((error) => {
          if (!active) return;
          setFeedbackStatus("error");
          showError(error.response?.data?.errorCode);
        });
    } else if (section === "applications" || section === "home") {
      axios
        .get(`${ADMIN_API_URL}/volunteers/pending`)
        .then((response) => {
          if (!active) return;
          setApplications(response.data?.volunteers || []);
          if (section === "home") {
            setHomeState((current) => ({ ...current, applications: "ready" }));
          }
        })
        .catch((error) => {
          if (!active) return;
          showError(error.response?.data?.errorCode || "SERVER_ERROR");
          if (section === "home") {
            setHomeState((current) => ({ ...current, applications: "error" }));
          }
        });
      if (section === "applications") {
        axios
          .get(`${ADMIN_API_URL}/volunteers/rejected`)
          .then((response) => {
            if (active) setRejectedApplications(response.data?.volunteers || []);
          })
          .catch((error) => {
            if (active) showError(error.response?.data?.errorCode || "SERVER_ERROR");
          });
      }
    }

    if (section === "requests") {
      const loadHelpRequests = () => {
        axios
          .get(`${ADMIN_API_URL}/help-requests`, { params: { adminId: user.id } })
          .then((response) => {
            if (!active) return;
            setHelpRequests(response.data?.requests || []);
            setHelpRequestsState("ready");
          })
          .catch((error) => {
            if (!active) return;
            setHelpRequestsState("error");
            showError(error.response?.data?.errorCode);
          });
      };
      setHelpRequestsState((current) => (current === "ready" ? current : "loading"));
      loadHelpRequests();
      window.addEventListener("helpnearby-requests-refresh", loadHelpRequests);
      refreshCounts = loadHelpRequests;
    }

    if (section === "home") {
      axios
        .get(`${ADMIN_API_URL}/users`)
        .then((response) => {
          if (!active) return;
          setUsers(response.data?.users || []);
          setHomeState((current) => ({ ...current, users: "ready" }));
        })
        .catch((error) => {
          if (!active) return;
          showError(error.response?.data?.errorCode);
          setHomeState((current) => ({ ...current, users: "error" }));
        });

      axios
        .get(`${ADMIN_API_URL}/volunteers`)
        .then((response) => {
          if (!active) return;
          setVolunteers(response.data?.volunteers || []);
          setHomeState((current) => ({ ...current, volunteers: "ready" }));
        })
        .catch((error) => {
          if (!active) return;
          showError(error.response?.data?.errorCode);
          setHomeState((current) => ({ ...current, volunteers: "error" }));
        });

      const loadRequestCounts = () => {
        axios
          .get(`${ADMIN_API_URL}/help-requests/status-counts`, {
            params: { adminId: user.id },
          })
          .then((response) => {
            if (!active) return;
            const counts = response.data?.counts;
            if (!counts || typeof counts !== "object") {
              setRequestCounts(null);
              setRequestChartState("error");
              return;
            }
            setRequestCounts(counts);
            setRequestChartState("ready");
          })
          .catch(() => {
            if (!active) return;
            setRequestCounts(null);
            setRequestChartState("error");
          });
      };
      loadRequestCounts();
      window.addEventListener("helpnearby-requests-refresh", loadRequestCounts);
      refreshCounts = loadRequestCounts;
    }

    return () => {
      active = false;
      if (refreshCounts) {
        window.removeEventListener("helpnearby-requests-refresh", refreshCounts);
      }
    };
  }, [dispatch, section, showError, user?.id]);

  const accountStatusOf = (account) =>
    account?.accountStatus === "blocked" ? "blocked" : "active";

  const applyAccountStatus = (id, accountStatus) => {
    const update = (account) =>
      account.id === id ? { ...account, accountStatus } : account;
    setUsers((current) => current.map(update));
    setVolunteers((current) => current.map(update));
    setDetails((current) =>
      current?.record?.id === id
        ? { ...current, record: { ...current.record, accountStatus } }
        : current,
    );
  };

  const confirmAccountStatus = async () => {
    if (!accountAction || !user?.id) return;
    const actionId = `account-${accountAction.id}`;
    setBusyId(actionId);

    try {
      const response = await axios.put(
        `${ADMIN_API_URL}/users/${accountAction.id}/account-status`,
        {
          adminId: user.id,
          accountStatus: accountAction.nextStatus,
        },
      );
      const accountStatus = response.data?.user?.accountStatus || accountAction.nextStatus;
      applyAccountStatus(accountAction.id, accountStatus);
      toast.success(
        t(`adminDashboard.success.${response.data?.messageCode || "USER_UPDATED"}`),
        toastOptions,
      );
      setAccountAction(null);
    } catch (error) {
      showError(error.response?.data?.errorCode);
    } finally {
      setBusyId((current) => (current === actionId ? null : current));
    }
  };

  const openEditUser = (account) => {
    resetUserForm({
      fullName: account.fullName || "",
    });
    setUserModal(account);
  };

  const onUserSubmit = async (data) => {
    if (!userModal) return;

    try {
      await axios.put(`${ADMIN_API_URL}/users/${userModal.id}/profile`, {
        fullName: data.fullName.trim(),
      });
      toast.success(t("adminDashboard.success.USER_UPDATED"), toastOptions);
      setUserModal(null);
      const response = await axios.get(`${ADMIN_API_URL}/users`);
      setUsers(response.data?.users || []);
    } catch (error) {
      showError(error.response?.data?.errorCode);
    }
  };

  const downloadReport = async () => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/users/report/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "helpnearby-users-report.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      let errorCode = error.response?.data?.errorCode;
      if (error.response?.data instanceof Blob) {
        try {
          errorCode = JSON.parse(await error.response.data.text()).errorCode;
        } catch {
          errorCode = "SERVER_ERROR";
        }
      }
      showError(errorCode);
    }
  };

  const skillLabel = (value) => {
    const labels = storedSkillList(value).map((skill) => {
      const category = categoryOptions.find((item) => item.id === skill);
      return category ? localizedCategoryName(category, i18n.language) || skill : skill;
    });
    return labels.length ? labels.join(", ") : "—";
  };

  const requestLabel = (request) => localizedRequestService(request, i18n.language) || "—";
  const requestCategoryText = (request) => {
    const labels = (request?.serviceCategories || [])
      .map((categoryId) => categoryLabel(categoryId))
      .filter((label) => label && label !== "—");
    return labels.length ? labels.join(", ") : "—";
  };
  const categoryLabel = (categoryId) => {
    if (!categoryId) return "—";
    const category = categoryOptions.find((item) => item.id === categoryId);
    return category ? localizedCategoryName(category, i18n.language) || categoryId : categoryId;
  };

  const openCreateService = () => {
    resetServiceForm({
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      category: "",
    });
    setServiceModal({ mode: "create" });
  };

  const openEditService = (service) => {
    resetServiceForm({
      name: service.name || "",
      nameAr: service.nameAr || "",
      description: service.description || "",
      descriptionAr: service.descriptionAr || "",
      category: service.category || "",
    });
    setServiceModal({ mode: "edit", service });
  };

  const openEditVolunteer = (volunteer) => {
    resetVolunteerForm({
      fullName: volunteer.fullName || "",
      phone: volunteer.phone || "",
      skills: storedSkillList(volunteer.skills),
      dateOfBirth: toDateInputValue(volunteer.dateOfBirth),
    });
    setInvalidDateAttempt(false);
    setOpenPicker(null);
    setVolunteerModal(volunteer);
  };

  const openVolunteerDatePicker = (value) => {
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
    const boundedYear = Math.max(MINIMUM_BIRTH_YEAR, Math.min(year, currentYear));
    setCalendarMonth(createLocalMonth(boundedYear, calendarMonth.getMonth()));
    setCalendarView("day");
  };

  const changeCalendarMonthName = (month) => {
    setCalendarMonth(createLocalMonth(calendarMonth.getFullYear(), month));
    setCalendarView("day");
  };

  const onServiceSubmit = async (data) => {
    const payload = {
      name: data.name.trim(),
      description: data.description.trim(),
    };
    const nameAr = String(data.nameAr || "").trim();
    const descriptionAr = String(data.descriptionAr || "").trim();
    const savedService = serviceModal?.mode === "edit" ? serviceModal.service : null;
    if (nameAr || savedService?.nameAr) payload.nameAr = nameAr;
    if (descriptionAr || savedService?.descriptionAr) payload.descriptionAr = descriptionAr;
    if (data.category || savedService?.category) payload.category = data.category;

    try {
      const result = serviceModal?.mode === "edit"
        ? await dispatch(updateService({
          id: serviceModal.service.id,
          ...payload,
          isVisible: serviceModal.service.isVisible,
        }))
        : await dispatch(createService(payload));
      const succeeded = serviceModal?.mode === "edit"
        ? updateService.fulfilled.match(result)
        : createService.fulfilled.match(result);

      if (!succeeded) {
        showError(result.payload?.errorCode);
        return;
      }

      toast.success(
        t(serviceModal?.mode === "edit"
          ? "adminDashboard.success.SERVICE_UPDATED"
          : "adminDashboard.success.SERVICE_CREATED"),
        toastOptions,
      );
      setServiceModal(null);
      window.dispatchEvent(new Event("helpnearby-activity"));
      await loadServices();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    }
  };

  const toggleServiceVisibility = async (service) => {
    setBusyId(`service-${service.id}`);

    try {
      const result = await dispatch(updateService({
        id: service.id,
        name: service.name,
        description: service.description,
        isVisible: !service.isVisible,
      }));
      if (!updateService.fulfilled.match(result)) {
        showError(result.payload?.errorCode);
        return;
      }
      toast.success(t("adminDashboard.success.SERVICE_UPDATED"), toastOptions);
      window.dispatchEvent(new Event("helpnearby-activity"));
      await loadServices();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;
    setBusyId(`service-${serviceToDelete.id}`);

    try {
      const result = await dispatch(deleteService(serviceToDelete.id));
      if (!deleteService.fulfilled.match(result)) {
        showError(result.payload?.errorCode);
        return;
      }
      toast.success(t("adminDashboard.success.SERVICE_DELETED"), toastOptions);
      window.dispatchEvent(new Event("helpnearby-activity"));
      setServiceToDelete(null);
      await loadServices();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    } finally {
      setBusyId(null);
    }
  };

  const rejectionFieldMessage = (value, requiredKey, lengthKey) => {
    const text = value.trim();
    if (!text) return t(requiredKey);
    if (text.length > 1000) return t(lengthKey);
    return "";
  };

  const reloadApplications = async () => {
    await loadApplications();
    try {
      const response = await axios.get(`${ADMIN_API_URL}/volunteers/rejected`);
      setRejectedApplications(response.data?.volunteers || []);
    } catch (error) {
      showError(error.response?.data?.errorCode || "SERVER_ERROR");
    }
  };

  const handleDecision = async (volunteerId, decision, reasons = null) => {
    if (decision === "reject" && !reasons) {
      setApplicationToReject(applications.find((item) => item.id === volunteerId) || { id: volunteerId });
      setRejectionReasonEn("");
      setRejectionReasonAr("");
      setRejectionErrors({ en: "", ar: "" });
      return;
    }

    const actionId = `application-${volunteerId}`;
    if (busyId === actionId) return;
    setBusyId(actionId);

    try {
      const volunteerStatus = decision === "approve" ? "approved" : "rejected";
      const response = await axios.put(
        `${ADMIN_API_URL}/volunteers/${volunteerId}`,
        decision === "reject"
          ? {
            volunteerStatus,
            adminId: user?.id,
            rejectionReason: reasons.en,
            rejectionReasonEn: reasons.en,
            rejectionReasonAr: reasons.ar,
          }
          : { volunteerStatus, adminId: user?.id },
      );
      const messageCode =
        response.data?.messageCode ||
        (decision === "approve" ? "VOLUNTEER_APPROVED" : "VOLUNTEER_REJECTED");
      toast.success(t(`adminDashboard.success.${messageCode}`), toastOptions);
      window.dispatchEvent(new Event("helpnearby-activity"));
      if (decision === "reject") {
        setApplicationToReject(null);
        setRejectionReasonEn("");
        setRejectionReasonAr("");
        setRejectionErrors({ en: "", ar: "" });
      }
    } catch (error) {
      showError(error.response?.data?.errorCode || "SERVER_ERROR");
    }

    try {
      await reloadApplications();
    } finally {
      setBusyId(null);
    }
  };

  const confirmRejectApplication = () => {
    if (!applicationToReject) return;
    const nextErrors = {
      en: rejectionFieldMessage(
        rejectionReasonEn,
        "adminDashboard.rejectionReasonEnglishRequired",
        "adminDashboard.rejectionReasonEnglishLength",
      ),
      ar: rejectionFieldMessage(
        rejectionReasonAr,
        "adminDashboard.rejectionReasonArabicRequired",
        "adminDashboard.rejectionReasonArabicLength",
      ),
    };
    setRejectionErrors(nextErrors);
    if (nextErrors.en || nextErrors.ar) return;
    handleDecision(applicationToReject.id, "reject", {
      en: rejectionReasonEn.trim(),
      ar: rejectionReasonAr.trim(),
    });
  };

  const onVolunteerSubmit = async (data) => {
    if (!volunteerModal) return;

    if (invalidDateAttempt) {
      setVolunteerError("dateOfBirth", {
        type: "manual",
        message: "validation.dateOfBirth.ageSelection",
      });
      return;
    }

    try {
      await axios.put(
        `${ADMIN_API_URL}/volunteers/${volunteerModal.id}/profile`,
        {
          fullName: data.fullName.trim(),
          phone: data.phone.trim(),
          skills: data.skills,
          dateOfBirth: toDateOnlyString(data.dateOfBirth),
        },
      );
      toast.success(t("adminDashboard.success.VOLUNTEER_UPDATED"), toastOptions);
      setVolunteerModal(null);
      await loadVolunteers();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    }
  };

  const confirmDeactivateVolunteer = async () => {
    if (!volunteerToDeactivate) return;
    setBusyId(`volunteer-${volunteerToDeactivate.id}`);

    try {
      await axios.put(
        `${ADMIN_API_URL}/volunteers/${volunteerToDeactivate.id}/status`,
        { adminId: user?.id },
      );
      toast.success(
        t("adminDashboard.success.VOLUNTEER_DEACTIVATED"),
        toastOptions,
      );
      setVolunteerToDeactivate(null);
      await loadVolunteers();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value) =>
    value ? new Date(value).toLocaleString(i18n.language) : "—";

  const formatRequestNumber = (request) =>
    Number.isInteger(request?.requestNumber) ? String(request.requestNumber) : "—";

  const requestSummary = {
    total: helpRequests.length,
    pending: helpRequests.filter((request) => request.status === "pending").length,
    accepted: helpRequests.filter((request) => request.status === "accepted").length,
    inProgress: helpRequests.filter((request) => request.status === "in-progress").length,
    completed: helpRequests.filter((request) => request.status === "completed").length,
    cancelled: helpRequests.filter((request) => request.status === "cancelled").length,
    rejected: helpRequests.filter((request) => request.status === "rejected").length,
  };
  const filtersActive = requestQuery.trim() !== "" || requestStatusFilter !== "all";

  const greeting = user?.fullName
    ? t("adminDashboard.greeting", { name: user.fullName })
    : t("adminDashboard.greetingPlain");

  const servicesAwaitingFirstLoad =
    services.length === 0 &&
    (adminServiceStatus === "idle" || adminServiceStatus === "loading");
  const servicesFailedToLoad = services.length === 0 && adminServiceStatus === "error";
  const adminServiceErrorCode = adminServiceError?.errorCode || "SERVER_ERROR";
  const adminServiceErrorKey = `adminDashboard.errors.${adminServiceErrorCode}`;
  const adminServiceErrorMessage = t(adminServiceErrorKey);
  const servicesLoadError =
    adminServiceErrorMessage === adminServiceErrorKey
      ? t("adminDashboard.errors.SERVER_ERROR")
      : adminServiceErrorMessage;
  const filteredHelpRequests = useMemo(() => {
    const query = requestQuery.trim().toLowerCase().replace(/^#/, "");
    return helpRequests.filter((request) => {
      if (requestStatusFilter !== "all" && request.status !== requestStatusFilter) return false;
      if (!query) return true;
      const categoryText = (request.serviceCategories || [])
        .map((categoryId) => categoryLabel(categoryId))
        .join(" ");
      const statusLabel = t(`helpRequests.statuses.${request.status}`);
      return [
        request.requestNumber,
        request.requesterName,
        request.requesterEmail,
        request.volunteerName,
        request.description,
        request.serviceName,
        request.serviceNameAr,
        requestLabel(request),
        categoryText,
        statusLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryLabel, helpRequests, i18n.language, requestLabel, requestQuery, requestStatusFilter, t]);
  const accountDirectory = useMemo(() => {
    const query = accountQuery.trim().toLowerCase();
    const matchAccount = (account, role) => {
      if (accountStatusFilter !== "all" && accountStatusOf(account) !== accountStatusFilter) return false;
      if (!query) return true;
      const roleName = account.role || role;
      return [
        account.fullName,
        account.email,
        account.phone,
        roleName,
        t(`dashboard.roles.${roleName}`),
        t(`adminDashboard.accountStatuses.${accountStatusOf(account)}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    };
    return {
      users: users.filter((account) => matchAccount(account, "user")),
      volunteers: volunteers.filter((account) => matchAccount(account, "volunteer")),
    };
  }, [accountQuery, accountStatusFilter, t, users, volunteers]);
  const directoryFiltersActive = accountQuery.trim() !== "" || accountStatusFilter !== "all";
  const serviceFiltersActive = serviceQuery.trim() !== "" || serviceVisibility !== "all" || serviceCategory !== "all";
  const applicationFiltersActive = applicationQuery.trim() !== "";
  const feedbackFiltersActive = feedbackQuery.trim() !== "" || feedbackRating !== "all";
  const filteredServices = useMemo(() => {
    const query = serviceQuery.trim().toLowerCase();
    return services.filter((service) => {
      if (serviceVisibility === "visible" && !service.isVisible) return false;
      if (serviceVisibility === "hidden" && service.isVisible) return false;
      if (serviceCategory !== "all" && (service.category || "") !== serviceCategory) return false;
      if (!query) return true;
      return [
        service.name,
        service.nameAr,
        service.description,
        service.descriptionAr,
        categoryLabel(service.category),
      ].join(" ").toLowerCase().includes(query);
    });
  }, [categoryLabel, serviceCategory, serviceQuery, serviceVisibility, services]);
  const matchesApplication = useCallback((record) => {
    const query = applicationQuery.trim().toLowerCase();
    if (!query) return true;
    return [record?.fullName, record?.email, record?.phone, skillLabel(record?.skills)]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }, [applicationQuery, skillLabel]);
  const filteredApplications = useMemo(
    () => applications.filter(matchesApplication),
    [applications, matchesApplication],
  );
  const filteredRejectedApplications = useMemo(
    () => rejectedApplications.filter(matchesApplication),
    [matchesApplication, rejectedApplications],
  );
  const filteredFeedback = useMemo(() => {
    const query = feedbackQuery.trim().toLowerCase();
    return feedbacks.filter((item) => {
      if (feedbackRating !== "all" && String(item.rating) !== feedbackRating) return false;
      if (!query) return true;
      return [item.userName, item.volunteerName, requestLabel(item), item.comment]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [feedbackQuery, feedbackRating, feedbacks, requestLabel]);
  const tableSource =
    section === "services" && !servicesAwaitingFirstLoad && !servicesFailedToLoad
      ? filteredServices
      : section === "requests"
        ? filteredHelpRequests
      : section === "applications"
        ? filteredApplications
        : section === "volunteers"
          ? accountDirectory.volunteers
          : section === "users"
            ? accountDirectory.users
            : section === "feedback"
              ? filteredFeedback
              : [];
  const rejectedPage = usePagination(
    filteredRejectedApplications,
    `rejected-applications:${applicationQuery.trim().toLowerCase()}`,
  );
  const tablePage = usePagination(
    tableSource,
    section === "requests"
      ? `requests:${requestStatusFilter}:${requestQuery.trim().toLowerCase()}`
      : section === "users" || section === "volunteers"
        ? `${section}:${accountStatusFilter}:${accountQuery.trim().toLowerCase()}`
        : section === "services"
          ? `services:${serviceVisibility}:${serviceCategory}:${serviceQuery.trim().toLowerCase()}`
          : section === "applications"
            ? `applications:${applicationQuery.trim().toLowerCase()}`
            : section === "feedback"
              ? `feedback:${feedbackRating}:${feedbackQuery.trim().toLowerCase()}`
              : section,
  );

  const latestApplications = [...applications]
    .sort(
      (first, second) =>
        new Date(second.createdAt || 0).getTime() -
        new Date(first.createdAt || 0).getTime(),
    )
    .slice(0, 3);

  const openAdminSection = (nextSection) => {
    navigate({ pathname: "/admin", search: `section=${nextSection}` });
  };

  const renderHomeStat = (key, value, status) => (
    <article key={key} className="user-home-stat">
      {status === "ready" ? (
        <strong>{value}</strong>
      ) : (
        <p className="help-request-note">
          {t(
            status === "error"
              ? "adminDashboard.loadError"
              : "adminDashboard.loading",
          )}
        </p>
      )}
      <span>{t(`adminDashboard.stats.${key}`)}</span>
    </article>
  );

  const renderTable = (headers, rows, emptyLabel, columnCount, stickyActions = false, tableClassName = "") => (
    <>
      <div className="admin-table-wrap">
        <table className={`admin-table${stickyActions ? " admin-sticky-actions" : ""}${tableClassName ? ` ${tableClassName}` : ""}`}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <p className="admin-empty">{emptyLabel}</p>
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={tablePage.page}
        pageSize={tablePage.pageSize}
        total={tablePage.total}
        onPageChange={tablePage.setPage}
        onPageSizeChange={tablePage.setPageSize}
      />
    </>
  );

  const matchingNote = (request) => {
    if (request?.status !== "pending" || !request.matchingStatus) return null;
    return (
      <p className="help-request-note">{t(`adminDashboard.matching.${request.matchingStatus}`)}</p>
    );
  };

  const accountDirectoryTools = (
    <div className="admin-request-toolbar">
      <div className="admin-request-search">
        <FaSearch aria-hidden="true" />
        <Input
          type="search"
          className="form-control"
          value={accountQuery}
          placeholder={t("adminDashboard.accountSearch")}
          aria-label={t("adminDashboard.accountSearch")}
          onChange={(event) => setAccountQuery(event.target.value)}
        />
      </div>
      <Input
        type="select"
        className="app-select"
        value={section === "volunteers" ? "volunteer" : "user"}
        aria-label={t("adminDashboard.roleFilter")}
        onChange={(event) => openAdminSection(event.target.value === "volunteer" ? "volunteers" : "users")}
      >
        <option value="user">{t("dashboard.roles.user")}</option>
        <option value="volunteer">{t("dashboard.roles.volunteer")}</option>
      </Input>
      <Input
        type="select"
        className="app-select"
        value={accountStatusFilter}
        aria-label={t("adminDashboard.accountStatus")}
        onChange={(event) => setAccountStatusFilter(event.target.value)}
      >
        <option value="all">{t("adminDashboard.allAccountStatuses")}</option>
        <option value="active">{t("adminDashboard.accountStatuses.active")}</option>
        <option value="blocked">{t("adminDashboard.accountStatuses.blocked")}</option>
      </Input>
      {directoryFiltersActive && (
        <Button
          type="button"
          className="dashboard-action-button dashboard-neutral-button"
          onClick={() => {
            setAccountQuery("");
            setAccountStatusFilter("all");
          }}
        >
          {t("adminDashboard.clearFilters")}
        </Button>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="admin-page">
        {!user?.id ? (
          <section className="user-home">
            <div className="user-home-panel">
              <p className="help-request-note">{t("adminDashboard.sessionRequired")}</p>
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
                <p className="dashboard-welcome">{t("adminDashboard.overview")}</p>
              </div>
              <Button
                type="button"
                className="dashboard-action-button dashboard-password-open-button"
                onClick={() => openAdminSection("applications")}
              >
                {t("adminDashboard.reviewApplications")}
              </Button>
            </div>

            <div className="user-home-stats">
              {renderHomeStat("users", users.length, homeState.users)}
              {renderHomeStat("volunteers", volunteers.length, homeState.volunteers)}
              {renderHomeStat(
                "applications",
                applications.length,
                homeState.applications,
              )}
              {renderHomeStat(
                "requests",
                ["pending", "accepted", "in-progress", "completed", "cancelled", "rejected"]
                  .reduce((sum, status) => sum + (Number(requestCounts?.[status]) || 0), 0),
                requestChartState,
              )}
            </div>

            {requestChartState === "ready" && requestCounts ? (
              <StatusChart
                title={t("adminDashboard.chartTitle")}
                emptyLabel={t("adminDashboard.chartEmpty")}
                items={["pending", "accepted", "in-progress", "completed", "cancelled", "rejected"].map((status) => ({
                  key: status,
                  label: t(`helpRequests.statuses.${status}`),
                  value: Number(requestCounts[status]) || 0,
                }))}
              />
            ) : (
              <p className="help-request-note">
                {t(requestChartState === "error" ? "adminDashboard.chartError" : "adminDashboard.chartLoading")}
              </p>
            )}

            <div className="user-home-panel">
              <div className="user-home-panel-header">
                <h3>{t("adminDashboard.applications")}</h3>
                {homeState.applications === "ready" && (
                  <button
                    type="button"
                    className="user-home-text-action"
                    onClick={() => openAdminSection("applications")}
                  >
                    {t("adminDashboard.reviewApplications")}
                  </button>
                )}
              </div>
              {homeState.applications !== "ready" ? (
                <p className="help-request-note">
                  {t(
                    homeState.applications === "error"
                      ? "adminDashboard.loadError"
                      : "adminDashboard.loading",
                  )}
                </p>
              ) : (
                <>
                  <p className="help-request-note">
                    {t("adminDashboard.pendingCount", { count: applications.length })}
                  </p>
                  {latestApplications.length === 0 ? (
                    <p className="help-request-note">{t("adminDashboard.noApplications")}</p>
                  ) : (
                    <ul className="user-home-recent">
                      {latestApplications.map((application) => (
                        <li key={application.id}>
                          <div>
                            <strong className="user-home-request-name">
                              {application.fullName || "—"}
                            </strong>
                            <div className="user-home-request-date">
                              {formatDate(application.createdAt)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="user-home-panel">
              <h3>{t("adminDashboard.quickActions")}</h3>
              <div className="user-home-actions">
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-password-open-button"
                  onClick={() => openAdminSection("categories")}
                >
                  {t("adminDashboard.manageCategories")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-password-open-button"
                  onClick={() => openAdminSection("services")}
                >
                  {t("adminDashboard.manageServices")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => openAdminSection("applications")}
                >
                  {t("adminDashboard.reviewApplications")}
                </Button>
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => openAdminSection("users")}
                >
                  {t("adminDashboard.manageUsers")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {user?.id && section === "requests" && (
          <div className="admin-request-section">
            <header className="admin-request-header">
              <div>
                <h2>{t("dashboard.nav.helpRequests")}</h2>
                <p>{t("adminDashboard.helpRequestsIntro")}</p>
              </div>
            </header>
            <div className="admin-request-stats">
              {[
                ["total", requestSummary.total, "adminDashboard.statTotal"],
                ["pending", requestSummary.pending, "helpRequests.statuses.pending"],
                ["accepted", requestSummary.accepted, "helpRequests.statuses.accepted"],
                ["in-progress", requestSummary.inProgress, "helpRequests.statuses.in-progress"],
                ["completed", requestSummary.completed, "helpRequests.statuses.completed"],
                ["cancelled", requestSummary.cancelled, "helpRequests.statuses.cancelled"],
                ["rejected", requestSummary.rejected, "helpRequests.statuses.rejected"],
              ].map(([key, value, labelKey]) => (
                <article key={key} className={`admin-request-stat is-${key}`}>
                  <strong>{helpRequestsState === "ready" ? value : "—"}</strong>
                  <span>{t(labelKey)}</span>
                </article>
              ))}
            </div>
            <div className="admin-request-toolbar">
              <div className="admin-request-search">
                <FaSearch aria-hidden="true" />
                <Input
                  type="search"
                  className="form-control"
                  value={requestQuery}
                  placeholder={t("adminDashboard.requestSearch")}
                  aria-label={t("adminDashboard.requestSearch")}
                  onChange={(event) => setRequestQuery(event.target.value)}
                />
              </div>
              <Input
                type="select"
                className="app-select"
                value={requestStatusFilter}
                aria-label={t("adminDashboard.requestStatus")}
                onChange={(event) => setRequestStatusFilter(event.target.value)}
              >
                <option value="all">{t("adminDashboard.allStatuses")}</option>
                {["pending", "accepted", "in-progress", "completed", "cancelled", "rejected"].map((status) => (
                  <option key={status} value={status}>
                    {t(`helpRequests.statuses.${status}`)}
                  </option>
                ))}
              </Input>
              {filtersActive && (
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => {
                    setRequestQuery("");
                    setRequestStatusFilter("all");
                  }}
                >
                  {t("adminDashboard.clearFilters")}
                </Button>
              )}
            </div>
            {helpRequestsState === "loading" ? (
              <p className="help-request-note">{t("adminDashboard.helpRequestsLoading")}</p>
            ) : helpRequestsState === "error" ? (
              <p className="help-request-note">{t("adminDashboard.loadError")}</p>
            ) : tablePage.total === 0 ? (
              <p className="admin-empty">{t("adminDashboard.noHelpRequests")}</p>
            ) : (
              <>
                <div className="admin-table-wrap">
                  <table className="admin-table admin-request-table">
                    <thead>
                      <tr>
                        {[
                          t("adminDashboard.requestNumber"),
                          t("adminDashboard.requester"),
                          t("adminDashboard.category"),
                          t("adminDashboard.description"),
                          t("adminDashboard.assignedVolunteer"),
                          t("adminDashboard.createdAt"),
                          t("helpRequests.status"),
                          t("adminDashboard.actions"),
                        ].map((header) => (
                          <th key={header} scope="col">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tablePage.rows.map((request) => (
                        <tr key={request.id}>
                          <td><span dir="ltr">{formatRequestNumber(request)}</span></td>
                          <td>{request.requesterName || "—"}</td>
                          <td>
                            <div>{requestCategoryText(request)}</div>
                            {requestLabel(request) !== "—" && (
                              <div className="help-request-note">{requestLabel(request)}</div>
                            )}
                          </td>
                          <td className="admin-cell-clip">{request.description || "—"}</td>
                          <td>{request.volunteerName || t("adminDashboard.unassigned")}</td>
                          <td>{formatDate(request.createdAt)}</td>
                          <td>
                            <span className={`admin-status is-${request.status}`}>
                              {t(`helpRequests.statuses.${request.status}`)}
                            </span>
                            {matchingNote(request)}
                          </td>
                          <td>
                            <ActionButton
                              label={t("helpRequests.view")}
                              className="admin-icon-edit"
                              onClick={() => setSelectedHelpRequest(request)}
                            >
                              <FaEye />
                            </ActionButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-request-cards">
                  {tablePage.rows.map((request) => (
                    <article key={request.id} className="admin-request-card">
                      <div className="admin-request-card-head">
                        <span dir="ltr">{formatRequestNumber(request)}</span>
                        <span className={`admin-status is-${request.status}`}>
                          {t(`helpRequests.statuses.${request.status}`)}
                        </span>
                      </div>
                      {matchingNote(request)}
                      <h3>{request.requesterName || "—"}</h3>
                      <p>{requestCategoryText(request)}</p>
                      {requestLabel(request) !== "—" && (
                        <p className="help-request-note">{requestLabel(request)}</p>
                      )}
                      <ActionButton
                        label={t("helpRequests.view")}
                        className="admin-icon-edit"
                        onClick={() => setSelectedHelpRequest(request)}
                      >
                        <FaEye />
                      </ActionButton>
                    </article>
                  ))}
                </div>
                <Pagination
                  page={tablePage.page}
                  pageSize={tablePage.pageSize}
                  total={tablePage.total}
                  onPageChange={tablePage.setPage}
                  onPageSizeChange={tablePage.setPageSize}
                />
              </>
            )}
          </div>
        )}

        {user?.id && section === "categories" && <AdminCategories />}

        {user?.id && section === "services" && (
          <>
            <div className="admin-section-header">
              <Button
                type="button"
                className="dashboard-action-button dashboard-password-open-button"
                onClick={openCreateService}
              >
                {t("adminDashboard.addService")}
              </Button>
            </div>
            {servicesAwaitingFirstLoad ? (
              <p className="help-request-note">{t("adminDashboard.servicesLoading")}</p>
            ) : servicesFailedToLoad ? (
              <p className="help-request-note">{servicesLoadError}</p>
            ) : (
            <>
            {!serviceModal && (
            <div className="admin-request-toolbar">
              <div className="admin-request-search">
                <FaSearch aria-hidden="true" />
                <Input
                  type="search"
                  className="form-control"
                  value={serviceQuery}
                  placeholder={t("adminDashboard.serviceSearch")}
                  aria-label={t("adminDashboard.serviceSearch")}
                  onChange={(event) => setServiceQuery(event.target.value)}
                />
              </div>
              <Input
                type="select"
                className="app-select"
                value={serviceVisibility}
                aria-label={t("adminDashboard.visible")}
                onChange={(event) => setServiceVisibility(event.target.value)}
              >
                <option value="all">{t("adminDashboard.allVisibility")}</option>
                <option value="visible">{t("adminDashboard.visible")}</option>
                <option value="hidden">{t("adminDashboard.hidden")}</option>
              </Input>
              <Input
                type="select"
                className="app-select"
                value={serviceCategory}
                aria-label={t("adminDashboard.category")}
                onChange={(event) => setServiceCategory(event.target.value)}
              >
                <option value="all">{t("adminDashboard.allCategories")}</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {localizedCategoryName(category, i18n.language) || category.id}
                  </option>
                ))}
              </Input>
              {serviceFiltersActive && (
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => {
                    setServiceQuery("");
                    setServiceVisibility("all");
                    setServiceCategory("all");
                  }}
                >
                  {t("adminDashboard.clearFilters")}
                </Button>
              )}
            </div>
            )}
            {renderTable(
              [
                t("adminDashboard.serviceName"),
                t("adminDashboard.serviceNameAr"),
                t("adminDashboard.description"),
                t("adminDashboard.descriptionAr"),
                t("adminDashboard.category"),
                t("adminDashboard.visible"),
                t("adminDashboard.actions"),
              ],
              tablePage.rows.map((service) => (
                <tr key={service.id}>
                  <td dir="ltr">{service.name || "—"}</td>
                  <td dir="rtl">{service.nameAr?.trim() || "—"}</td>
                  <td className="admin-cell-clip" dir="ltr">{service.description || "—"}</td>
                  <td className="admin-cell-clip" dir="rtl">{service.descriptionAr?.trim() || "—"}</td>
                  <td>{categoryLabel(service.category)}</td>
                  <td>
                    <span
                      className={`admin-status${service.isVisible ? " is-visible" : " is-hidden"}`}
                    >
                      {t(
                        service.isVisible
                          ? "adminDashboard.visible"
                          : "adminDashboard.hidden",
                      )}
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <ActionButton
                        label={t("adminDashboard.viewServiceDetails")}
                        className="admin-icon-show"
                        onClick={() => setServiceDetails(service)}
                      >
                        <FaEye />
                      </ActionButton>
                      <ActionButton
                        label={t("adminDashboard.edit")}
                        className="admin-icon-edit"
                        disabled={busyId === `service-${service.id}`}
                        onClick={() => openEditService(service)}
                      >
                        <FaEdit />
                      </ActionButton>
                      <ActionButton
                        label={t(
                          service.isVisible
                            ? "adminDashboard.hideService"
                            : "adminDashboard.showService",
                        )}
                        className={
                          service.isVisible ? "admin-icon-show" : "admin-icon-hide"
                        }
                        disabled={busyId === `service-${service.id}`}
                        onClick={() => toggleServiceVisibility(service)}
                      >
                        {service.isVisible ? <FaEye /> : <FaEyeSlash />}
                      </ActionButton>
                      <ActionButton
                        label={t("adminDashboard.delete")}
                        className="admin-icon-delete"
                        disabled={busyId === `service-${service.id}`}
                        onClick={() => setServiceToDelete(service)}
                      >
                        <FaTrash />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              )),
              serviceFiltersActive ? t("adminDashboard.noServiceMatches") : t("adminDashboard.noServices"),
              7,
              true,
              "admin-services-table",
            )}
            </>
            )}
          </>
        )}

        {user?.id && section === "applications" && (
          <>
            <div className="admin-section-header">
              <h2>{t("adminDashboard.pendingApplications")}</h2>
            </div>
            <div className="admin-request-toolbar">
              <div className="admin-request-search">
                <FaSearch aria-hidden="true" />
                <Input
                  type="search"
                  className="form-control"
                  value={applicationQuery}
                  placeholder={t("adminDashboard.applicationSearch")}
                  aria-label={t("adminDashboard.applicationSearch")}
                  onChange={(event) => setApplicationQuery(event.target.value)}
                />
              </div>
              {applicationFiltersActive && (
                <Button
                  type="button"
                  className="dashboard-action-button dashboard-neutral-button"
                  onClick={() => setApplicationQuery("")}
                >
                  {t("adminDashboard.clearFilters")}
                </Button>
              )}
            </div>
            {renderTable(
            [
              t("adminDashboard.fullName"),
              t("adminDashboard.email"),
              t("adminDashboard.phone"),
              t("adminDashboard.skills"),
              t("adminDashboard.dateOfBirth"),
              t("adminDashboard.applicationNumber"),
              t("adminDashboard.submittedAt"),
              t("adminDashboard.actions"),
            ],
            tablePage.rows.map((volunteer) => (
              <tr key={volunteer.id}>
                <td>{volunteer.fullName}</td>
                <td>{volunteer.email}</td>
                <td>{volunteer.phone}</td>
                <td>{skillLabel(volunteer.skills)}</td>
                <td>{displayBirthDate(volunteer.dateOfBirth)}</td>
                <td><span dir="ltr">{volunteer.currentApplicationNumber ?? "—"}</span></td>
                <td>
                  {volunteer.currentSubmittedAt || volunteer.createdAt
                    ? new Date(volunteer.currentSubmittedAt || volunteer.createdAt).toLocaleString(i18n.language)
                    : "—"}
                </td>
                <td>
                  <div className="admin-actions">
                    <ActionButton
                      label={t("adminDashboard.approve")}
                      className="admin-icon-approve"
                      disabled={busyId === `application-${volunteer.id}`}
                      onClick={() => handleDecision(volunteer.id, "approve")}
                    >
                      <FaCheck />
                    </ActionButton>
                    <ActionButton
                      label={t("adminDashboard.reject")}
                      className="admin-icon-reject"
                      disabled={busyId === `application-${volunteer.id}`}
                      onClick={() => handleDecision(volunteer.id, "reject")}
                    >
                      <FaTimes />
                    </ActionButton>
                  </div>
                </td>
              </tr>
            )),
            applicationFiltersActive ? t("adminDashboard.noApplicationMatches") : t("adminDashboard.noApplications"),
            8,
            true,
            )}
            <div className="admin-section-header">
              <h2>{t("adminDashboard.rejectedApplications")}</h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("adminDashboard.fullName")}</th>
                    <th>{t("adminDashboard.email")}</th>
                    <th>{t("adminDashboard.applicationNumber")}</th>
                    <th>{t("adminDashboard.decidedAt")}</th>
                    <th>{t("adminDashboard.rejectionReason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedPage.rows.length === 0 ? (
                    <tr>
                      <td colSpan="5">
                        {applicationFiltersActive
                          ? t("adminDashboard.noApplicationMatches")
                          : t("adminDashboard.noRejectedApplications")}
                      </td>
                    </tr>
                  ) : rejectedPage.rows.map((volunteer) => (
                    <tr key={volunteer.id}>
                      <td>{volunteer.fullName}</td>
                      <td dir="ltr">{volunteer.email}</td>
                      <td><span dir="ltr">{volunteer.currentApplicationNumber ?? "—"}</span></td>
                      <td dir="ltr">
                        {volunteer.decidedAt
                          ? new Date(volunteer.decidedAt).toLocaleString(i18n.language)
                          : "—"}
                      </td>
                      <td className="admin-cell-clip" dir={i18n.language?.startsWith("ar") ? "rtl" : "ltr"}>
                        {localizedRejectionReason(volunteer, i18n.language) || t("applicationRejected.reasonFallback")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={rejectedPage.page}
              pageSize={rejectedPage.pageSize}
              total={rejectedPage.total}
              onPageChange={rejectedPage.setPage}
              onPageSizeChange={rejectedPage.setPageSize}
            />
          </>
        )}

        {user?.id && section === "volunteers" && (
          <>
            <div className="admin-section-header">
              <h2>{t("adminDashboard.approvedVolunteers")}</h2>
            </div>
            {accountDirectoryTools}
            {directoryStatus === "loading" ? (
              <p className="help-request-note">{t("adminDashboard.directoryLoading")}</p>
            ) : directoryStatus === "error" ? (
              <p className="help-request-note">{t("adminDashboard.directoryError")}</p>
            ) : renderTable(
              [
                t("adminDashboard.fullName"),
                t("adminDashboard.email"),
                t("adminDashboard.phone"),
                t("adminDashboard.skills"),
                t("adminDashboard.dateOfBirth"),
                t("adminDashboard.accountStatus"),
                t("adminDashboard.actions"),
              ],
              tablePage.rows.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td>{volunteer.fullName}</td>
                  <td>{volunteer.email}</td>
                  <td>{volunteer.phone}</td>
                  <td>{skillLabel(volunteer.skills)}</td>
                  <td>{displayBirthDate(volunteer.dateOfBirth)}</td>
                  <td>
                    <span className={`admin-status ${accountStatusOf(volunteer) === "blocked" ? "is-rejected" : "is-accepted"}`}>
                      {t(`adminDashboard.accountStatuses.${accountStatusOf(volunteer)}`)}
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <ActionButton
                        label={t("adminDashboard.view")}
                        className="admin-icon-show"
                        onClick={() => setDetails({ kind: "volunteer", record: volunteer })}
                      >
                        <FaEye />
                      </ActionButton>
                      <ActionButton
                        label={t("adminDashboard.editVolunteer")}
                        className="admin-icon-edit"
                        disabled={busyId === `volunteer-${volunteer.id}`}
                        onClick={() => openEditVolunteer(volunteer)}
                      >
                        <FaEdit />
                      </ActionButton>
                      <ActionButton
                        label={t("adminDashboard.deactivateVolunteer")}
                        className="admin-icon-deactivate"
                        disabled={busyId === `volunteer-${volunteer.id}`}
                        onClick={() => setVolunteerToDeactivate(volunteer)}
                      >
                        <FaUserSlash />
                      </ActionButton>
                      {volunteer.id !== user?.id && volunteer.role !== "admin" && (
                        <ActionButton
                          label={t(accountStatusOf(volunteer) === "blocked" ? "adminDashboard.unblockUser" : "adminDashboard.blockUser")}
                          className={accountStatusOf(volunteer) === "blocked" ? "admin-icon-show" : "admin-icon-deactivate"}
                          disabled={busyId === `account-${volunteer.id}`}
                          onClick={() => setAccountAction({
                            id: volunteer.id,
                            name: volunteer.fullName,
                            nextStatus: accountStatusOf(volunteer) === "blocked" ? "active" : "blocked",
                          })}
                        >
                          {accountStatusOf(volunteer) === "blocked" ? <FaUnlock /> : <FaBan />}
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              )),
              directoryFiltersActive ? t("adminDashboard.noAccountMatches") : t("adminDashboard.noVolunteers"),
              7,
              true,
            )}
          </>
        )}

        {user?.id && section === "users" && (
          <>
            <div className="admin-section-header">
              <div>
                <p className="help-request-note">{t("adminDashboard.reportNote")}</p>
              </div>
              <ActionButton
                label={t("adminDashboard.downloadPdf")}
                className="admin-icon-edit admin-pdf-button"
                onClick={downloadReport}
              >
                <FaFilePdf />
              </ActionButton>
            </div>
            {accountDirectoryTools}
            {directoryStatus === "loading" ? (
              <p className="help-request-note">{t("adminDashboard.directoryLoading")}</p>
            ) : directoryStatus === "error" ? (
              <p className="help-request-note">{t("adminDashboard.directoryError")}</p>
            ) : renderTable(
              [
                t("adminDashboard.fullName"),
                t("adminDashboard.email"),
                t("adminDashboard.phone"),
                t("adminDashboard.role"),
                t("adminDashboard.volunteerStatus"),
                t("adminDashboard.dateOfBirth"),
                t("adminDashboard.accountCreated"),
                t("adminDashboard.accountStatus"),
                t("adminDashboard.actions"),
              ],
              tablePage.rows.map((account) => (
                <tr key={account.id}>
                  <td>{account.fullName}</td>
                  <td>{account.email}</td>
                  <td>{account.phone || "—"}</td>
                  <td>{t(`dashboard.roles.${account.role || "user"}`)}</td>
                  <td>
                    {t(`adminDashboard.volunteerStatuses.${account.volunteerStatus || "not-applicable"}`)}
                  </td>
                  <td>{displayBirthDate(account.dateOfBirth)}</td>
                  <td>
                    {account.createdAt
                      ? new Date(account.createdAt).toLocaleDateString(i18n.language)
                      : "—"}
                  </td>
                  <td>
                    <span className={`admin-status ${accountStatusOf(account) === "blocked" ? "is-rejected" : "is-accepted"}`}>
                      {t(`adminDashboard.accountStatuses.${accountStatusOf(account)}`)}
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <ActionButton
                        label={t("adminDashboard.view")}
                        className="admin-icon-show"
                        onClick={() => setDetails({ kind: "user", record: account })}
                      >
                        <FaEye />
                      </ActionButton>
                      <ActionButton
                        label={t("adminDashboard.editUser")}
                        className="admin-icon-edit"
                        onClick={() => openEditUser(account)}
                      >
                        <FaEdit />
                      </ActionButton>
                      {account.id !== user?.id && account.role !== "admin" && (
                        <ActionButton
                          label={t(accountStatusOf(account) === "blocked" ? "adminDashboard.unblockUser" : "adminDashboard.blockUser")}
                          className={accountStatusOf(account) === "blocked" ? "admin-icon-show" : "admin-icon-deactivate"}
                          disabled={busyId === `account-${account.id}`}
                          onClick={() => setAccountAction({
                            id: account.id,
                            name: account.fullName,
                            nextStatus: accountStatusOf(account) === "blocked" ? "active" : "blocked",
                          })}
                        >
                          {accountStatusOf(account) === "blocked" ? <FaUnlock /> : <FaBan />}
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              )),
              directoryFiltersActive ? t("adminDashboard.noAccountMatches") : t("adminDashboard.noUsers"),
              9,
              true,
            )}
          </>
        )}

        {user?.id && section === "activity" && <ActivityFeed />}

        {user?.id && section === "feedback" && (
          <>
            <div className="rating-summary">
              <div className="rating-summary-card">
                <span>{t("feedback.overallAverage")}</span>
                <strong>
                  {ratingSummary.overall?.ratingCount
                    ? Number(ratingSummary.overall.averageRating).toFixed(1)
                    : t("feedback.noRatings")}
                </strong>
              </div>
              <div className="rating-summary-list">
                <h3>{t("feedback.volunteerAverages")}</h3>
                {ratingSummary.volunteers?.length ? (
                  <ul>
                    {ratingSummary.volunteers.map((item) => (
                      <li key={item.volunteerId}>
                        <span>{item.volunteerName || "—"}</span>
                        <strong>{Number(item.averageRating).toFixed(1)}</strong>
                        <span>{item.ratingCount}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="help-request-note">{t("feedback.noRatings")}</p>
                )}
              </div>
            </div>
            {feedbackStatus === "ready" && (
              <div className="admin-request-toolbar">
                <div className="admin-request-search">
                  <FaSearch aria-hidden="true" />
                  <Input
                    type="search"
                    className="form-control"
                    value={feedbackQuery}
                    placeholder={t("adminDashboard.feedbackSearch")}
                    aria-label={t("adminDashboard.feedbackSearch")}
                    onChange={(event) => setFeedbackQuery(event.target.value)}
                  />
                </div>
                <Input
                  type="select"
                  className="app-select"
                  value={feedbackRating}
                  aria-label={t("feedback.rating")}
                  onChange={(event) => setFeedbackRating(event.target.value)}
                >
                  <option value="all">{t("adminDashboard.allRatings")}</option>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={String(rating)}>{rating}</option>
                  ))}
                </Input>
                {feedbackFiltersActive && (
                  <Button
                    type="button"
                    className="dashboard-action-button dashboard-neutral-button"
                    onClick={() => {
                      setFeedbackQuery("");
                      setFeedbackRating("all");
                    }}
                  >
                    {t("adminDashboard.clearFilters")}
                  </Button>
                )}
              </div>
            )}
            {feedbackStatus === "loading" ? (
              <p className="help-request-note">{t("adminDashboard.feedbackLoading")}</p>
            ) : feedbackStatus === "error" ? (
              <p className="help-request-note">{t("adminDashboard.feedbackError")}</p>
            ) : renderTable(
              [
                t("feedback.user"),
                t("feedback.volunteer"),
                t("feedback.service"),
                t("feedback.rating"),
                t("feedback.comment"),
                t("feedback.date"),
                t("adminDashboard.actions"),
              ],
              tablePage.rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.userName || "—"}</td>
                  <td>{item.volunteerName || "—"}</td>
                  <td>{requestLabel(item)}</td>
                  <td>
                    <span className="feedback-stars is-readonly" dir="ltr" aria-label={t("feedback.starLabel", { count: item.rating })}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        value <= item.rating
                          ? <FaStar key={value} className="is-selected" />
                          : <FaRegStar key={value} />
                      ))}
                    </span>
                  </td>
                  <td className="feedback-comment">{item.comment}</td>
                  <td>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleDateString(i18n.language)
                      : "—"}
                  </td>
                  <td>
                    <ActionButton
                      label={t("helpRequests.view")}
                      className="admin-icon-edit"
                      onClick={() => setSelectedFeedback(item)}
                    >
                      <FaEye />
                    </ActionButton>
                  </td>
                </tr>
              )),
              feedbackFiltersActive ? t("adminDashboard.noFeedbackMatches") : t("feedback.empty"),
              7,
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={!!selectedHelpRequest}
        toggle={() => setSelectedHelpRequest(null)}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setSelectedHelpRequest(null)} closeAriaLabel={t("common.close")}>
          {t("adminDashboard.requestDetails")}
        </ModalHeader>
        <ModalBody className="admin-request-detail">
          {selectedHelpRequest && (
            <>
              <div className="admin-request-detail-hero">
                <span dir="ltr">{formatRequestNumber(selectedHelpRequest)}</span>
                <span className={`admin-status is-${selectedHelpRequest.status}`}>
                  {t(`helpRequests.statuses.${selectedHelpRequest.status}`)}
                </span>
              </div>
              {matchingNote(selectedHelpRequest)}
              <section>
                <h3><FaUser aria-hidden="true" /> {t("adminDashboard.people")}</h3>
                <p><strong>{t("adminDashboard.requester")}:</strong> {selectedHelpRequest.requesterName || "—"}</p>
                {selectedHelpRequest.requesterEmail && (
                  <p><strong>{t("adminDashboard.email")}:</strong> {selectedHelpRequest.requesterEmail}</p>
                )}
                {selectedHelpRequest.requesterPhone && (
                  <p><strong>{t("adminDashboard.phone")}:</strong> {selectedHelpRequest.requesterPhone}</p>
                )}
                <p>
                  <strong>{t("adminDashboard.assignedVolunteer")}:</strong>{" "}
                  {selectedHelpRequest.volunteerName || t("adminDashboard.unassigned")}
                </p>
              </section>
              <section>
                <h3>{t("adminDashboard.requestInfo")}</h3>
                <p><strong>{t("adminDashboard.category")}:</strong> {requestCategoryText(selectedHelpRequest)}</p>
                <p><strong>{t("helpRequests.service")}:</strong> {requestLabel(selectedHelpRequest)}</p>
                <p><strong>{t("adminDashboard.description")}:</strong> {selectedHelpRequest.description || "—"}</p>
              </section>
              <section>
                <h3><FaMapMarkerAlt aria-hidden="true" /> {t("helpRequests.location")}</h3>
                <p>
                  <strong>{t("helpRequests.wilayat")}:</strong>{" "}
                  {["muscat", "muttrah", "bawshar", "seeb", "amarat", "qurayyat"].includes(selectedHelpRequest.wilayat)
                    ? t(`helpRequests.wilayats.${selectedHelpRequest.wilayat}`)
                    : "—"}
                </p>
                <p><strong>{t("helpRequests.area")}:</strong> {selectedHelpRequest.area || "—"}</p>
                <p><strong>{t("helpRequests.street")}:</strong> {selectedHelpRequest.street || "—"}</p>
                <p><strong>{t("helpRequests.building")}:</strong> {selectedHelpRequest.building || "—"}</p>
                <p><strong>{t("helpRequests.landmark")}:</strong> {selectedHelpRequest.landmark || "—"}</p>
                {Number.isFinite(Number(selectedHelpRequest.latitude)) && Number.isFinite(Number(selectedHelpRequest.longitude)) && (
                  <p>
                    <strong>{t("helpRequests.coordinates")}:</strong>{" "}
                    {`${Number(selectedHelpRequest.latitude).toFixed(6)}, ${Number(selectedHelpRequest.longitude).toFixed(6)}`}
                  </p>
                )}
              </section>
              <section>
                <h3><FaCalendarAlt aria-hidden="true" /> {t("adminDashboard.dates")}</h3>
                <p><strong>{t("adminDashboard.createdAt")}:</strong> {formatDate(selectedHelpRequest.createdAt)}</p>
                {selectedHelpRequest.acceptedAt && (
                  <p><strong>{t("adminDashboard.acceptanceDate")}:</strong> {formatDate(selectedHelpRequest.acceptedAt)}</p>
                )}
                {selectedHelpRequest.status === "completed" && (
                  <p className="help-request-note">{t("adminDashboard.completionUnavailable")}</p>
                )}
              </section>
            </>
          )}
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-cancel-button"
            onClick={() => setSelectedHelpRequest(null)}
          >
            {t("dashboard.cancel")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!selectedFeedback}
        toggle={() => setSelectedFeedback(null)}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setSelectedFeedback(null)} closeAriaLabel={t("common.close")}>
          {t("adminDashboard.feedbackDetails")}
        </ModalHeader>
        <ModalBody className="admin-request-detail">
          {selectedFeedback && (
            <>
              <p><strong>{t("feedback.user")}:</strong> {selectedFeedback.userName || "—"}</p>
              <p><strong>{t("feedback.volunteer")}:</strong> {selectedFeedback.volunteerName || "—"}</p>
              <p><strong>{t("feedback.service")}:</strong> {requestLabel(selectedFeedback)}</p>
              <p>
                <strong>{t("feedback.rating")}:</strong>{" "}
                <span dir="ltr">{Number.isFinite(Number(selectedFeedback.rating)) ? selectedFeedback.rating : "—"}</span>
              </p>
              <p><strong>{t("feedback.comment")}:</strong> {selectedFeedback.comment || "—"}</p>
              <p>
                <strong>{t("feedback.date")}:</strong>{" "}
                {selectedFeedback.createdAt
                  ? new Date(selectedFeedback.createdAt).toLocaleString(i18n.language)
                  : "—"}
              </p>
            </>
          )}
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-cancel-button"
            onClick={() => setSelectedFeedback(null)}
          >
            {t("dashboard.cancel")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!serviceModal}
        toggle={() => {
          if (!isServiceSubmitting) setServiceModal(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <Form
          className="dashboard-profile-form"
          onSubmit={handleServiceSubmit(onServiceSubmit)}
          noValidate
        >
          <ModalHeader
            closeAriaLabel={t("common.close")}
            toggle={() => {
              if (!isServiceSubmitting) setServiceModal(null);
            }}
          >
            {t(
              serviceModal?.mode === "edit"
                ? "adminDashboard.editService"
                : "adminDashboard.addService",
            )}
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label for="serviceName">{t("adminDashboard.serviceName")}</Label>
              <Controller
                name="name"
                control={serviceControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="serviceName"
                    dir="ltr"
                    maxLength={60}
                    invalid={!!serviceErrors.name}
                    placeholder={t("adminDashboard.serviceNamePlaceholder")}
                  />
                )}
              />
              {serviceErrors.name && (
                <div className="form-error">{t(serviceErrors.name.message)}</div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="serviceNameAr">{t("adminDashboard.serviceNameAr")}</Label>
              <Controller
                name="nameAr"
                control={serviceControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="serviceNameAr"
                    dir="rtl"
                    maxLength={60}
                    invalid={!!serviceErrors.nameAr}
                    placeholder={t("adminDashboard.serviceNameArPlaceholder")}
                  />
                )}
              />
              {serviceErrors.nameAr && (
                <div className="form-error">{t(serviceErrors.nameAr.message)}</div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="serviceDescription">
                {t("adminDashboard.description")}
              </Label>
              <Controller
                name="description"
                control={serviceControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="serviceDescription"
                    dir="ltr"
                    type="textarea"
                    rows="4"
                    maxLength={400}
                    invalid={!!serviceErrors.description}
                    placeholder={t("adminDashboard.descriptionPlaceholder")}
                  />
                )}
              />
              {serviceErrors.description && (
                <div className="form-error">
                  {t(serviceErrors.description.message)}
                </div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="serviceDescriptionAr">{t("adminDashboard.descriptionAr")}</Label>
              <Controller
                name="descriptionAr"
                control={serviceControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="serviceDescriptionAr"
                    dir="rtl"
                    type="textarea"
                    rows="4"
                    maxLength={400}
                    invalid={!!serviceErrors.descriptionAr}
                    placeholder={t("adminDashboard.descriptionArPlaceholder")}
                  />
                )}
              />
              {serviceErrors.descriptionAr && (
                <div className="form-error">{t(serviceErrors.descriptionAr.message)}</div>
              )}
            </FormGroup>
            <FormGroup className="service-category-separator">
              <Label for="serviceCategory">{t("adminDashboard.category")}</Label>
              <Controller
                name="category"
                control={serviceControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="serviceCategory"
                    className="app-select"
                    type="select"
                    invalid={!!serviceErrors.category}
                  >
                    <option value="">{t("adminDashboard.categoryPlaceholder")}</option>
                    {field.value && !categoryOptions.some((category) => category.id === field.value) && (
                      <option value={field.value}>{field.value}</option>
                    )}
                    {categoryOptions
                      .filter((category) => category.isActive || category.id === field.value)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {localizedCategoryName(category, i18n.language) || category.id}
                        </option>
                      ))}
                  </Input>
                )}
              />
              {categoryStatus === "loading" && (
                <p className="help-request-note">{t("adminDashboard.categoriesLoading")}</p>
              )}
              {categoryStatus === "error" && (
                <p className="help-request-note">{t("adminDashboard.categoriesError")}</p>
              )}
              {categoryStatus === "ready" && categoryOptions.length === 0 && (
                <p className="help-request-note">{t("adminDashboard.noCategories")}</p>
              )}
              {serviceErrors.category && (
                <div className="form-error">{t(serviceErrors.category.message)}</div>
              )}
              <p className="help-request-note">{t("adminDashboard.categoryMatchingNote")}</p>
            </FormGroup>
          </ModalBody>
          <ModalFooter className="dashboard-modal-actions">
            <Button
              className="dashboard-action-button dashboard-save-button"
              type="submit"
              disabled={isServiceSubmitting}
            >
              {t("dashboard.saveChanges")}
            </Button>
            <Button
              className="dashboard-action-button dashboard-neutral-button"
              type="button"
              disabled={isServiceSubmitting}
              onClick={() => setServiceModal(null)}
            >
              {t("dashboard.cancel")}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>

      <Modal
        isOpen={!!serviceDetails}
        toggle={() => setServiceDetails(null)}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setServiceDetails(null)} closeAriaLabel={t("common.close")}>
          {t("adminDashboard.serviceDetails")}
        </ModalHeader>
        <ModalBody>
          {serviceDetails && (
            <>
              <p className="service-details-copy">
                <strong>{t("adminDashboard.serviceName")}:</strong>{" "}
                <span dir="ltr">{serviceDetails.name?.trim() || "—"}</span>
              </p>
              <p className="service-details-copy" dir="rtl">
                <strong>{t("adminDashboard.serviceNameAr")}:</strong>{" "}
                {serviceDetails.nameAr?.trim() || "—"}
              </p>
              <p className="service-details-copy">
                <strong>{t("adminDashboard.description")}:</strong>{" "}
                <span dir="ltr">{serviceDetails.description?.trim() || "—"}</span>
              </p>
              <p className="service-details-copy" dir="rtl">
                <strong>{t("adminDashboard.descriptionAr")}:</strong>{" "}
                {serviceDetails.descriptionAr?.trim() || "—"}
              </p>
              <p className="service-details-copy">
                <strong>{t("adminDashboard.category")}:</strong>{" "}
                {categoryLabel(serviceDetails.category)}
              </p>
            </>
          )}
        </ModalBody>
      </Modal>

      <Modal
        isOpen={!!serviceToDelete}
        toggle={() => setServiceToDelete(null)}
        centered
        className="dashboard-modal-dialog dashboard-logout-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setServiceToDelete(null)} closeAriaLabel={t("common.close")}>
          {t("adminDashboard.deleteServiceTitle")}
        </ModalHeader>
        <ModalBody className="dashboard-logout-body">
          <div className="dashboard-logout-icon" aria-hidden="true">
            <FaTrash />
          </div>
          <p className="dashboard-logout-message">
            {t("adminDashboard.deleteServiceMessage")}
          </p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            className="dashboard-action-button dashboard-neutral-button"
            type="button"
            onClick={() => setServiceToDelete(null)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            className="dashboard-action-button dashboard-logout-confirm"
            type="button"
            onClick={confirmDeleteService}
          >
            {t("adminDashboard.delete")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!volunteerModal}
        toggle={() => {
          if (!isVolunteerSubmitting) setVolunteerModal(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content dashboard-picker-modal-content"
      >
        <Form
          className="dashboard-profile-form"
          onSubmit={handleVolunteerSubmit(onVolunteerSubmit)}
          noValidate
        >
          <ModalHeader
            closeAriaLabel={t("common.close")}
            toggle={() => {
              if (!isVolunteerSubmitting) setVolunteerModal(null);
            }}
          >
            {t("adminDashboard.editVolunteer")}
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label for="volunteerFullName">{t("adminDashboard.fullName")}</Label>
              <Controller
                name="fullName"
                control={volunteerControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="volunteerFullName"
                    invalid={!!volunteerErrors.fullName}
                  />
                )}
              />
              {volunteerErrors.fullName && (
                <div className="form-error">
                  {t(volunteerErrors.fullName.message)}
                </div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="volunteerEmail">{t("adminDashboard.email")}</Label>
              <Input
                id="volunteerEmail"
                type="email"
                value={volunteerModal?.email || ""}
                readOnly
              />
            </FormGroup>
            <FormGroup>
              <Label for="volunteerPhone">{t("adminDashboard.phone")}</Label>
              <Controller
                name="phone"
                control={volunteerControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="volunteerPhone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={8}
                    invalid={!!volunteerErrors.phone}
                    onChange={(event) => field.onChange(digitsOnly(event.target.value, 8))}
                  />
                )}
              />
              {volunteerErrors.phone && (
                <div className="form-error">{t(volunteerErrors.phone.message)}</div>
              )}
            </FormGroup>
            <FormGroup>
              <Label id="volunteerSkillsLabel">{t("adminDashboard.skills")}</Label>
              <Controller
                name="skills"
                control={volunteerControl}
                render={({ field }) => (
                  <SkillCheckboxList
                    id="volunteerSkills"
                    labelId="volunteerSkillsLabel"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!volunteerErrors.skills}
                  />
                )}
              />
              {volunteerErrors.skills && (
                <div className="form-error">
                  {t(volunteerErrors.skills.message)}
                </div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="volunteerDateOfBirth">
                {t("adminDashboard.dateOfBirth")}
              </Label>
              <Controller
                name="dateOfBirth"
                control={volunteerControl}
                render={({ field }) => {
                  const dateText = toDateInputValue(field.value);
                  const selectedDate = parseDateValue(dateText);

                  return (
                    <div
                      className={`register-picker${openPicker === "date" ? " is-open" : ""}`}
                      ref={datePickerRef}
                    >
                      <button
                        id="volunteerDateOfBirth"
                        ref={field.ref}
                        type="button"
                        className={`form-control register-picker-trigger${volunteerErrors.dateOfBirth ? " is-invalid" : ""}`}
                        onBlur={field.onBlur}
                        onClick={() => openVolunteerDatePicker(dateText)}
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
                              disabled={calendarMonth <= earliestSelectableMonth}
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
                              disabled={calendarMonth >= latestNavigationMonth}
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
                                  { length: currentYear - MINIMUM_BIRTH_YEAR + 1 },
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
                                    onClick={() => changeCalendarMonthName(month)}
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

                                if (getDateOnlyValue(date) > maximumBirthDateValue) {
                                  setInvalidDateAttempt(true);
                                  setVolunteerError("dateOfBirth", {
                                    type: "manual",
                                    message: "validation.dateOfBirth.ageSelection",
                                  });
                                  return;
                                }

                                setInvalidDateAttempt(false);
                                clearVolunteerErrors("dateOfBirth");
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
              {volunteerErrors.dateOfBirth && (
                <div className="form-error">
                  {t(volunteerErrors.dateOfBirth.message)}
                </div>
              )}
            </FormGroup>
          </ModalBody>
          <ModalFooter className="dashboard-modal-actions">
            <Button
              className="dashboard-action-button dashboard-save-button"
              type="submit"
              disabled={isVolunteerSubmitting}
            >
              {t("dashboard.saveChanges")}
            </Button>
            <Button
              className="dashboard-action-button dashboard-neutral-button"
              type="button"
              disabled={isVolunteerSubmitting}
              onClick={() => setVolunteerModal(null)}
            >
              {t("dashboard.cancel")}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>

      <Modal
        isOpen={!!volunteerToDeactivate}
        toggle={() => setVolunteerToDeactivate(null)}
        centered
        className="dashboard-modal-dialog dashboard-logout-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setVolunteerToDeactivate(null)} closeAriaLabel={t("common.close")}>
          {t("adminDashboard.deactivateVolunteerTitle")}
        </ModalHeader>
        <ModalBody className="dashboard-logout-body">
          <div className="dashboard-logout-icon" aria-hidden="true">
            <FaUserSlash />
          </div>
          <p className="dashboard-logout-message">
            {t("adminDashboard.deactivateVolunteerMessage")}
          </p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            className="dashboard-action-button dashboard-neutral-button"
            type="button"
            onClick={() => setVolunteerToDeactivate(null)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            className="dashboard-action-button dashboard-logout-confirm"
            type="button"
            onClick={confirmDeactivateVolunteer}
          >
            {t("adminDashboard.deactivateVolunteer")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!details}
        toggle={() => setDetails(null)}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setDetails(null)} closeAriaLabel={t("common.close")}>
          <BackButton onBack={() => setDetails(null)} />
          {t(details?.kind === "user" ? "adminDashboard.viewUser" : "adminDashboard.viewVolunteer")}
        </ModalHeader>
        <ModalBody>
          {details && (
            <>
              <p><strong>{t("adminDashboard.fullName")}:</strong> {details.record.fullName}</p>
              <p><strong>{t("adminDashboard.email")}:</strong> {details.record.email}</p>
              <p>
                <strong>{t("adminDashboard.accountStatus")}:</strong>{" "}
                {t(`adminDashboard.accountStatuses.${accountStatusOf(details.record)}`)}
              </p>
              {details.kind === "volunteer" && (
                <p><strong>{t("adminDashboard.phone")}:</strong> {details.record.phone || "—"}</p>
              )}
              {details.kind === "volunteer" && (
                <>
                  <p><strong>{t("adminDashboard.skills")}:</strong> {skillLabel(details.record.skills)}</p>
                  <p><strong>{t("adminDashboard.dateOfBirth")}:</strong> {displayBirthDate(details.record.dateOfBirth)}</p>
                </>
              )}
            </>
          )}
        </ModalBody>
      </Modal>

      <Modal
        isOpen={!!userModal}
        toggle={() => {
          if (!isUserSubmitting) setUserModal(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <Form
          className="dashboard-profile-form"
          onSubmit={handleUserSubmit(onUserSubmit)}
          noValidate
        >
          <ModalHeader
            closeAriaLabel={t("common.close")}
            toggle={() => {
              if (!isUserSubmitting) setUserModal(null);
            }}
          >
            {t("adminDashboard.editUser")}
          </ModalHeader>
          <ModalBody>
            <FormGroup>
              <Label for="managedFullName">{t("adminDashboard.fullName")}</Label>
              <Controller
                name="fullName"
                control={userControl}
                render={({ field }) => (
                  <Input {...field} id="managedFullName" invalid={!!userErrors.fullName} />
                )}
              />
              {userErrors.fullName && (
                <div className="form-error">{t(userErrors.fullName.message)}</div>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="managedEmail">{t("adminDashboard.email")}</Label>
              <Input id="managedEmail" type="email" value={userModal?.email || ""} readOnly />
            </FormGroup>
          </ModalBody>
          <ModalFooter className="dashboard-modal-actions">
            <Button
              className="dashboard-action-button dashboard-save-button"
              type="submit"
              disabled={isUserSubmitting}
            >
              {t("dashboard.saveChanges")}
            </Button>
            <Button
              className="dashboard-action-button dashboard-neutral-button"
              type="button"
              disabled={isUserSubmitting}
              onClick={() => setUserModal(null)}
            >
              {t("dashboard.cancel")}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>

      <Modal
        isOpen={!!accountAction}
        toggle={() => {
          if (busyId !== `account-${accountAction?.id}`) setAccountAction(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader
          closeAriaLabel={t("common.close")}
          toggle={() => {
            if (busyId !== `account-${accountAction?.id}`) setAccountAction(null);
          }}
        >
          {t(accountAction?.nextStatus === "blocked" ? "adminDashboard.blockTitle" : "adminDashboard.unblockTitle")}
        </ModalHeader>
        <ModalBody>
          <p>
            {t(
              accountAction?.nextStatus === "blocked"
                ? "adminDashboard.blockMessage"
                : "adminDashboard.unblockMessage",
              { name: accountAction?.name || "" },
            )}
          </p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            disabled={busyId === `account-${accountAction?.id}`}
            onClick={() => setAccountAction(null)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            type="button"
            className={
              accountAction?.nextStatus === "blocked"
                ? "dashboard-action-button dashboard-logout-confirm"
                : "dashboard-action-button dashboard-save-button"
            }
            disabled={busyId === `account-${accountAction?.id}`}
            onClick={confirmAccountStatus}
          >
            {t(accountAction?.nextStatus === "blocked" ? "adminDashboard.confirmBlock" : "adminDashboard.confirmUnblock")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(applicationToReject)}
        toggle={() => {
          if (busyId !== `application-${applicationToReject?.id}`) setApplicationToReject(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader
          closeAriaLabel={t("common.close")}
          toggle={() => {
          if (busyId !== `application-${applicationToReject?.id}`) setApplicationToReject(null);
        }}
        >
          {t("adminDashboard.rejectApplicationTitle")}
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label for="rejectionReasonEn">{t("adminDashboard.rejectionReasonEnglish")}</Label>
            <Input
              id="rejectionReasonEn"
              type="textarea"
              dir="ltr"
              value={rejectionReasonEn}
              onChange={(event) => setRejectionReasonEn(event.target.value)}
            />
            {rejectionErrors.en && <div className="form-error">{rejectionErrors.en}</div>}
          </FormGroup>
          <FormGroup>
            <Label for="rejectionReasonAr">{t("adminDashboard.rejectionReasonArabic")}</Label>
            <Input
              id="rejectionReasonAr"
              type="textarea"
              dir="rtl"
              value={rejectionReasonAr}
              onChange={(event) => setRejectionReasonAr(event.target.value)}
            />
            {rejectionErrors.ar && <div className="form-error">{rejectionErrors.ar}</div>}
          </FormGroup>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            disabled={busyId === `application-${applicationToReject?.id}`}
            onClick={() => setApplicationToReject(null)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            type="button"
            className="dashboard-action-button dashboard-cancel-button"
            disabled={busyId === `application-${applicationToReject?.id}`}
            onClick={confirmRejectApplication}
          >
            {t("adminDashboard.reject")}
          </Button>
        </ModalFooter>
      </Modal>
    </DashboardLayout>
  );
};

export default AdminDashboard;

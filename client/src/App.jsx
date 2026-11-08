import { useEffect, useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { logout } from "./features/authSlice";
import { Toaster } from "react-hot-toast";
import Navbar from "./components/Navbar";
import "./App.css";
import Footer from "./components/Footer";
import GetStarted from "./components/GetStarted";
import JoinUs from "./components/JoinUs";
import Login from "./components/Login";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import RegisterUser from "./components/RegisterUser";
import RegisterVolunteer from "./components/RegisterVolunteer";
import VerifyEmail from "./components/VerifyEmail";
import NotFound from "./components/NotFound";
import UserDashboard from "./components/UserDashboard";
import VolunteerDashboard from "./components/VolunteerDashboard";
import AdminDashboard from "./components/AdminDashboard";
import ApplicationRejected from "./components/ApplicationRejected";
import ApplicationPending from "./components/ApplicationPending";
import ReapplyVolunteer from "./components/ReapplyVolunteer";

const BLOCK_WARNING_MS = 10000;
let blockWarningEndsAt = 0;
let blockLogoutTimer = null;

function armAccountBlockWarning() {
  if (blockLogoutTimer) return blockWarningEndsAt;
  blockWarningEndsAt = Date.now() + BLOCK_WARNING_MS;
  blockLogoutTimer = window.setTimeout(() => {
    blockLogoutTimer = null;
    blockWarningEndsAt = 0;
    window.dispatchEvent(new CustomEvent("helpnearby-account-block-logout"));
  }, BLOCK_WARNING_MS);
  return blockWarningEndsAt;
}

function stopAccountBlockSocket(socket) {
  socket.io.reconnection(false);
  window.dispatchEvent(new CustomEvent("helpnearby-account-blocked"));
}

const APPLICATION_REJECTED_PATH = "/application-rejected";
const APPLICATION_REAPPLY_PATH = "/application-reapply";
const APPLICATION_PENDING_PATH = "/application-pending";

function isRejectedApplicant(user) {
  return user?.role === "user" && user?.volunteerStatus === "rejected";
}

function isPendingApplicant(user) {
  return user?.role === "user" && user?.volunteerStatus === "pending";
}

function dashboardPath(user) {
  if (isRejectedApplicant(user)) return APPLICATION_REJECTED_PATH;
  if (isPendingApplicant(user)) return APPLICATION_PENDING_PATH;
  if (user?.role === "admin") return "/admin";
  if (user?.role === "volunteer" && user?.volunteerStatus === "approved") return "/volunteer";
  if (user?.role === "user") return "/user";
  return "/";
}

function redirectForAccount(user, pathname) {
  const destination = dashboardPath(user);
  if (destination === pathname) return <Navigate to="/" replace />;
  return <Navigate to={destination} replace />;
}

function RequireRole({ role, children }) {
  const user = useSelector((state) => state.auth.user);
  const location = useLocation();

  if (!user?.id || typeof user.role !== "string") {
    return <Navigate to="/login" replace />;
  }

  const approvedVolunteer = user.role === "volunteer" && user.volunteerStatus === "approved";
  const allowed =
    !isRejectedApplicant(user) &&
    !isPendingApplicant(user) &&
    user.role === role &&
    (role !== "volunteer" || approvedVolunteer || user.volunteerStatus == null);

  if (!allowed) return redirectForAccount(user, location.pathname);

  return children;
}

function RequireRejectedApplicant({ children }) {
  const user = useSelector((state) => state.auth.user);
  const location = useLocation();

  if (!user?.id || typeof user.role !== "string") {
    return <Navigate to="/login" replace />;
  }

  if (!isRejectedApplicant(user)) return redirectForAccount(user, location.pathname);
  return children;
}

function RequirePendingApplicant({ children }) {
  const user = useSelector((state) => state.auth.user);
  const location = useLocation();

  if (!user?.id || typeof user.role !== "string") {
    return <Navigate to="/login" replace />;
  }

  if (!isPendingApplicant(user)) return redirectForAccount(user, location.pathname);
  return children;
}

function App() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((state) => state.theme.mode);
  const language = useSelector((state) => state.language.language);
  const user = useSelector((state) => state.auth.user);
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [blockSeconds, setBlockSeconds] = useState(0);
  const isDashboardRoute = /^\/(user|volunteer|admin)(\/profile)?\/?$/.test(
    location.pathname,
  );
  const RouteHost = isDashboardRoute ? "div" : "main";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  useEffect(() => {
    const syncWarning = () => {
      if (!blockWarningEndsAt) {
        setBlockSeconds(0);
        document.body.classList.remove("account-block-pending");
        return;
      }
      document.body.classList.add("account-block-pending");
      setBlockSeconds(Math.max(0, Math.ceil((blockWarningEndsAt - Date.now()) / 1000)));
    };
    const onBlocked = () => {
      armAccountBlockWarning();
      syncWarning();
    };
    const onLogout = () => {
      document.body.classList.remove("account-block-pending");
      setBlockSeconds(0);
      sessionStorage.setItem("helpnearby-account-blocked-notice", "1");
      dispatch(logout());
      navigate("/login", { replace: true, state: { accountBlocked: true } });
    };

    window.addEventListener("helpnearby-account-blocked", onBlocked);
    window.addEventListener("helpnearby-account-block-logout", onLogout);
    const tick = window.setInterval(syncWarning, 250);
    syncWarning();

    return () => {
      window.removeEventListener("helpnearby-account-blocked", onBlocked);
      window.removeEventListener("helpnearby-account-block-logout", onLogout);
      window.clearInterval(tick);
    };
  }, [dispatch, navigate]);

  useEffect(() => {
    if (!user?.id || isDashboardRoute) return undefined;

    const socket = io("http://localhost:5000", {
      auth: { userId: user.id },
    });
    const onBlocked = () => {
      stopAccountBlockSocket(socket);
    };
    socket.on("account_blocked", onBlocked);

    return () => {
      socket.off("account_blocked", onBlocked);
      socket.disconnect();
    };
  }, [isDashboardRoute, user?.id]);

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }

    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    axios.defaults.headers.common["Accept-Language"] = language === "ar" ? "ar" : "en";
  }, [language, i18n]);

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: "var(--surface)",
            color: "var(--text)",
            fontFamily: '"Cairo", sans-serif',
            border: "1px solid color-mix(in srgb, var(--text) 18%, transparent)",
          },
        }}
      />
      {blockSeconds > 0 && (
        <div className="account-block-banner" role="alert" aria-live="polite">
          {t(blockSeconds === 1 ? "accountBlock.warningOne" : "accountBlock.warning", { seconds: blockSeconds })}
        </div>
      )}
      {!isDashboardRoute && <Navbar />}
      <RouteHost className={isDashboardRoute ? "dashboard-route-host" : undefined}>
        <Routes>
          <Route path="/" element={<GetStarted />} />
          <Route path="/join-us" element={<JoinUs />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register/user" element={<RegisterUser />} />
          <Route path="/register/volunteer" element={<RegisterVolunteer />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route
            path={APPLICATION_REJECTED_PATH}
            element={<RequireRejectedApplicant><ApplicationRejected /></RequireRejectedApplicant>}
          />
          <Route
            path={APPLICATION_REAPPLY_PATH}
            element={<RequireRejectedApplicant><ReapplyVolunteer /></RequireRejectedApplicant>}
          />
          <Route
            path={APPLICATION_PENDING_PATH}
            element={<RequirePendingApplicant><ApplicationPending /></RequirePendingApplicant>}
          />
          <Route
            path="/user"
            element={<RequireRole role="user"><UserDashboard /></RequireRole>}
          />
          <Route
            path="/user/profile"
            element={<RequireRole role="user"><UserDashboard /></RequireRole>}
          />
          <Route
            path="/volunteer"
            element={<RequireRole role="volunteer"><VolunteerDashboard /></RequireRole>}
          />
          <Route
            path="/volunteer/profile"
            element={<RequireRole role="volunteer"><VolunteerDashboard /></RequireRole>}
          />
          <Route
            path="/admin"
            element={<RequireRole role="admin"><AdminDashboard /></RequireRole>}
          />
          <Route
            path="/admin/profile"
            element={<RequireRole role="admin"><AdminDashboard /></RequireRole>}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </RouteHost>
      {!isDashboardRoute && <Footer />}
    </>
  );
}

export default App;

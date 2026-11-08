import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button, Container } from "reactstrap";
import { FaHourglassHalf } from "react-icons/fa";

import { applyAccountStatus, logout } from "../features/authSlice";

const API_URL = "http://localhost:5000/api";
const STATUS_POLL_MS = 15000;

const ApplicationPending = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;

    const refreshStatus = async () => {
      if (requestInFlight.current) return;
      requestInFlight.current = true;
      try {
        const response = await axios.get(`${API_URL}/volunteer/application-status`, {
          params: { userId: user.id },
        });
        if (!active) return;
        const nextRole = response.data?.role;
        const nextStatus = response.data?.volunteerStatus;
        if (typeof nextRole !== "string" || typeof nextStatus !== "string") return;
        if (nextRole === user.role && nextStatus === user.volunteerStatus) return;
        dispatch(applyAccountStatus({ role: nextRole, volunteerStatus: nextStatus }));
      } catch {
        return;
      } finally {
        requestInFlight.current = false;
      }
    };

    refreshStatus();
    const intervalId = window.setInterval(refreshStatus, STATUS_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [dispatch, user?.id, user?.role, user?.volunteerStatus]);

  const signOut = () => {
    dispatch(logout());
    navigate("/", { replace: true });
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content">
          <div className="auth-icon">
            <FaHourglassHalf />
          </div>
          <h1>{t("applicationPending.title")}</h1>
          <p className="login-text">{t("applicationPending.message")}</p>
          <Button color="primary" type="button" onClick={signOut}>
            {t("applicationPending.logout")}
          </Button>
        </div>
      </Container>
    </section>
  );
};

export default ApplicationPending;

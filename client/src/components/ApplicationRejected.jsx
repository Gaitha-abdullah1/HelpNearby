import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button, Container } from "reactstrap";
import { FaTimesCircle } from "react-icons/fa";

import { localizedRejectionReason } from "../bilingualText";
import { logout } from "../features/authSlice";

const API_URL = "http://localhost:5000/api";

const ApplicationRejected = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const [record, setRecord] = useState(null);
  const [reasonReady, setReasonReady] = useState(false);
  const [reasonFailed, setReasonFailed] = useState(false);
  const language = i18n.language?.startsWith("ar") ? "ar" : "en";
  const rejectionReason = localizedRejectionReason(record, language);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;

    axios
      .get(`${API_URL}/volunteer/rejection-reason`, { params: { userId: user.id } })
      .then((response) => {
        if (!active) return;
        setRecord(response.data || null);
        setReasonFailed(false);
        setReasonReady(true);
      })
      .catch(() => {
        if (!active) return;
        setRecord(null);
        setReasonFailed(true);
        setReasonReady(true);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const signOut = () => {
    dispatch(logout());
    navigate("/", { replace: true });
  };

  const reviewedAt = record?.decidedAt
    ? new Date(record.decidedAt).toLocaleString(i18n.language)
    : "";

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content">
          <div className="auth-icon">
            <FaTimesCircle />
          </div>
          <h1>{t("applicationRejected.title")}</h1>
          <p className="login-text">{t("applicationRejected.message")}</p>
          {record?.applicationNumber && (
            <p className="login-text">
              <strong>{t("applicationRejected.cycle")}:</strong>{" "}
              <span dir="ltr">{record.applicationNumber}</span>
            </p>
          )}
          {reviewedAt && (
            <p className="login-text">
              <strong>{t("applicationRejected.reviewedAt")}:</strong>{" "}
              <span dir="ltr">{reviewedAt}</span>
            </p>
          )}
          {reasonReady && (
            <p className="login-text">
              <strong>{t("applicationRejected.reasonLabel")}:</strong>{" "}
              <span dir={language === "ar" ? "rtl" : "ltr"}>
                {reasonFailed
                  ? t("applicationRejected.reasonError")
                  : rejectionReason || t("applicationRejected.reasonFallback")}
              </span>
            </p>
          )}
          <p className="login-text">{t("applicationRejected.future")}</p>
          <div className="help-request-actions">
            <Button color="primary" tag={Link} to="/application-reapply">
              {t("applicationRejected.reapply")}
            </Button>
            <Button type="button" className="dashboard-neutral-button" onClick={signOut}>
              {t("applicationRejected.logout")}
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
};

export default ApplicationRejected;

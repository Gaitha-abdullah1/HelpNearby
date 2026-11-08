import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Container, Form, FormGroup, Input } from "reactstrap";
import { FaEnvelope } from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import verifyEmailSchema from "../validation/verifyEmailSchema";
import {
  verifyEmail,
  resendVerification,
  resetAuth,
} from "../features/authSlice";

const PENDING_VERIFICATION_KEY = "helpnearby-pending-verification";
const toastStyle = { duration: 3000 };

const readNavigationVerification = (state) => {
  const email = typeof state?.email === "string" ? state.email.trim() : "";
  if (!email) return null;

  return {
    email,
    registrationType: state?.isVolunteerRegistration === true ? "volunteer" : "user",
  };
};

const readStoredVerification = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFICATION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const email = typeof parsed?.email === "string" ? parsed.email.trim() : "";
    const registrationType =
      parsed?.registrationType === "volunteer" || parsed?.registrationType === "user"
        ? parsed.registrationType
        : null;

    if (!email && !registrationType) return null;

    return { email, registrationType };
  } catch {
    return null;
  }
};

const storePendingVerification = (pending) => {
  if (!pending?.email) return;

  try {
    sessionStorage.setItem(
      PENDING_VERIFICATION_KEY,
      JSON.stringify({
        email: pending.email,
        registrationType: pending.registrationType,
      }),
    );
  } catch {
    void 0;
  }
};

const clearPendingVerification = () => {
  try {
    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
  } catch {
    void 0;
  }
};

const VerifyEmail = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [pendingVerification] = useState(
    () => readNavigationVerification(location.state) || readStoredVerification(),
  );
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const inputRefs = useRef([]);
  const email = pendingVerification?.email || "";
  const registrationType = pendingVerification?.registrationType || null;
  const registrationLink =
    registrationType === "volunteer"
      ? { to: "/register/volunteer", label: "verifyEmail.backToVolunteerRegistration" }
      : registrationType === "user"
        ? { to: "/register/user", label: "verifyEmail.backToUserRegistration" }
        : { to: "/join-us", label: "verifyEmail.backToRegistration" };

  useEffect(() => {
    const pending = readNavigationVerification(location.state);
    if (pending) storePendingVerification(pending);
  }, [location.state]);

  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((previousTime) => previousTime - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handlePaste = (index, event) => {
    const digits = String(event.clipboardData?.getData("text") || "").replace(/\D/g, "");
    if (!digits) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const nextCode = [...code];
    const available = digits.slice(0, nextCode.length - index);
    available.split("").forEach((digit, offset) => {
      nextCode[index + offset] = digit;
    });
    setCode(nextCode);
    if (error) setError("");
    inputRefs.current[Math.min(index + available.length, nextCode.length - 1)]?.focus();
  };

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) {
      return;
    }

    const newCode = [...code];
    newCode[index] = value;

    setCode(newCode);

    if (error) {
      setError("");
    }

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const translateCode = (group, code, fallback) => {
    const key = `verifyEmail.${group}.${code || fallback}`;
    const message = t(key);
    return message === key ? t(`verifyEmail.${group}.${fallback}`) : message;
  };

  const showErrorToast = (errorCode) => {
    toast.error(translateCode("errors", errorCode, "SERVER_ERROR"), toastStyle);
  };

  const showSuccessToast = (messageCode) => {
    toast.success(
      translateCode("success", messageCode, "VERIFICATION_CODE_RESENT"),
      toastStyle,
    );
  };

  const handleResend = async () => {
    if (isResending || isSubmitting || timeLeft > 0 || !email) {
      return;
    }

    setCode(["", "", "", "", "", ""]);
    setError("");
    setIsResending(true);

    try {
      const result = await dispatch(resendVerification(email));

      if (resendVerification.fulfilled.match(result)) {
        setTimeLeft(50);
        inputRefs.current[0]?.focus();
        showSuccessToast(result.payload?.messageCode);
        return;
      }

      if (resendVerification.rejected.match(result)) {
        showErrorToast(result.payload?.errorCode);
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting || isResending || !email) {
      return;
    }

    const verificationCode = code.join("");

    try {
      await verifyEmailSchema.validate(
        { code: verificationCode },
        { abortEarly: true },
      );
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const result = await dispatch(
        verifyEmail({
          email,
          code: verificationCode,
        }),
      );

      if (verifyEmail.fulfilled.match(result)) {
        clearPendingVerification();
        dispatch(resetAuth());
        showSuccessToast(result.payload?.messageCode || "EMAIL_VERIFIED_SUCCESS");
        navigate("/login");
        return;
      }

      if (verifyEmail.rejected.match(result)) {
        showErrorToast(result.payload?.errorCode);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content verify-email">
          <BackButton to="/login" />

          <div className="auth-icon">
            <FaEnvelope />
          </div>

          <h1>{t("verifyEmail.title")}</h1>

          <p className="verify-email-text">{t("verifyEmail.description")}</p>

          {email ? (
            <>
              <Form className="auth-form" onSubmit={handleSubmit} noValidate>
                <FormGroup>
                  <div className="verification-code">
                    {code.map((digit, index) => (
                      <Input
                        key={index}
                        innerRef={(element) => {
                          inputRefs.current[index] = element;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength="1"
                        value={digit}
                        onChange={(event) =>
                          handleChange(index, event.target.value)
                        }
                        onPaste={(event) => handlePaste(index, event)}
                        onKeyDown={(event) => handleKeyDown(index, event)}
                        invalid={!!error}
                        disabled={isSubmitting || isResending}
                      />
                    ))}
                  </div>

                  {error && (
                    <div className="form-error text-center">{t(error)}</div>
                  )}
                </FormGroup>

                <Button
                  color="primary"
                  type="submit"
                  className="auth-button"
                  disabled={isSubmitting || isResending}
                >
                  {isSubmitting ? t("verifyEmail.verifying") : t("verifyEmail.button")}
                </Button>
              </Form>

              <p className="auth-footer resend-text">
                {timeLeft > 0 ? (
                  <>
                    {t("verifyEmail.resendIn")} <strong>{timeLeft}s</strong>
                  </>
                ) : (
                  <>
                    {t("verifyEmail.noCode")}{" "}
                    <button
                      type="button"
                      className="resend-button"
                      onClick={handleResend}
                      disabled={isResending || isSubmitting}
                    >
                      {isResending ? t("verifyEmail.resending") : t("verifyEmail.resend")}
                    </button>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="form-error text-center">{t("verifyEmail.missingEmail")}</p>
              <Button
                color="primary"
                tag={Link}
                to={registrationLink.to}
                className="auth-button"
              >
                {t(registrationLink.label)}
              </Button>
            </>
          )}
        </div>
      </Container>
    </section>
  );
};

export default VerifyEmail;

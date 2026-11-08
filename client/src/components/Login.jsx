import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Container, Form, FormGroup, Input, Label } from "reactstrap";
import { FaSignInAlt, FaEye, FaEyeSlash } from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import loginSchema from "../validation/loginSchema";
import { login } from "../features/authSlice";

const toastStyle = { duration: 3000 };

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    if (!location.state?.accountBlocked) return;
    sessionStorage.setItem("helpnearby-account-blocked-notice", "1");
    setBlockedNotice(true);
    toast.error(t("login.errors.ACCOUNT_BLOCKED"), toastStyle);
    navigate("/login", { replace: true, state: null });
  }, [location.state, navigate, t, toastStyle]);
  const [showPassword, setShowPassword] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState(() => {
    if (sessionStorage.getItem("helpnearby-account-blocked-notice") === "1") {
      sessionStorage.removeItem("helpnearby-account-blocked-notice");
      return true;
    }
    return Boolean(location.state?.accountBlocked);
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(loginSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  const onSubmit = async (data) => {
    const result = await dispatch(login(data));

    if (login.fulfilled.match(result)) {
      const role = result.payload?.user?.role;
      const volunteerStatus = result.payload?.user?.volunteerStatus;

      if (role === "admin") {
        navigate("/admin");
      } else if (role === "volunteer" && volunteerStatus === "approved") {
        navigate("/volunteer");
      } else if (role === "user" && volunteerStatus === "rejected") {
        navigate("/application-rejected");
      } else if (role === "user" && volunteerStatus === "pending") {
        navigate("/application-pending");
      } else if (role === "user") {
        navigate("/user");
      } else if (role === "volunteer") {
        navigate("/volunteer");
      } else {
        navigate("/");
      }

      return;
    }

    if (login.rejected.match(result)) {
      const errorCode = result.payload?.errorCode || "SERVER_ERROR";
      if (errorCode === "ACCOUNT_BLOCKED") setBlockedNotice(true);
      toast.error(t(`login.errors.${errorCode}`), toastStyle);
    }
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content">
          <BackButton to="/" />

          <div className="auth-icon">
            <FaSignInAlt />
          </div>

          <h1>{t("login.title")}</h1>
          {blockedNotice && (
            <p className="form-error" role="alert">{t("login.errors.ACCOUNT_BLOCKED")}</p>
          )}

          <Form
            className="auth-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <FormGroup>
              <Label for="email">{t("login.email")}</Label>

              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    placeholder={t("login.emailPlaceholder")}
                    invalid={!!errors.email}
                  />
                )}
              />

              {errors.email && (
                <div className="form-error">{t(errors.email.message)}</div>
              )}
            </FormGroup>

            <FormGroup>
              <Label for="password">{t("login.password")}</Label>

              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <div className="auth-password-input">
                    <Input
                      {...field}
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={t("login.passwordPlaceholder")}
                      invalid={!!errors.password}
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      title={t(showPassword ? "dashboard.hidePassword" : "dashboard.showPassword")}
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                )}
              />

              {errors.password && (
                <div className="form-error">{t(errors.password.message)}</div>
              )}
            </FormGroup>

            <div className="login-options">
              <div className="remember-me">
                <Controller
                  name="rememberMe"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="rememberMe"
                      type="checkbox"
                      name={field.name}
                      checked={field.value}
                      onBlur={field.onBlur}
                      onChange={(event) =>
                        field.onChange(event.target.checked)
                      }
                      innerRef={field.ref}
                    />
                  )}
                />

                <Label for="rememberMe">{t("login.rememberMe")}</Label>
              </div>

              <Link to="/forgot-password">{t("login.forgotPassword")}</Link>
            </div>

            <Button color="primary" type="submit" className="auth-button">
              {t("login.button")}
            </Button>
          </Form>

          <p className="auth-footer">
            {t("login.noAccount")}
            <Link to="/join-us">{t("login.register")}</Link>
          </p>
        </div>
      </Container>
    </section>
  );
};

export default Login;

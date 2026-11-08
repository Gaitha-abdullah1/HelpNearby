import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Col,
  Container,
  Form,
  FormGroup,
  Input,
  Label,
  Row,
} from "reactstrap";
import { FaUserPlus, FaEye, FaEyeSlash } from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import registerUserSchema from "../validation/registerUserSchema";
import { register, resetAuth } from "../features/authSlice";

const RegisterUser = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [visiblePasswords, setVisiblePasswords] = useState({});

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(registerUserSchema),
    mode: "onChange",
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data) => {
    const result = await dispatch(register(data));

    if (register.fulfilled.match(result)) {
      dispatch(resetAuth());

      navigate("/verify-email", {
        state: {
          email: data.email,
        },
      });

      return;
    }

    if (register.rejected.match(result)) {
      const errorCode = result.payload?.errorCode || "SERVER_ERROR";

      toast.error(t(`registerUser.errors.${errorCode}`), { duration: 3000 });
    }
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content register-user">
          <BackButton to="/join-us" />

          <div className="auth-icon">
            <FaUserPlus />
          </div>

          <h1>{t("registerUser.title")}</h1>

          <Form
            className="auth-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label for="fullName">{t("registerUser.fullName")}</Label>

                  <Controller
                    name="fullName"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="fullName"
                        type="text"
                        placeholder={t("registerUser.fullNamePlaceholder")}
                        invalid={!!errors.fullName}
                      />
                    )}
                  />

                  {errors.fullName && (
                    <div className="form-error">
                      {t(errors.fullName.message)}
                    </div>
                  )}
                </FormGroup>
              </Col>

              <Col md="6">
                <FormGroup>
                  <Label for="email">{t("registerUser.email")}</Label>

                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="email"
                        type="email"
                        placeholder={t("registerUser.emailPlaceholder")}
                        invalid={!!errors.email}
                      />
                    )}
                  />

                  {errors.email && (
                    <div className="form-error">{t(errors.email.message)}</div>
                  )}
                </FormGroup>
              </Col>

              <Col md="6">
                <FormGroup>
                  <Label for="password">{t("registerUser.password")}</Label>

                  <Controller
                    name="password"
                    control={control}
                    render={({ field }) => (
                      <div className="auth-password-input">
                        <Input
                          {...field}
                          id="password"
                          type={visiblePasswords.password ? "text" : "password"}
                          placeholder={t("registerUser.passwordPlaceholder")}
                          invalid={!!errors.password}
                        />
                        <button
                          type="button"
                          className="auth-password-toggle"
                          onClick={() => setVisiblePasswords((current) => ({ ...current, password: !current.password }))}
                          title={t(visiblePasswords.password ? "dashboard.hidePassword" : "dashboard.showPassword")}
                        >
                          {visiblePasswords.password ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      </div>
                    )}
                  />

                  {errors.password && (
                    <div className="form-error">
                      {t(errors.password.message)}
                    </div>
                  )}
                </FormGroup>
              </Col>

              <Col md="6">
                <FormGroup>
                  <Label for="confirmPassword">
                    {t("registerUser.confirmPassword")}
                  </Label>

                  <Controller
                    name="confirmPassword"
                    control={control}
                    render={({ field }) => (
                      <div className="auth-password-input">
                        <Input
                          {...field}
                          id="confirmPassword"
                          type={visiblePasswords.confirmPassword ? "text" : "password"}
                          placeholder={t("registerUser.confirmPasswordPlaceholder")}
                          invalid={!!errors.confirmPassword}
                        />
                        <button
                          type="button"
                          className="auth-password-toggle"
                          onClick={() => setVisiblePasswords((current) => ({ ...current, confirmPassword: !current.confirmPassword }))}
                          title={t(visiblePasswords.confirmPassword ? "dashboard.hidePassword" : "dashboard.showPassword")}
                        >
                          {visiblePasswords.confirmPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      </div>
                    )}
                  />

                  {errors.confirmPassword && (
                    <div className="form-error">
                      {t(errors.confirmPassword.message)}
                    </div>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <Button color="primary" type="submit" className="auth-button">
              {t("registerUser.button")}
            </Button>
          </Form>

          <p className="auth-footer">
            {t("registerUser.haveAccount")}{" "}
            <Link to="/login">{t("registerUser.login")}</Link>
          </p>
        </div>
      </Container>
    </section>
  );
};

export default RegisterUser;

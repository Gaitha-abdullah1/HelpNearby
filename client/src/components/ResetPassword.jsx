import { useTranslation } from "react-i18next";
import { Button, Container, Form, FormGroup, Input, Label } from "reactstrap";
import { FaLock } from "react-icons/fa";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import resetPasswordSchema from "../validation/resetPasswordSchema";
import { resetPassword } from "../features/authSlice";

const ResetPassword = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = new URLSearchParams(location.search).get("token");

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(resetPasswordSchema),
    mode: "onChange",
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data) => {
    const result = await dispatch(
      resetPassword({
        token,
        password: data.newPassword,
      }),
    );
    if (resetPassword.fulfilled.match(result)) {
      toast.success(t("resetPassword.success"), { duration: 3000 });

      navigate("/login");
      return;
    }

    if (resetPassword.rejected.match(result)) {
      const errorCode = result.payload?.errorCode || "SERVER_ERROR";
      const translatedErrorCode = [
        "INVALID_RESET_TOKEN",
        "RESET_TOKEN_EXPIRED",
        "INVALID_RESET_REQUEST",
      ].includes(errorCode)
        ? errorCode
        : "SERVER_ERROR";

      toast.error(t(`resetPassword.errors.${translatedErrorCode}`), { duration: 3000 });
    }
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content">
          <BackButton to="/login" />

          <div className="auth-icon">
            <FaLock />
          </div>

          <h1>{t("resetPassword.title")}</h1>

          <Form
            className="auth-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <FormGroup>
              <Label for="newPassword">{t("resetPassword.newPassword")}</Label>

              <Controller
                name="newPassword"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="newPassword"
                    type="password"
                    placeholder={t("resetPassword.newPasswordPlaceholder")}
                    invalid={!!errors.newPassword}
                  />
                )}
              />

              {errors.newPassword && (
                <div className="form-error">
                  {t(errors.newPassword.message)}
                </div>
              )}
            </FormGroup>

            <FormGroup>
              <Label for="confirmPassword">
                {t("resetPassword.confirmPassword")}
              </Label>

              <Controller
                name="confirmPassword"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="confirmPassword"
                    type="password"
                    placeholder={t("resetPassword.confirmPasswordPlaceholder")}
                    invalid={!!errors.confirmPassword}
                  />
                )}
              />

              {errors.confirmPassword && (
                <div className="form-error">
                  {t(errors.confirmPassword.message)}
                </div>
              )}
            </FormGroup>

            <Button color="primary" type="submit" className="auth-button">
              {t("resetPassword.button")}
            </Button>
          </Form>

          <p className="auth-footer">
            <Link to="/login">{t("resetPassword.backToLogin")}</Link>
          </p>
        </div>
      </Container>
    </section>
  );
};

export default ResetPassword;

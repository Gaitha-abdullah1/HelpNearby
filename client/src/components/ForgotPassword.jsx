import { useTranslation } from "react-i18next";
import { Button, Container, Form, FormGroup, Input, Label } from "reactstrap";
import { FaKey } from "react-icons/fa";
import { Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import forgotPasswordSchema from "../validation/forgotPasswordSchema";
import { forgotPassword } from "../features/authSlice";

const ForgotPassword = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(forgotPasswordSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data) => {
    const result = await dispatch(forgotPassword(data));

    if (forgotPassword.fulfilled.match(result)) {
      toast.success(
        t(
          `forgotPassword.success.${result.payload?.messageCode || "PASSWORD_RESET_EMAIL_SENT"}`,
        ),
        { duration: 3000 },
      );

      return;
    }

    if (forgotPassword.rejected.match(result)) {
      const errorCode = result.payload?.errorCode || "SERVER_ERROR";

      toast.error(t(`forgotPassword.errors.${errorCode}`), { duration: 3000 });
    }
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content">
          <BackButton to="/login" />

          <div className="auth-icon">
            <FaKey />
          </div>

          <h1>{t("forgotPassword.title")}</h1>

          <Form
            className="auth-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <FormGroup>
              <Label for="email">{t("forgotPassword.email")}</Label>

              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    placeholder={t("forgotPassword.emailPlaceholder")}
                    invalid={!!errors.email}
                  />
                )}
              />

              {errors.email && (
                <div className="form-error">{t(errors.email.message)}</div>
              )}
            </FormGroup>

            <Button color="primary" type="submit" className="auth-button">
              {t("forgotPassword.button")}
            </Button>
          </Form>

          <p className="auth-footer">
            <Link to="/login">{t("forgotPassword.backToLogin")}</Link>
          </p>
        </div>
      </Container>
    </section>
  );
};

export default ForgotPassword;

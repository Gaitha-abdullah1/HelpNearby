import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Col, Container, Form, FormGroup, Input, Label, Row } from "reactstrap";
import { FaHandsHelping } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import * as yup from "yup";
import { digitsOnly } from "../digits";
import registerVolunteerSchema from "../validation/registerVolunteerSchema";
import { storedSkillList } from "../skills";
import { reapplyVolunteer } from "../features/authSlice";
import SkillCheckboxList from "./SkillCheckboxList";

const reapplySchema = registerVolunteerSchema.pick(["phone", "skills"]).shape({
  dateOfBirth: yup
    .string()
    .required("validation.dateOfBirth.required")
    .matches(/^\d{4}-\d{2}-\d{2}$/, "validation.dateOfBirth.invalid")
    .test("minimum-age", "validation.dateOfBirth.age", (value) => {
      if (!value) return false;
      const [year, month, day] = value.split("-").map(Number);
      const today = new Date();
      let age = today.getFullYear() - year;
      const monthDifference = today.getMonth() + 1 - month;
      if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < day)) age -= 1;
      return age >= 18;
    }),
});

const toDateInputValue = (value) => {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const ReapplyVolunteer = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(reapplySchema),
    mode: "onChange",
    defaultValues: {
      phone: user?.phone || "",
      skills: storedSkillList(user?.skills),
      dateOfBirth: toDateInputValue(user?.dateOfBirth),
    },
  });

  const onSubmit = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    const result = await dispatch(reapplyVolunteer({
      phone: data.phone.trim(),
      skills: storedSkillList(data.skills),
      dateOfBirth: data.dateOfBirth,
    }));
    setSubmitting(false);
    if (reapplyVolunteer.fulfilled.match(result)) {
      navigate("/application-pending", { replace: true });
      return;
    }
    const errorCode = result.payload?.errorCode || "SERVER_ERROR";
    const key = `applicationReapply.errors.${errorCode}`;
    const message = t(key);
    toast.error(message === key ? t("applicationReapply.errors.SERVER_ERROR") : message);
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content volunteer-register">
          <BackButton to="/application-rejected" label={t("applicationReapply.back")} />
          <div className="auth-icon">
            <FaHandsHelping />
          </div>
          <h1>{t("applicationReapply.title")}</h1>
          <p className="login-text">{t("applicationReapply.intro")}</p>
          <Form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label for="reapplyName">{t("applicationReapply.name")}</Label>
                  <Input id="reapplyName" value={user?.fullName || ""} readOnly />
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="reapplyEmail">{t("applicationReapply.email")}</Label>
                  <Input id="reapplyEmail" value={user?.email || ""} readOnly dir="ltr" />
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="reapplyPhone">{t("registerVolunteer.phone")}</Label>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="reapplyPhone"
                        type="tel"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={8}
                        invalid={Boolean(errors.phone)}
                        onChange={(event) => field.onChange(digitsOnly(event.target.value, 8))}
                      />
                    )}
                  />
                  {errors.phone && <div className="form-error">{t(errors.phone.message)}</div>}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label for="reapplyDob">{t("registerVolunteer.dateOfBirth")}</Label>
                  <Controller
                    name="dateOfBirth"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="reapplyDob"
                        type="date"
                        dir="ltr"
                        invalid={Boolean(errors.dateOfBirth)}
                      />
                    )}
                  />
                  {errors.dateOfBirth && (
                    <div className="form-error">{t(errors.dateOfBirth.message)}</div>
                  )}
                </FormGroup>
              </Col>
              <Col md="12">
                <FormGroup>
                  <Label id="reapplySkillsLabel">{t("registerVolunteer.skills")}</Label>
                  <Controller
                    name="skills"
                    control={control}
                    render={({ field }) => (
                      <SkillCheckboxList
                        id="reapply-skills"
                        labelId="reapplySkillsLabel"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={Boolean(errors.skills)}
                      />
                    )}
                  />
                  {errors.skills && <div className="form-error">{t(errors.skills.message)}</div>}
                </FormGroup>
              </Col>
            </Row>
            <Button color="primary" type="submit" disabled={submitting}>
              {t(submitting ? "applicationReapply.submitting" : "applicationReapply.submit")}
            </Button>
          </Form>
        </div>
      </Container>
    </section>
  );
};

export default ReapplyVolunteer;

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DayPicker } from "@daypicker/react";
import { ar } from "@daypicker/react/locale/ar";
import { enUS } from "@daypicker/react/locale/en-US";
import "@daypicker/react/style.css";
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
import {
  FaHandsHelping,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import BackButton from "./BackButton";
import { digitsOnly } from "../digits";
import registerVolunteerSchema from "../validation/registerVolunteerSchema";
import { registerVolunteer } from "../features/authSlice";
import SkillCheckboxList from "./SkillCheckboxList";

const getLatestSelectableBirthDate = (today) => {
  const year = today.getFullYear() - 18;
  const month = today.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  return new Date(year, month, Math.min(today.getDate(), lastDayOfMonth));
};

const MINIMUM_BIRTH_YEAR = 1900;

const createLocalMonth = (year, month) => {
  const date = new Date(0);
  date.setFullYear(year, month, 1);
  return date;
};

const getDateOnlyValue = (date) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

const RegisterVolunteer = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const latestSelectableBirthDate = getLatestSelectableBirthDate(currentDate);
  const earliestSelectableMonth = createLocalMonth(MINIMUM_BIRTH_YEAR, 0);
  const latestNavigationMonth = createLocalMonth(currentYear, 11);
  const minimumBirthDateValue = getDateOnlyValue(earliestSelectableMonth);
  const maximumBirthDateValue = getDateOnlyValue(latestSelectableBirthDate);
  const isBirthDateDisabled = (date) => {
    const dateValue = getDateOnlyValue(date);
    return (
      dateValue < minimumBirthDateValue ||
      dateValue > getDateOnlyValue(currentDate)
    );
  };
  const [openPicker, setOpenPicker] = useState(null);
  const [invalidDateAttempt, setInvalidDateAttempt] = useState(false);
  const [calendarView, setCalendarView] = useState("day");
  const [calendarMonth, setCalendarMonth] = useState(latestNavigationMonth);
  const datePickerRef = useRef(null);
  const selectedYearRef = useRef(null);
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  useEffect(() => {
    if (!openPicker) return undefined;

    const handlePointerDown = (event) => {
      if (!datePickerRef.current?.contains(event.target)) {
        setOpenPicker(null);
      }
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

  const formatDateValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateValue = (value) => {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const openDatePicker = (value) => {
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
    const boundedYear = Math.max(
      MINIMUM_BIRTH_YEAR,
      Math.min(year, currentYear),
    );
    const month = calendarMonth.getMonth();
    setCalendarMonth(createLocalMonth(boundedYear, month));
    setCalendarView("day");
  };

  const changeCalendarMonthName = (month) => {
    setCalendarMonth(createLocalMonth(calendarMonth.getFullYear(), month));
    setCalendarView("day");
  };

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(registerVolunteerSchema),
    mode: "onChange",
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      skills: [],
      dateOfBirth: "",
    },
  });

  const onSubmit = async (data) => {
    if (invalidDateAttempt) {
      setError("dateOfBirth", {
        type: "manual",
        message: "validation.dateOfBirth.ageSelection",
      });
      return;
    }

    const result = await dispatch(registerVolunteer(data));

    if (registerVolunteer.fulfilled.match(result)) {
      navigate("/verify-email", {
        state: {
          email: data.email,
          isVolunteerRegistration: true,
        },
      });

      return;
    }

    if (registerVolunteer.rejected.match(result)) {
      const errorCode = result.payload?.errorCode || "SERVER_ERROR";

      toast.error(t(`registerVolunteer.errors.${errorCode}`), { duration: 3000 });
    }
  };

  return (
    <section className="auth-page">
      <Container className="auth-container">
        <div className="auth-content volunteer-register">
          <BackButton to="/join-us" />

          <div className="auth-icon">
            <FaHandsHelping />
          </div>

          <h1>{t("registerVolunteer.title")}</h1>

          <Form
            className="auth-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label for="fullName">
                    {t("registerVolunteer.fullName")}
                  </Label>

                  <Controller
                    name="fullName"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="fullName"
                        type="text"
                        placeholder={t("registerVolunteer.fullNamePlaceholder")}
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
                  <Label for="email">{t("registerVolunteer.email")}</Label>

                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="email"
                        type="email"
                        placeholder={t("registerVolunteer.emailPlaceholder")}
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
                  <Label for="password">
                    {t("registerVolunteer.password")}
                  </Label>

                  <Controller
                    name="password"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="password"
                        type="password"
                        placeholder={t("registerVolunteer.passwordPlaceholder")}
                        invalid={!!errors.password}
                      />
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
                    {t("registerVolunteer.confirmPassword")}
                  </Label>

                  <Controller
                    name="confirmPassword"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="confirmPassword"
                        type="password"
                        placeholder={t(
                          "registerVolunteer.confirmPasswordPlaceholder",
                        )}
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
              </Col>

              <Col md="6">
                <FormGroup>
                  <Label for="phone">{t("registerVolunteer.phone")}</Label>

                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder={t("registerVolunteer.phonePlaceholder")}
                        invalid={!!errors.phone}
                        onChange={(event) => field.onChange(digitsOnly(event.target.value, 8))}
                      />
                    )}
                  />

                  {errors.phone && (
                    <div className="form-error">{t(errors.phone.message)}</div>
                  )}
                </FormGroup>
              </Col>

              <Col md="6">
                <FormGroup>
                  <Label for="dateOfBirth">
                    {t("registerVolunteer.dateOfBirth")}
                  </Label>

                  <Controller
                    name="dateOfBirth"
                    control={control}
                    render={({ field }) => {
                      const selectedDate = parseDateValue(field.value);

                      return (
                        <div
                          className={`register-picker${openPicker === "date" ? " is-open" : ""}`}
                          ref={datePickerRef}
                        >
                          <button
                            id="dateOfBirth"
                            ref={field.ref}
                            type="button"
                            className={`form-control register-picker-trigger${errors.dateOfBirth ? " is-invalid" : ""}`}
                            onBlur={field.onBlur}
                            onClick={() => openDatePicker(field.value)}
                          >
                            <span
                              className={`register-date-value${field.value ? "" : " register-date-placeholder"}`}
                            >
                              {field.value
                                ? `${field.value.slice(5, 7)}/${field.value.slice(8, 10)}/${field.value.slice(0, 4)}`
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
                                  disabled={
                                    calendarMonth <= earliestSelectableMonth
                                  }
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
                                  disabled={
                                    calendarMonth >= latestNavigationMonth
                                  }
                                >
                                  <FaChevronRight />
                                </button>
                              </div>

                              {calendarView === "year" ? (
                                <div className="register-calendar-year-view">
                                  <div className="register-calendar-view-title">
                                    {locale === "ar"
                                      ? "\u0627\u0644\u0633\u0646\u0629"
                                      : "Year"}
                                  </div>
                                  <div className="register-calendar-year-list">
                                    {Array.from(
                                      {
                                        length:
                                          currentYear - MINIMUM_BIRTH_YEAR + 1,
                                      },
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
                                    {locale === "ar"
                                      ? "\u0627\u0644\u0634\u0647\u0631"
                                      : "Month"}
                                  </div>
                                  <div className="register-calendar-month-grid">
                                    {Array.from({ length: 12 }, (_, month) => {
                                      return (
                                        <button
                                          key={month}
                                          type="button"
                                          className={`register-calendar-month${month === calendarMonth.getMonth() ? " is-selected" : ""}`}
                                          onClick={() =>
                                            changeCalendarMonthName(month)
                                          }
                                        >
                                          {new Intl.DateTimeFormat(
                                            locale === "ar" ? "ar" : "en-US",
                                            { month: "short" },
                                          ).format(new Date(2024, month, 1))}
                                        </button>
                                      );
                                    })}
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

                                    if (
                                      getDateOnlyValue(date) >
                                      maximumBirthDateValue
                                    ) {
                                      setInvalidDateAttempt(true);
                                      setError("dateOfBirth", {
                                        type: "manual",
                                        message: "validation.dateOfBirth.ageSelection",
                                      });
                                      return;
                                    }

                                    setInvalidDateAttempt(false);
                                    clearErrors("dateOfBirth");
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

                  {errors.dateOfBirth && (
                    <div className="form-error">
                      {t(errors.dateOfBirth.message)}
                    </div>
                  )}
                </FormGroup>
              </Col>

              <Col md="12">
                <FormGroup>
                  <Label id="skillsLabel">{t("registerVolunteer.skills")}</Label>

                  <Controller
                    name="skills"
                    control={control}
                    render={({ field }) => (
                      <SkillCheckboxList
                        id="skills"
                        labelId="skillsLabel"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={!!errors.skills}
                      />
                    )}
                  />

                  {errors.skills && (
                    <div className="form-error">{t(errors.skills.message)}</div>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <Button color="primary" type="submit" className="auth-button">
              {t("registerVolunteer.button")}
            </Button>
          </Form>

          <p className="auth-footer">
            {t("registerVolunteer.haveAccount")}{" "}
            <Link to="/login">{t("registerVolunteer.login")}</Link>
          </p>
        </div>
      </Container>
    </section>
  );
};

export default RegisterVolunteer;

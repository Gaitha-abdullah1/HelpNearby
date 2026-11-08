import { FaArrowLeft } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

const historyIndex = () => {
  const index = window.history.state?.idx;
  return typeof index === "number" ? index : 0;
};

const BackButton = ({
  to,
  fallback = "/",
  onBack,
  hideWithoutHistory = false,
  className = "",
  label,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasHistory = historyIndex() > 0;
  const accessibleName = label || t("common.back");

  if (hideWithoutHistory && !onBack && !to && !hasHistory) {
    return null;
  }

  const classNames = `back-button ${className}`.trim();
  const icon = <FaArrowLeft aria-hidden="true" />;

  if (to) {
    return (
      <Link to={to} className={classNames} aria-label={accessibleName}>
        {icon}
      </Link>
    );
  }

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (hasHistory) {
      navigate(-1);
      return;
    }

    navigate(fallback);
  };

  return (
    <button
      type="button"
      className={classNames}
      aria-label={accessibleName}
      onClick={goBack}
    >
      {icon}
    </button>
  );
};

export default BackButton;

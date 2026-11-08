import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { toggleTheme } from "../features/themeSlice";
import { Button } from "reactstrap";
import { FaMoon, FaSun } from "react-icons/fa";

const ThemeToggle = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const mode = useSelector((state) => state.theme.mode);
  const label = mode === "light" ? t("common.switchToDark") : t("common.switchToLight");

  return (
    <Button
      className={`theme-button ${
        mode === "light" ? "light-button" : "dark-button"
      }`}
      onClick={() => dispatch(toggleTheme())}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{mode === "light" ? <FaMoon /> : <FaSun />}</span>
    </Button>
  );
};

export default ThemeToggle;

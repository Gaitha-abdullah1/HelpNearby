import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { toggleLanguage } from "../features/languageSlice";
import { Button } from "reactstrap";
import { FaGlobe } from "react-icons/fa";

const LanguageToggle = () => {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const label = t("common.switchLanguage");

  return (
    <Button
      className="theme-button language-button"
      onClick={() => dispatch(toggleLanguage())}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">
        <FaGlobe />
      </span>
    </Button>
  );
};

export default LanguageToggle;

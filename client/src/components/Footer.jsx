import { useTranslation } from "react-i18next";

const Footer = () => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <p>
        &copy; {year} {t("footer.brand")} - {t("footer.rights")}
      </p>
    </footer>
  );
};

export default Footer;

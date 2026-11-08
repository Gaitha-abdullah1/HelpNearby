import { useTranslation } from "react-i18next";
import { Button, Container } from "reactstrap";
import { FaExclamationTriangle } from "react-icons/fa";
import { Link } from "react-router-dom";
import BackButton from "./BackButton";

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <section className="not-found-page">
      <Container className="not-found-container">
        <div className="not-found-content">
          <BackButton fallback="/" hideWithoutHistory />
          <div className="not-found-icon">
            <FaExclamationTriangle />
          </div>

          <h1>404</h1>

          <h2>{t("notFound.title")}</h2>

          <p>{t("notFound.description")}</p>

          <Button
            tag={Link}
            to="/"
            color="primary"
            className="not-found-button"
          >
            <span>{t("notFound.button")}</span>
          </Button>
        </div>
      </Container>
    </section>
  );
};

export default NotFound;

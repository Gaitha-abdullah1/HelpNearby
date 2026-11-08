import { useTranslation } from "react-i18next";
import { Button, Container } from "reactstrap";
import { FaUsers } from "react-icons/fa";
import { Link } from "react-router-dom";

import BackButton from "./BackButton";

const JoinUs = () => {
  const { t } = useTranslation();

  return (
    <section className="join-us">
      <Container className="join-us-container">
        <div className="join-us-content">
          <BackButton to="/" />

          <div className="join-us-icon">
            <FaUsers />
          </div>

          <h1>{t("joinUs.title")}</h1>

          <div className="join-us-options">
            <Button
              color="primary"
              className="join-option"
              tag={Link}
              to="/register/user"
            >
              <span>{t("joinUs.user")}</span>
            </Button>

            <Button
              color="primary"
              className="join-option"
              tag={Link}
              to="/register/volunteer"
            >
              <span>{t("joinUs.volunteer")}</span>
            </Button>
          </div>

          <p className="login-text">
            {t("joinUs.haveAccount")}{" "}
            <Link to="/login">{t("joinUs.login")}</Link>
          </p>
        </div>
      </Container>
    </section>
  );
};

export default JoinUs;

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Container, Row, Col } from "reactstrap";
import logo from "../assets/logo.png";
import getStarted from "../assets/get-started.png";

const GetStarted = () => {
  const { t } = useTranslation();

  return (
    <section className="get-started">
      <Container>
        <Row className="align-items-center justify-content-center gx-lg-5">
          <Col md="6" className="get-started-content text-center">
            <img src={logo} alt="HelpNearby" className="get-started-logo" />

            <h1>{t("getStarted.title")}</h1>

            <p>{t("getStarted.description")}</p>

            <Button
              color="primary"
              className="get-started-button"
              tag={Link}
              to="/join-us"
            >
              {t("getStarted.button")}
            </Button>

            <p className="login-text">
              {t("getStarted.haveAccount")}{" "}
              <Link to="/login">{t("getStarted.login")}</Link>
            </p>
          </Col>

          <Col md="5" className="text-center">
            <img
              src={getStarted}
              alt="HelpNearby"
              className="get-started-image"
            />
          </Col>
        </Row>
      </Container>
    </section>
  );
};

export default GetStarted;

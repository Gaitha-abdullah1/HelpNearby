import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";

import {
  GUIDE_STEPS,
  dismissGuide,
  isGuideDismissed,
  shouldAutoOpenGuide,
} from "../userGuide";

const UserGuide = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);
  const userId = user?.id ? String(user.id) : "";
  const role = typeof user?.role === "string" ? user.role : "";
  const [manualOpen, setManualOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissedFor, setDismissedFor] = useState("");
  const [guideUserId, setGuideUserId] = useState(userId);

  if (guideUserId !== userId) {
    setGuideUserId(userId);
    setStep(0);
    setManualOpen(false);
  }

  useEffect(() => {
    const openGuide = () => {
      setStep(0);
      setManualOpen(true);
    };
    window.addEventListener("helpnearby-guide", openGuide);
    return () => window.removeEventListener("helpnearby-guide", openGuide);
  }, []);

  const dismissed =
    dismissedFor === userId || isGuideDismissed(window.localStorage, userId);
  const open =
    Boolean(userId) &&
    role === "user" &&
    (manualOpen ||
      shouldAutoOpenGuide({
        userId,
        role,
        pathname: location.pathname,
        dismissed,
      }));
  const stepId = GUIDE_STEPS[step] || GUIDE_STEPS[0];
  const lastStep = step >= GUIDE_STEPS.length - 1;

  const closeGuide = () => {
    dismissGuide(window.localStorage, userId);
    setDismissedFor(userId);
    setManualOpen(false);
    setStep(0);
  };

  if (!open) return null;

  return (
    <Modal
      isOpen
      toggle={closeGuide}
      fade={false}
      centered
      labelledBy="user-guide-title"
      className="dashboard-modal-dialog"
      contentClassName="dashboard-modal-content user-guide-dialog"
      returnFocusAfterClose
    >
      <ModalHeader toggle={closeGuide} closeAriaLabel={t("userGuide.close")}>
        <span id="user-guide-title">{t("userGuide.title")}</span>
      </ModalHeader>
      <ModalBody>
        <p className="user-guide-progress" aria-live="polite">
          {t("userGuide.progress", { current: step + 1, total: GUIDE_STEPS.length })}
        </p>
        <div className="user-guide-dots" aria-hidden="true">
          {GUIDE_STEPS.map((id, index) => (
            <span key={id} className={index === step ? "is-current" : undefined} />
          ))}
        </div>
        <h3 className="user-guide-step-title">{t(`userGuide.steps.${stepId}.title`)}</h3>
        <p className="user-guide-copy">{t(`userGuide.steps.${stepId}.body`)}</p>
      </ModalBody>
      <ModalFooter className="dashboard-modal-actions user-guide-actions">
        <Button
          type="button"
          className="dashboard-action-button dashboard-neutral-button"
          onClick={closeGuide}
        >
          {t("userGuide.close")}
        </Button>
        <Button
          type="button"
          className="dashboard-action-button dashboard-neutral-button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          {t("userGuide.previous")}
        </Button>
        {lastStep ? (
          <Button
            type="button"
            className="dashboard-action-button dashboard-password-open-button"
            onClick={closeGuide}
          >
            {t("userGuide.finish")}
          </Button>
        ) : (
          <Button
            type="button"
            className="dashboard-action-button dashboard-password-open-button"
            onClick={() => setStep((current) => Math.min(GUIDE_STEPS.length - 1, current + 1))}
          >
            {t("userGuide.next")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default UserGuide;

import { useTranslation } from "react-i18next";
import { FaCheck, FaCircle, FaRegCircle, FaTimes } from "react-icons/fa";

const PROGRESS_STEPS = ["pending", "accepted", "in-progress", "completed"];

const RequestTimeline = ({ status }) => {
  const { t } = useTranslation();

  if (status === "cancelled") {
    return (
      <ol className="request-timeline is-cancelled">
        <li className="is-done">
          <span className="timeline-icon" aria-hidden="true"><FaCheck /></span>
          <span>{t("helpRequests.timeline.pending")}</span>
        </li>
        <li className="is-cancelled-step">
          <span className="timeline-icon" aria-hidden="true"><FaTimes /></span>
          <span>{t("helpRequests.timeline.cancelled")}</span>
        </li>
      </ol>
    );
  }

  if (status === "rejected") {
    return (
      <ol className="request-timeline is-rejected">
        <li className="is-done">
          <span className="timeline-icon" aria-hidden="true"><FaCheck /></span>
          <span>{t("helpRequests.timeline.pending")}</span>
        </li>
        <li className="is-rejected-step">
          <span className="timeline-icon" aria-hidden="true"><FaTimes /></span>
          <span>{t("helpRequests.timeline.rejected")}</span>
        </li>
      </ol>
    );
  }

  const currentIndex = PROGRESS_STEPS.indexOf(status);

  return (
    <ol className="request-timeline">
      {PROGRESS_STEPS.map((step, index) => {
        const stepState =
          status === "completed" || index < currentIndex
            ? "done"
            : index === currentIndex
              ? "current"
              : "upcoming";
        const Icon = stepState === "done" ? FaCheck : stepState === "current" ? FaCircle : FaRegCircle;

        return (
          <li key={step} className={`is-${stepState}`}>
            <span className="timeline-icon" aria-hidden="true"><Icon /></span>
            <span>{t(`helpRequests.timeline.${step}`)}</span>
          </li>
        );
      })}
    </ol>
  );
};

export default RequestTimeline;

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import axios from "axios";
import { Button, Input } from "reactstrap";
import { FaCheck, FaClipboardList, FaSearch, FaStar, FaTags, FaTimes, FaUser } from "react-icons/fa";
import Pagination from "./Pagination";
import { usePagination } from "./usePagination";

const typeClassName = (type) => {
  if (type.startsWith("service_") || type.startsWith("category_")) return "is-visible";
  if (type.startsWith("volunteer_application") || type === "volunteer_access_revoked") return "is-in-progress";
  if (
    type.startsWith("account_")
    || type === "help_request_assignment_expired"
    || type === "help_request_offer_declined"
  ) return "is-cancelled";
  if (type === "feedback_submitted" || type === "help_request_completed") return "is-completed";
  if (type === "help_request_cancelled") return "is-cancelled";
  if (type === "help_request_accepted" || type === "help_request_started") return "is-accepted";
  return "is-pending";
};

const ActivityIcon = ({ type }) => {
  const tone = typeClassName(type);
  let Icon = FaClipboardList;
  if (tone === "is-completed") Icon = FaStar;
  else if (tone === "is-cancelled") Icon = FaTimes;
  else if (tone === "is-accepted") Icon = FaCheck;
  else if (tone === "is-visible") Icon = FaTags;
  else if (tone === "is-in-progress") Icon = FaUser;
  return (
    <span className={`activity-item-icon ${tone}`} aria-hidden="true">
      <Icon />
    </span>
  );
};

const ActivityFeed = () => {
  const { t, i18n } = useTranslation();
  const user = useSelector((state) => state.auth.user);
  const [activities, setActivities] = useState([]);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;

    const loadActivities = () => {
      const requestId = requestSeq.current + 1;
      requestSeq.current = requestId;

      axios
        .get("http://localhost:5000/api/activity", {
          params: { userId: user.id },
        })
        .then((response) => {
          if (!active || requestSeq.current !== requestId) return;
          const seen = new Set();
          setActivities(
            (response.data?.activities || []).filter((activity) => {
              if (!activity?.id || seen.has(activity.id)) return false;
              seen.add(activity.id);
              return true;
            }),
          );
          setStatus("success");
        })
        .catch(() => {
          if (!active || requestSeq.current !== requestId) return;
          setStatus("error");
        });
    };

    loadActivities();
    const timer = setInterval(loadActivities, 12000);
    window.addEventListener("helpnearby-activity", loadActivities);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("helpnearby-activity", loadActivities);
    };
  }, [user?.id]);

  const formatWhen = (createdAt) => {
    const date = new Date(createdAt);
    if (!createdAt || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(i18n.language);
  };

  const labelFor = (group, type) => {
    const key = `activity.${group}.${type}`;
    const label = t(key);
    return label === key ? type : label;
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleActivities = useMemo(() => {
    if (!normalizedQuery) return activities;
    return activities.filter((activity) => [
      labelFor("items", activity.type),
      labelFor("types", activity.type),
    ].join(" ").toLowerCase().includes(normalizedQuery));
  }, [activities, i18n.language, normalizedQuery]);
  const activityPage = usePagination(visibleActivities, `${user?.id || ""}:${normalizedQuery}`);
  const showLoading = status === "loading" && activities.length === 0;
  const showEmpty = status === "success" && activities.length === 0;
  const showNoMatches = status === "success" && activities.length > 0 && visibleActivities.length === 0;
  const showError = status === "error";
  const showPagination = visibleActivities.length > 0;

  return (
    <section className="activity-feed-page" aria-label={t("activity.title")}>
      <p className="activity-feed-intro">{t("activity.subtitle")}</p>
      {activities.length > 0 && (
        <div className="admin-request-toolbar">
          <div className="admin-request-search">
            <FaSearch aria-hidden="true" />
            <Input
              type="search"
              className="form-control"
              value={query}
              placeholder={t("activity.search")}
              aria-label={t("activity.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {normalizedQuery && (
            <Button
              type="button"
              className="dashboard-action-button dashboard-neutral-button"
              onClick={() => setQuery("")}
            >
              {t("helpRequests.clearFilters")}
            </Button>
          )}
        </div>
      )}
      {showLoading && <p className="help-request-note">{t("activity.loading")}</p>}
      {showError && <p className="help-request-note">{t("activity.loadError")}</p>}
      {showEmpty && <p className="help-request-note">{t("activity.empty")}</p>}
      {showNoMatches && <p className="admin-empty">{t("activity.noMatches")}</p>}
      {visibleActivities.length > 0 && (
        <>
          <div className="admin-table-wrap activity-feed-table-wrap">
            <table className="admin-table activity-feed-table">
              <thead>
                <tr>
                  <th scope="col">{t("activity.columns.description")}</th>
                  <th scope="col">{t("activity.columns.type")}</th>
                  <th scope="col">{t("activity.columns.date")}</th>
                </tr>
              </thead>
              <tbody>
                {activityPage.rows.map((activity) => (
                  <tr key={activity.id}>
                    <td>{labelFor("items", activity.type)}</td>
                    <td>
                      <span className={`admin-status ${typeClassName(activity.type)}`}>
                        {labelFor("types", activity.type)}
                      </span>
                    </td>
                    <td className="activity-feed-date">
                      <time dateTime={activity.createdAt} dir="ltr">{formatWhen(activity.createdAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="activity-feed-cards">
            {activityPage.rows.map((activity) => (
              <article key={activity.id} className="activity-card">
                <ActivityIcon type={activity.type} />
                <div className="activity-card-copy">
                  <p>{labelFor("items", activity.type)}</p>
                  <span className={`admin-status ${typeClassName(activity.type)}`}>
                    {labelFor("types", activity.type)}
                  </span>
                  <time dateTime={activity.createdAt} dir="ltr">{formatWhen(activity.createdAt)}</time>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {showPagination && (
        <Pagination
          page={activityPage.page}
          pageSize={activityPage.pageSize}
          total={activityPage.total}
          onPageChange={activityPage.setPage}
          onPageSizeChange={activityPage.setPageSize}
        />
      )}
    </section>
  );
};

export default ActivityFeed;

import { useTranslation } from "react-i18next";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { PAGE_SIZES } from "./usePagination";

const pageCountFor = (total, pageSize) => {
  if (!total || total < 1) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
};

const visiblePages = (current, total) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("start");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push("end");
  pages.push(total);
  return pages;
};

const Pagination = ({ page, pageSize, total, onPageChange, onPageSizeChange }) => {
  const { t, i18n } = useTranslation();
  const pageCount = pageCountFor(total, pageSize);
  const safePage = total === 0 ? 1 : Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, safePage * pageSize);
  const isRtl = i18n.dir() === "rtl";
  const PreviousIcon = isRtl ? FaChevronRight : FaChevronLeft;
  const NextIcon = isRtl ? FaChevronLeft : FaChevronRight;
  const noRows = total === 0;

  return (
    <nav className="table-pagination" aria-label={t("pagination.label")}>
      <p className="table-pagination-summary">
        {t("pagination.summary", { start, end, total })}
      </p>
      <div className="table-pagination-controls">
        <button
          type="button"
          className="table-pagination-button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={noRows || safePage <= 1}
          aria-label={t("pagination.previous")}
        >
          <PreviousIcon aria-hidden="true" />
          <span>{t("pagination.previous")}</span>
        </button>
        <div className="table-pagination-pages">
          {visiblePages(safePage, pageCount).map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                className={`table-pagination-button${item === safePage ? " is-current" : ""}`}
                onClick={() => onPageChange(item)}
                disabled={noRows}
                aria-label={t("pagination.page", { page: item })}
                aria-current={item === safePage ? "page" : undefined}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="table-pagination-ellipsis" aria-hidden="true">
                …
              </span>
            ),
          )}
        </div>
        <button
          type="button"
          className="table-pagination-button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={noRows || safePage >= pageCount}
          aria-label={t("pagination.next")}
        >
          <span>{t("pagination.next")}</span>
          <NextIcon aria-hidden="true" />
        </button>
      </div>
      <label className="table-pagination-size">
        <span>{t("pagination.pageSize")}</span>
        <select
          className="app-select"
          value={pageSize}
          aria-label={t("pagination.pageSize")}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
};

export default Pagination;

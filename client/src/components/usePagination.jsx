import { useState } from "react";

export const PAGE_SIZES = [10, 25, 50];

const pageCountFor = (total, pageSize) => {
  if (!total || total < 1) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
};

export const usePagination = (items, resetKey) => {
  const records = Array.isArray(items) ? items : [];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [trackedReset, setTrackedReset] = useState(resetKey);
  const total = records.length;
  const pageCount = pageCountFor(total, pageSize);
  let activePage = page;

  if (resetKey !== trackedReset) {
    setTrackedReset(resetKey);
    setPage(1);
    activePage = 1;
  }

  if (activePage < 1) {
    activePage = 1;
    setPage(1);
  }

  if (activePage > pageCount) {
    activePage = pageCount;
    setPage(pageCount);
  }

  const startIndex = (activePage - 1) * pageSize;

  const changePageSize = (nextSize) => {
    const size = PAGE_SIZES.includes(nextSize) ? nextSize : PAGE_SIZES[0];
    setPageSize(size);
    setPage(1);
  };

  return {
    page: activePage,
    pageSize,
    pageCount,
    total,
    rows: records.slice(startIndex, startIndex + pageSize),
    setPage,
    setPageSize: changePageSize,
  };
};

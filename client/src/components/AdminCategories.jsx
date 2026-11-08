import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Button,
  Form,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "reactstrap";
import { FaEdit, FaEye, FaEyeSlash, FaSearch, FaTrash } from "react-icons/fa";
import Pagination from "./Pagination";
import { usePagination } from "./usePagination";

const API_URL = "http://localhost:5000/api/admin/categories";
const CATEGORY_NAME_MIN = 2;
const CATEGORY_NAME_MAX = 40;

const emptyForm = { nameEn: "", nameAr: "" };
const emptyFieldErrors = { nameEn: "", nameAr: "" };

const IconAction = ({ label, className, disabled, onClick, children }) => (
  <button
    type="button"
    className={`admin-icon-button ${className}`}
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);

const categoryReferenceCount = (category) =>
  (category?.serviceCount || 0)
  + (category?.volunteerCount || 0)
  + (category?.requestCount || 0)
  + (category?.historyCount || 0);

const AdminCategories = () => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState("loading");
  const [form, setForm] = useState(emptyForm);
  const [editor, setEditor] = useState(null);
  const [confirmCategory, setConfirmCategory] = useState(null);
  const [deleteCategory, setDeleteCategory] = useState(null);
  const [blockedCategory, setBlockedCategory] = useState(null);
  const [fieldErrors, setFieldErrors] = useState(emptyFieldErrors);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);

  const showError = useCallback((errorCode) => {
    const key = `adminDashboard.errors.${errorCode || "SERVER_ERROR"}`;
    const message = t(key);
    toast.error(message === key ? t("adminDashboard.errors.SERVER_ERROR") : message);
  }, [t]);

  const loadCategories = useCallback(async () => {
    try {
      const response = await axios.get(API_URL);
      setCategories(Array.isArray(response.data?.categories) ? response.data.categories : []);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      showError(error.response?.data?.errorCode);
    }
  }, [showError]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreate = () => {
    setForm(emptyForm);
    setFieldErrors(emptyFieldErrors);
    setEditor({ mode: "create" });
  };

  const openEdit = (category) => {
    setForm({
      nameEn: category.nameEn || "",
      nameAr: category.nameAr || "",
    });
    setFieldErrors(emptyFieldErrors);
    setEditor({ mode: "edit", category });
  };

  const submitForm = async (event) => {
    event.preventDefault();
    const nameEn = form.nameEn.trim();
    const nameAr = form.nameAr.trim();
    const nextErrors = { ...emptyFieldErrors };
    if (nameEn.length < CATEGORY_NAME_MIN || nameEn.length > CATEGORY_NAME_MAX) {
      nextErrors.nameEn = t("adminDashboard.validation.categoryNameEn");
    }
    if (nameAr.length < CATEGORY_NAME_MIN || nameAr.length > CATEGORY_NAME_MAX) {
      nextErrors.nameAr = t("adminDashboard.validation.categoryNameAr");
    }
    setFieldErrors(nextErrors);
    if (nextErrors.nameEn || nextErrors.nameAr) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);

    try {
      if (editor?.mode === "create") {
        await axios.post(API_URL, { nameEn, nameAr });
        toast.success(t("adminDashboard.success.CATEGORY_CREATED"));
      } else {
        await axios.put(`${API_URL}/${editor.category.id}`, { nameEn, nameAr });
        toast.success(t("adminDashboard.success.CATEGORY_UPDATED"));
      }
      setEditor(null);
      window.dispatchEvent(new Event("helpnearby-activity"));
      await loadCategories();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const changeStatus = async (category, isActive) => {
    if (!category || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await axios.put(`${API_URL}/${category.id}/status`, { isActive });
      toast.success(t(
        isActive
          ? "adminDashboard.success.CATEGORY_ACTIVATED"
          : "adminDashboard.success.CATEGORY_DEACTIVATED",
      ));
      setConfirmCategory(null);
      window.dispatchEvent(new Event("helpnearby-activity"));
      await loadCategories();
    } catch (error) {
      showError(error.response?.data?.errorCode);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const requestDelete = (category) => {
    if (categoryReferenceCount(category) > 0) {
      setBlockedCategory(category);
      return;
    }
    setDeleteCategory(category);
  };

  const removeCategory = async () => {
    if (!deleteCategory || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await axios.delete(`${API_URL}/${deleteCategory.id}`);
      toast.success(t("adminDashboard.success.CATEGORY_DELETED"));
      setDeleteCategory(null);
      window.dispatchEvent(new Event("helpnearby-activity"));
      await loadCategories();
    } catch (error) {
      const errorCode = error.response?.data?.errorCode;
      if (errorCode === "CATEGORY_IN_USE") {
        const usage = error.response?.data?.usage || {};
        setBlockedCategory({
          ...deleteCategory,
          serviceCount: usage.services || 0,
          volunteerCount: usage.volunteers || 0,
          requestCount: usage.requests || 0,
          historyCount: usage.history || 0,
        });
        setDeleteCategory(null);
        return;
      }
      showError(errorCode);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const filtersActive = query.trim() !== "" || statusFilter !== "all";
  const visibleCategories = categories.filter((category) => {
    if (statusFilter === "active" && !category.isActive) return false;
    if (statusFilter === "inactive" && category.isActive) return false;
    const text = query.trim().toLowerCase();
    if (!text) return true;
    return [category.nameEn, category.nameAr, category.id].join(" ").toLowerCase().includes(text);
  });
  const categoryPage = usePagination(
    visibleCategories,
    `${query.trim().toLowerCase()}:${statusFilter}`,
  );

  const requestStatusChange = (category) => {
    const used = (category.volunteerCount || 0) + (category.requestCount || 0) + (category.historyCount || 0);
    if (category.isActive && used > 0) {
      setConfirmCategory(category);
      return;
    }
    changeStatus(category, !category.isActive);
  };

  return (
    <>
      <div className="admin-section-header">
        <Button
          type="button"
          className="dashboard-action-button dashboard-password-open-button"
          onClick={openCreate}
        >
          {t("adminDashboard.addCategory")}
        </Button>
      </div>
      <p className="help-request-note">{t("adminDashboard.categoriesNote")}</p>
      {status === "ready" && (
        <div className="admin-request-toolbar">
          <div className="admin-request-search">
            <FaSearch aria-hidden="true" />
            <Input
              type="search"
              className="form-control"
              value={query}
              placeholder={t("adminDashboard.categorySearch")}
              aria-label={t("adminDashboard.categorySearch")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Input
            type="select"
            className="app-select"
            value={statusFilter}
            aria-label={t("adminDashboard.visible")}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{t("adminDashboard.allCategoryStatuses")}</option>
            <option value="active">{t("adminDashboard.categoryActive")}</option>
            <option value="inactive">{t("adminDashboard.categoryInactive")}</option>
          </Input>
          {filtersActive && (
            <Button
              type="button"
              className="dashboard-action-button dashboard-neutral-button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
              }}
            >
              {t("adminDashboard.clearFilters")}
            </Button>
          )}
        </div>
      )}
      {status === "loading" ? (
        <p className="help-request-note">{t("adminDashboard.categoriesLoading")}</p>
      ) : status === "error" ? (
        <p className="help-request-note">{t("adminDashboard.loadError")}</p>
      ) : (
        <>
        <div className="admin-table-wrap">
          <table className="admin-table admin-sticky-actions">
            <thead>
              <tr>
                <th>{t("adminDashboard.categoryId")}</th>
                <th>{t("adminDashboard.categoryEnglish")}</th>
                <th>{t("adminDashboard.categoryArabic")}</th>
                <th>{t("adminDashboard.visible")}</th>
                <th>{t("adminDashboard.categoryVolunteers")}</th>
                <th>{t("adminDashboard.categoryRequests")}</th>
                <th>{t("adminDashboard.categoryHistory")}</th>
                <th>{t("adminDashboard.categoryServices")}</th>
                <th>{t("adminDashboard.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleCategories.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    {filtersActive ? t("adminDashboard.noCategoryMatches") : t("adminDashboard.noCategories")}
                  </td>
                </tr>
              ) : categoryPage.rows.map((category) => (
                <tr key={category.id}>
                  <td dir="ltr">{category.id}</td>
                  <td>{category.nameEn}</td>
                  <td dir="rtl">{category.nameAr}</td>
                  <td>
                    <span className={`admin-status${category.isActive ? " is-visible" : " is-hidden"}`}>
                      {t(category.isActive ? "adminDashboard.categoryActive" : "adminDashboard.categoryInactive")}
                    </span>
                  </td>
                  <td>{category.volunteerCount || 0}</td>
                  <td>{category.requestCount || 0}</td>
                  <td>{category.historyCount || 0}</td>
                  <td>{category.serviceCount || 0}</td>
                  <td>
                    <div className="admin-actions">
                      <IconAction
                        label={t("adminDashboard.edit")}
                        className="admin-icon-edit"
                        disabled={busy}
                        onClick={() => openEdit(category)}
                      >
                        <FaEdit />
                      </IconAction>
                      <IconAction
                        label={t(category.isActive ? "adminDashboard.deactivateCategory" : "adminDashboard.activateCategory")}
                        className={category.isActive ? "admin-icon-hide" : "admin-icon-show"}
                        disabled={busy}
                        onClick={() => requestStatusChange(category)}
                      >
                        {category.isActive ? <FaEyeSlash /> : <FaEye />}
                      </IconAction>
                      <IconAction
                        label={t("adminDashboard.delete")}
                        className="admin-icon-delete"
                        disabled={busy}
                        onClick={() => requestDelete(category)}
                      >
                        <FaTrash />
                      </IconAction>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={categoryPage.page}
          pageSize={categoryPage.pageSize}
          total={categoryPage.total}
          onPageChange={categoryPage.setPage}
          onPageSizeChange={categoryPage.setPageSize}
        />
        </>
      )}

      <Modal
        isOpen={Boolean(editor)}
        toggle={() => {
          if (!busy) setEditor(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <Form onSubmit={submitForm}>
          <ModalHeader
            closeAriaLabel={t("common.close")}
            toggle={() => {
            if (!busy) setEditor(null);
          }}
          >
            {t(editor?.mode === "edit" ? "adminDashboard.editCategory" : "adminDashboard.addCategory")}
          </ModalHeader>
          <ModalBody>
            {editor?.mode === "edit" && (
              <FormGroup>
                <Label for="categoryId">{t("adminDashboard.categoryId")}</Label>
                <Input id="categoryId" dir="ltr" value={editor.category.id} readOnly disabled />
              </FormGroup>
            )}
            <FormGroup>
              <Label for="categoryNameEn">{t("adminDashboard.categoryEnglish")}</Label>
              <Input
                id="categoryNameEn"
                dir="ltr"
                maxLength={CATEGORY_NAME_MAX}
                value={form.nameEn}
                disabled={busy}
                invalid={Boolean(fieldErrors.nameEn)}
                onChange={(event) => {
                  setForm((current) => ({ ...current, nameEn: event.target.value }));
                  if (fieldErrors.nameEn) setFieldErrors((current) => ({ ...current, nameEn: "" }));
                }}
              />
              {fieldErrors.nameEn && <div className="form-error">{fieldErrors.nameEn}</div>}
            </FormGroup>
            <FormGroup>
              <Label for="categoryNameAr">{t("adminDashboard.categoryArabic")}</Label>
              <Input
                id="categoryNameAr"
                dir="rtl"
                maxLength={CATEGORY_NAME_MAX}
                value={form.nameAr}
                disabled={busy}
                invalid={Boolean(fieldErrors.nameAr)}
                onChange={(event) => {
                  setForm((current) => ({ ...current, nameAr: event.target.value }));
                  if (fieldErrors.nameAr) setFieldErrors((current) => ({ ...current, nameAr: "" }));
                }}
              />
              {fieldErrors.nameAr && <div className="form-error">{fieldErrors.nameAr}</div>}
            </FormGroup>
          </ModalBody>
          <ModalFooter className="dashboard-modal-actions">
            <Button
              type="button"
              className="dashboard-action-button dashboard-neutral-button"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              {t("dashboard.cancel")}
            </Button>
            <Button type="submit" className="dashboard-action-button dashboard-save-button" disabled={busy}>
              {t("dashboard.saveChanges")}
            </Button>
          </ModalFooter>
        </Form>
      </Modal>

      <Modal
        isOpen={Boolean(confirmCategory)}
        toggle={() => {
          if (!busy) setConfirmCategory(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader
          closeAriaLabel={t("common.close")}
          toggle={() => {
          if (!busy) setConfirmCategory(null);
        }}
        >
          {t("adminDashboard.deactivateCategory")}
        </ModalHeader>
        <ModalBody>
          <p>{t("adminDashboard.deactivateCategoryConfirm")}</p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            disabled={busy}
            onClick={() => setConfirmCategory(null)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            type="button"
            className="dashboard-action-button dashboard-save-button"
            disabled={busy}
            onClick={() => changeStatus(confirmCategory, false)}
          >
            {t("adminDashboard.deactivateCategory")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(deleteCategory)}
        toggle={() => {
          if (!busy) setDeleteCategory(null);
        }}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader
          closeAriaLabel={t("common.close")}
          toggle={() => {
          if (!busy) setDeleteCategory(null);
        }}
        >
          {t("adminDashboard.deleteCategoryTitle")}
        </ModalHeader>
        <ModalBody>
          <p>{t("adminDashboard.deleteCategoryMessage")}</p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            disabled={busy}
            onClick={() => setDeleteCategory(null)}
          >
            {t("dashboard.cancel")}
          </Button>
          <Button
            type="button"
            className="dashboard-action-button dashboard-cancel-button"
            disabled={busy}
            onClick={removeCategory}
          >
            {t("adminDashboard.delete")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(blockedCategory)}
        toggle={() => setBlockedCategory(null)}
        centered
        className="dashboard-modal-dialog"
        contentClassName="dashboard-modal-content"
      >
        <ModalHeader toggle={() => setBlockedCategory(null)} closeAriaLabel={t("common.close")}>
          {t("adminDashboard.categoryInUseTitle")}
        </ModalHeader>
        <ModalBody>
          <p>{t("adminDashboard.categoryInUseMessage")}</p>
          <p>
            {t("adminDashboard.categoryServices")}: {blockedCategory?.serviceCount || 0}
            {" · "}
            {t("adminDashboard.categoryVolunteers")}: {blockedCategory?.volunteerCount || 0}
            {" · "}
            {t("adminDashboard.categoryRequests")}: {blockedCategory?.requestCount || 0}
            {" · "}
            {t("adminDashboard.categoryHistory")}: {blockedCategory?.historyCount || 0}
          </p>
        </ModalBody>
        <ModalFooter className="dashboard-modal-actions">
          <Button
            type="button"
            className="dashboard-action-button dashboard-neutral-button"
            onClick={() => setBlockedCategory(null)}
          >
            {t("dashboard.cancel")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default AdminCategories;

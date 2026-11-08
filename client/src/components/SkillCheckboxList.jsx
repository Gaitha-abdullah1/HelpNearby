import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { Input } from "reactstrap";

import { localizedCategoryName } from "../bilingualText";
import { storedSkillList } from "../skills";

const CATEGORY_API_URL = "http://localhost:5000/api/categories";

const SkillCheckboxList = ({ id, labelId, value, onChange, onBlur, invalid }) => {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState("loading");
  const stored = storedSkillList(value);
  const language = i18n.language?.startsWith("ar") ? "ar" : "en";

  useEffect(() => {
    let active = true;
    axios
      .get(CATEGORY_API_URL)
      .then((response) => {
        if (!active) return;
        setCategories(Array.isArray(response.data?.categories) ? response.data.categories : []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const activeOptions = categories.filter((category) => category?.id && category.isActive !== false);
  const activeIds = new Set(activeOptions.map((category) => category.id));
  const retained = stored.filter((skill) => !activeIds.has(skill));
  const selectedActive = stored.filter((skill) => activeIds.has(skill));

  const toggleSkill = (skill) => {
    const nextActive = selectedActive.includes(skill)
      ? selectedActive.filter((item) => item !== skill)
      : [...selectedActive, skill];
    onChange([...nextActive, ...retained]);
  };

  const retainedLabel = (skill) => {
    const category = categories.find((item) => item?.id === skill);
    const name = category ? localizedCategoryName(category, language) || skill : skill;
    return t("registerVolunteer.skillUnavailable", { name });
  };

  return (
    <div
      id={id}
      className={`service-checkbox-list${invalid ? " is-invalid" : ""}`}
      role="group"
      aria-labelledby={labelId}
      onBlur={onBlur}
    >
      {status === "loading" && (
        <p className="help-request-note">{t("registerVolunteer.skillsLoading")}</p>
      )}
      {status === "error" && (
        <p className="help-request-note">{t("registerVolunteer.skillsError")}</p>
      )}
      {status === "ready" && activeOptions.length === 0 && retained.length === 0 && (
        <p className="help-request-note">{t("registerVolunteer.skillsEmpty")}</p>
      )}
      {status === "ready" && activeOptions.map((category) => {
        const inputId = `${id}-${category.id}`;
        return (
          <label key={category.id} className="service-checkbox-item" htmlFor={inputId}>
            <Input
              id={inputId}
              type="checkbox"
              checked={selectedActive.includes(category.id)}
              onChange={() => toggleSkill(category.id)}
            />
            <span>{localizedCategoryName(category, language) || category.id}</span>
          </label>
        );
      })}
      {status !== "loading" && retained.map((skill) => {
        const inputId = `${id}-retained-${skill}`;
        return (
          <label key={skill} className="service-checkbox-item" htmlFor={inputId}>
            <Input id={inputId} type="checkbox" checked disabled />
            <span>{retainedLabel(skill)}</span>
          </label>
        );
      })}
    </div>
  );
};

export default SkillCheckboxList;

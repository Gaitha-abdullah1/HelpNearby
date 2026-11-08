import Category from "./models/Category.js";
import HelpRequest from "./models/HelpRequest.js";
import Service from "./models/Service.js";
import User from "./models/User.js";

const CATEGORY_ID_PATTERN = /^[1-9]\d*$/;

let knownCategories = null;

const rawValues = (value) => {
  if (Array.isArray(value)) return value.flat();
  if (typeof value === "string" && value.trim()) return [value];
  return [];
};

const categoryIdValue = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value !== "string") return "";
  const id = value.trim();
  return CATEGORY_ID_PATTERN.test(id) ? id : "";
};

const categoryRecordId = (category) => categoryIdValue(category?.categoryNumber);

const refreshKnownCategories = async () => {
  const rows = await Category.find().select("categoryNumber isActive").lean();
  knownCategories = new Map(
    rows
      .map((row) => [categoryRecordId(row), row.isActive !== false])
      .filter(([id]) => id),
  );
  return knownCategories;
};

const activeCategoryIds = () => {
  const ids = new Set();
  if (!knownCategories) return ids;
  for (const [id, isActive] of knownCategories) {
    if (isActive) ids.add(id);
  }
  return ids;
};

const activeServiceCategory = (service) => {
  const id = categoryIdValue(service?.categoryId);
  if (!id || !activeCategoryIds().has(id)) return null;
  return id;
};

const countCategoryId = (value, counts) => {
  const seen = new Set();
  for (const item of rawValues(value)) {
    const id = categoryIdValue(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
};

const categoryUsageCounts = async () => {
  const services = await Service.find({ categoryId: { $type: "string" } }).select("categoryId").lean();
  const serviceCounts = new Map();
  const categoryByServiceId = new Map();
  for (const service of services) {
    const id = categoryIdValue(service.categoryId);
    if (!id) continue;
    serviceCounts.set(id, (serviceCounts.get(id) || 0) + 1);
    categoryByServiceId.set(String(service._id), id);
  }

  const volunteers = new Map();
  const volunteerRows = await User.find({ skills: { $ne: null } }).select("skills").lean();
  for (const user of volunteerRows) countCategoryId(user.skills, volunteers);

  const history = new Map();
  const historyRows = await User.collection
    .find(
      { applicationHistory: { $exists: true, $ne: [] } },
      { projection: { "applicationHistory.skill": 1 } },
    )
    .toArray();
  for (const user of historyRows) {
    for (const entry of user.applicationHistory || []) countCategoryId(entry?.skill, history);
  }

  const helpRequests = new Map();
  const requestRows = await HelpRequest.collection
    .find({}, { projection: { categories: 1, serviceId: 1, serviceIds: 1 } })
    .toArray();
  for (const request of requestRows) {
    const ids = new Set();
    for (const item of rawValues(request.categories)) {
      const id = categoryIdValue(item);
      if (id) ids.add(id);
    }
    const serviceIds = [
      request.serviceId,
      ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
    ];
    for (const serviceId of serviceIds) {
      const id = categoryByServiceId.get(String(serviceId || ""));
      if (id) ids.add(id);
    }
    for (const id of ids) helpRequests.set(id, (helpRequests.get(id) || 0) + 1);
  }

  return { services: serviceCounts, volunteers, helpRequests, history };
};

const toPublicCategory = (category) => ({
  id: categoryRecordId(category),
  nameEn: category.name?.en || "",
  nameAr: category.name?.ar || "",
  isActive: category.isActive !== false,
});

const toAdminCategory = (category, usage) => {
  const id = categoryRecordId(category);
  return {
    ...toPublicCategory(category),
    volunteerCount: usage.volunteers.get(id) || 0,
    requestCount: usage.helpRequests.get(id) || 0,
    historyCount: usage.history.get(id) || 0,
    serviceCount: usage.services.get(id) || 0,
  };
};

export {
  activeCategoryIds,
  activeServiceCategory,
  categoryIdValue,
  categoryUsageCounts,
  refreshKnownCategories,
  toAdminCategory,
  toPublicCategory,
};

import * as yup from "yup";

const serviceSchema = yup.object({
  name: yup
    .string()
    .trim()
    .required("adminDashboard.validation.nameRequired")
    .min(2, "adminDashboard.validation.nameLength")
    .max(60, "adminDashboard.validation.nameLength"),

  nameAr: yup
    .string()
    .trim()
    .required("adminDashboard.validation.nameArRequired")
    .min(2, "adminDashboard.validation.nameLength")
    .max(60, "adminDashboard.validation.nameLength"),

  description: yup
    .string()
    .trim()
    .required("adminDashboard.validation.descriptionRequired")
    .min(5, "adminDashboard.validation.descriptionLength")
    .max(400, "adminDashboard.validation.descriptionLength"),

  descriptionAr: yup
    .string()
    .trim()
    .required("adminDashboard.validation.descriptionArRequired")
    .min(5, "adminDashboard.validation.descriptionLength")
    .max(400, "adminDashboard.validation.descriptionLength"),

  category: yup
    .string()
    .trim()
    .required("adminDashboard.validation.categoryRequired"),
});

export default serviceSchema;

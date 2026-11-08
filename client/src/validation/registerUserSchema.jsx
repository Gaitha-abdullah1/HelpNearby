import * as yup from "yup";

const registerUserSchema = yup.object({
  fullName: yup
    .string()
    .required("validation.fullName.required")
    .matches(
      /^(?=.{6,30}$)[A-Za-z]{3,}(?:\s+[A-Za-z]{3,})+$/,
      "validation.fullName.invalid",
    ),

  email: yup
    .string()
    .required("validation.email.required")
    .matches(/^[A-Za-z0-9._-]+@gmail\.com$/, "validation.email.invalid"),

  password: yup
    .string()
    .required("validation.password.required")
    .min(8, "validation.password.min")
    .max(12, "validation.password.max")
    .matches(/[A-Z]/, "validation.password.uppercase")
    .matches(/[a-z]/, "validation.password.lowercase")
    .matches(/[0-9]/, "validation.password.number")
    .matches(/[^A-Za-z0-9]/, "validation.password.special"),

  confirmPassword: yup
    .string()
    .required("validation.confirmPassword.required")
    .min(8, "validation.password.min")
    .max(12, "validation.password.max")
    .matches(/[A-Z]/, "validation.password.uppercase")
    .matches(/[a-z]/, "validation.password.lowercase")
    .matches(/[0-9]/, "validation.password.number")
    .matches(/[^A-Za-z0-9]/, "validation.password.special")
    .oneOf([yup.ref("password")], "validation.confirmPassword.match"),
});

export default registerUserSchema;

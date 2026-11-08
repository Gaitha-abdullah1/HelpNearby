import * as yup from "yup";

const resetPasswordSchema = yup.object({
  newPassword: yup
    .string()
    .required("validation.password.required")
    .min(8, "validation.password.min")
    .max(12, "validation.password.max")
    .matches(
      /[A-Z]/,
      "validation.password.uppercase",
    )
    .matches(
      /[a-z]/,
      "validation.password.lowercase",
    )
    .matches(
      /[0-9]/,
      "validation.password.number",
    )
    .matches(
      /[^A-Za-z0-9]/,
      "validation.password.special",
    ),

  confirmPassword: yup
    .string()
    .required("validation.confirmPassword.required")
    .min(8, "validation.password.min")
    .max(12, "validation.password.max")
    .matches(
      /[A-Z]/,
      "validation.password.uppercase",
    )
    .matches(
      /[a-z]/,
      "validation.password.lowercase",
    )
    .matches(
      /[0-9]/,
      "validation.password.number",
    )
    .matches(
      /[^A-Za-z0-9]/,
      "validation.password.special",
    )
    .oneOf(
      [yup.ref("newPassword")],
      "validation.confirmPassword.match",
    ),
});

export default resetPasswordSchema;
import * as yup from "yup";

const forgotPasswordSchema = yup.object({
  email: yup
    .string()
    .required("validation.email.required")
    .matches(/^[A-Za-z0-9._-]+@gmail\.com$/, "validation.email.invalid"),
});

export default forgotPasswordSchema;

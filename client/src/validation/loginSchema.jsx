import * as yup from "yup";

const loginSchema = yup.object({
  email: yup
    .string()
    .required("validation.email.required")
    .matches(
      /^[A-Za-z0-9._-]+@gmail\.com$/,
      "validation.email.invalid",
    ),

  password: yup
    .string()
    .required("validation.password.required"),
});

export default loginSchema;
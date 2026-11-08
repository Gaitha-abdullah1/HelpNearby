import * as yup from "yup";

const registerVolunteerSchema = yup.object({
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

  phone: yup
    .string()
    .required("validation.phone.required")
    .matches(/^[79][0-9]{7}$/, "validation.phone.invalid"),

  skills: yup
    .array()
    .of(yup.string().trim().min(1, "validation.skills.invalid"))
    .min(1, "validation.skills.required")
    .required("validation.skills.required")
    .test(
      "unique-skills",
      "validation.skills.invalid",
      (value) => !value || new Set(value).size === value.length,
    ),

  dateOfBirth: yup
    .date()
    .required("validation.dateOfBirth.required")
    .typeError("validation.dateOfBirth.invalid")
    .max(new Date(), "validation.dateOfBirth.future")
    .test("minimum-age", "validation.dateOfBirth.age", (value) => {
      if (!value) return false;

      const today = new Date();

      let age = today.getFullYear() - value.getFullYear();

      const monthDifference = today.getMonth() - value.getMonth();

      if (
        monthDifference < 0 ||
        (monthDifference === 0 && today.getDate() < value.getDate())
      ) {
        age--;
      }

      return age >= 18;
    }),
});

export default registerVolunteerSchema;

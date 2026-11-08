import * as yup from "yup";

const verifyEmailSchema = yup.object({
  code: yup
    .string()
    .required("validation.verificationCode.required")
    .matches(/^[0-9]{6}$/, "validation.verificationCode.invalid"),
});

export default verifyEmailSchema;

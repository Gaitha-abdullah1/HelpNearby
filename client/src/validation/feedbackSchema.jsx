import * as yup from "yup";

const feedbackSchema = yup.object({
  rating: yup
    .number()
    .typeError("feedback.validation.rating")
    .integer("feedback.validation.rating")
    .min(1, "feedback.validation.rating")
    .max(5, "feedback.validation.rating")
    .required("feedback.validation.rating"),
  comment: yup
    .string()
    .trim()
    .min(5, "feedback.validation.comment")
    .max(400, "feedback.validation.comment")
    .required("feedback.validation.comment"),
});

export default feedbackSchema;

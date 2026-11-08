import * as yup from "yup";
import registerUserSchema from "./registerUserSchema";
import registerVolunteerSchema from "./registerVolunteerSchema";
import resetPasswordSchema from "./resetPasswordSchema";

const adminProfileSchema = registerUserSchema.pick(["fullName"]);

const userProfileSchema = registerVolunteerSchema.pick(["fullName", "phone"]);

const volunteerProfileSchema = registerVolunteerSchema.pick([
  "fullName",
  "phone",
  "skills",
  "dateOfBirth",
]);

const changePasswordSchema = resetPasswordSchema.shape({
  currentPassword: yup.string().required("validation.password.required"),
  newPassword: resetPasswordSchema.fields.newPassword.clone().test(
    "different-from-current",
    "validation.password.different",
    function (value) {
      const { currentPassword } = this.parent;
      if (!value || !currentPassword) return true;
      return value !== currentPassword;
    },
  ),
});

export {
  adminProfileSchema,
  changePasswordSchema,
  userProfileSchema,
  volunteerProfileSchema,
};

import * as yup from "yup";
import { isInsideMuscat } from "../muscatBoundary";

const WILAYATS = ["muscat", "muttrah", "bawshar", "seeb", "amarat", "qurayyat"];

const helpRequestSchema = yup.object({
  categoryId: yup
    .string()
    .trim()
    .required("helpRequests.validation.categoryRequired"),
  serviceIds: yup
    .array()
    .of(yup.string().trim().required())
    .min(1, "helpRequests.validation.serviceRequired")
    .required("helpRequests.validation.serviceRequired"),
  latitude: yup
    .number()
    .typeError("helpRequests.validation.locationRequired")
    .required("helpRequests.validation.locationRequired")
    .test("inside-muscat", "helpRequests.validation.locationRequired", function validateLatitude(value) {
      return isInsideMuscat(value, this.parent.longitude);
    }),
  longitude: yup
    .number()
    .typeError("helpRequests.validation.locationRequired")
    .required("helpRequests.validation.locationRequired")
    .test("inside-muscat", "helpRequests.validation.locationRequired", function validateLongitude(value) {
      return isInsideMuscat(this.parent.latitude, value);
    }),
  wilayat: yup
    .string()
    .oneOf(WILAYATS, "helpRequests.validation.wilayatRequired")
    .required("helpRequests.validation.wilayatRequired"),
  area: yup
    .string()
    .trim()
    .min(2, "helpRequests.validation.areaRequired")
    .max(80, "helpRequests.validation.areaRequired")
    .required("helpRequests.validation.areaRequired"),
  street: yup
    .string()
    .trim()
    .max(80, "helpRequests.validation.streetLength")
    .test("street-or-landmark", function validateStreet(value) {
      const street = value?.trim() || "";
      const landmark = this.parent.landmark?.trim() || "";
      if (street.length === 1) {
        return this.createError({ message: "helpRequests.validation.streetLength" });
      }
      if (street.length >= 2 || landmark.length >= 8) return true;
      return this.createError({ message: "helpRequests.validation.addressAlternative" });
    }),
  building: yup
    .string()
    .trim()
    .max(40, "helpRequests.validation.buildingLength")
    .test("building-or-landmark", function validateBuilding(value) {
      const building = value?.trim() || "";
      const landmark = this.parent.landmark?.trim() || "";
      if (building.length >= 1 || landmark.length >= 8) return true;
      return this.createError({ message: "helpRequests.validation.addressAlternative" });
    }),
  landmark: yup
    .string()
    .trim()
    .max(200, "helpRequests.validation.landmarkLength")
    .test("landmark-length", "helpRequests.validation.landmarkLength", (value) => {
      const text = value?.trim() || "";
      return text.length === 0 || text.length >= 8;
    }),
  locationConfirmed: yup
    .boolean()
    .oneOf([true], "helpRequests.validation.confirmLocation")
    .required("helpRequests.validation.confirmLocation"),
  description: yup
    .string()
    .trim()
    .max(400, "helpRequests.validation.descriptionLength")
    .test("description-length", "helpRequests.validation.descriptionLength", (value) => {
      if (!value) return true;
      return value.length >= 5;
    }),
});

export default helpRequestSchema;

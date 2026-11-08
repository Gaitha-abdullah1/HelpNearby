import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    description: { type: String, required: true, trim: true },
    descriptionAr: { type: String, default: "", trim: true },
    categoryId: { type: String, default: null, trim: true },
    isVisible: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const Service = mongoose.model("Service", serviceSchema);
export default Service;

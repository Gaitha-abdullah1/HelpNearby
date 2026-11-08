import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    categoryNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
    },
    name: {
      en: { type: String, required: true, trim: true },
      ar: { type: String, required: true, trim: true },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const Category = mongoose.model("Category", categorySchema);
export default Category;

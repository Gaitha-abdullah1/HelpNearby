import mongoose from "mongoose";

const helpRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestNumber: {
      type: Number,
      min: 1,
      unique: true,
      sparse: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    serviceIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
        },
      ],
      default: [],
    },
    description: { type: String, default: "", trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    governorate: { type: String, enum: ["muscat"], default: "muscat" },
    wilayat: { type: String, required: true },
    area: { type: String, default: "", trim: true },
    street: { type: String, default: "", trim: true },
    building: { type: String, default: "", trim: true },
    landmark: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "in-progress", "completed", "rejected", "cancelled"],
      default: "pending",
    },
    volunteerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acceptedAt: { type: Date, default: null },
    reminderSent: { type: Boolean, default: false },
    offerAttempts: {
      type: [
        {
          volunteerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          result: {
            type: String,
            enum: ["offered", "accepted", "declined", "expired", "cancelled"],
            required: true,
          },
          startedAt: { type: Date, required: true },
          endedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const HelpRequest = mongoose.model("HelpRequest", helpRequestSchema);
export default HelpRequest;

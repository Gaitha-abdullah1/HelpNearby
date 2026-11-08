import mongoose from "mongoose";

const applicationHistorySchema = new mongoose.Schema(
  {
    applicationNumber: { type: Number, required: true, min: 1 },
    submittedAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "revoked"],
      required: true,
    },
    rejectionReason: { type: String, default: null },
    rejectionReasonEn: { type: String, default: null },
    rejectionReasonAr: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    phone: { type: String, default: null },
    skill: { type: mongoose.Schema.Types.Mixed, default: null },
    dateOfBirth: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    profileImage: { type: String, default: "default-profile.png" },
    role: {
      type: String,
      enum: ["user", "volunteer", "admin"],
      default: "user",
    },
    phone: { type: String, default: null },
    skills: { type: mongoose.Schema.Types.Mixed, default: null },
    dateOfBirth: { type: Date, default: null },
    isEmailVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: null },
    verificationCodeExpires: { type: Date, default: null },
    volunteerStatus: {
      type: String,
      enum: ["not-applicable", "pending", "approved", "rejected"],
      default: "not-applicable",
    },
    rejectionReason: { type: String, default: null },
    rejectionReasonEn: { type: String, default: null },
    rejectionReasonAr: { type: String, default: null },
    applicationHistory: {
      type: [applicationHistorySchema],
      default: undefined,
    },
    resetPasswordToken: { type: String, default: null },
    resetPasswordTokenExpires: { type: Date, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accountStatus: {
      type: String,
      enum: ["active", "blocked"],
      default: "active",
    },
    activeHelpRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const User = mongoose.model("User", userSchema);
export default User;

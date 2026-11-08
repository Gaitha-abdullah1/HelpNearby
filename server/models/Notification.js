import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "help_request_created",
        "new_help_request",
        "help_request_accepted",
        "help_request_assigned",
        "help_request_started",
        "help_request_completed",
        "help_request_start_reminder",
        "help_request_assignment_expired",
        "help_request_reopened",
        "help_request_unmatched",
        "help_request_cancelled",
        "admin_help_request_created",
        "feedback_submitted",
        "volunteer_application_submitted",
        "volunteer_application_approved",
        "volunteer_application_rejected",
        "volunteer_application_revoked",
        "account_blocked",
        "account_unblocked",
      ],
    },
    relatedRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      default: null,
    },
    requestNumber: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;

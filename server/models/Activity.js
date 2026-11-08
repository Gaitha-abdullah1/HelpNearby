import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "help_request_created",
        "help_request_accepted",
        "help_request_started",
        "help_request_cancelled",
        "help_request_completed",
        "help_request_assignment_expired",
        "help_request_offer_declined",
        "feedback_submitted",
        "volunteer_application_submitted",
        "volunteer_application_approved",
        "volunteer_application_rejected",
        "volunteer_access_revoked",
        "account_blocked",
        "account_unblocked",
        "service_created",
        "service_updated",
        "service_visibility_changed",
        "service_deleted",
        "category_created",
        "category_updated",
        "category_activated",
        "category_deactivated",
        "category_deleted",
      ],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    relatedRequestId: {
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

const Activity = mongoose.model("Activity", activitySchema);
export default Activity;

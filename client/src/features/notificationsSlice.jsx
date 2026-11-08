import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

const API_URL = "http://localhost:5000/api/notifications";
const EMPTY_NOTIFICATIONS = [];

const rejectError = (error) => ({
  errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
});

const isCurrentFetch = (state, action) => {
  const requestId = action.meta.arg?.requestId;
  const userId = action.meta.arg?.userId;
  if (requestId != null && requestId !== state.requestId) return false;
  if (userId != null && userId !== state.ownerId) return false;
  return true;
};

export const fetchNotifications = createAsyncThunk(
  "notifications/fetchNotifications",
  async ({ userId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(API_URL, {
        params: { userId },
      });
      return response.data?.notifications || [];
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const deleteNotification = createAsyncThunk(
  "notifications/deleteNotification",
  async ({ id, userId }, { rejectWithValue }) => {
    try {
      await axios.delete(`${API_URL}/${id}`, {
        params: { userId },
      });
      return { id, userId };
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const deleteAllNotifications = createAsyncThunk(
  "notifications/deleteAllNotifications",
  async ({ userId }, { rejectWithValue }) => {
    try {
      await axios.delete(API_URL, {
        params: { userId },
      });
      return { userId };
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

const initialState = {
  items: [],
  ownerId: "",
  status: "idle",
  error: null,
  requestId: 0,
};

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    resetNotificationsOwner(state, action) {
      const ownerId = action.payload || "";
      if (state.ownerId === ownerId) return;
      state.items = [];
      state.ownerId = ownerId;
      state.status = "idle";
      state.error = null;
      state.requestId += 1;
    },
    expireNotificationRequest(state) {
      state.requestId += 1;
    },
    notificationReceived(state, action) {
      const notification = action.payload?.notification;
      const userId = action.payload?.userId;
      if (!notification?.id || userId !== state.ownerId) return;
      if (state.items.some((item) => item.id === notification.id)) return;
      state.items.unshift(notification);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state, action) => {
        state.requestId = action.meta.arg?.requestId ?? state.requestId;
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        if (!isCurrentFetch(state, action)) return;
        state.items = action.payload;
        state.status = "success";
        state.error = null;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        if (!isCurrentFetch(state, action)) return;
        state.status = "error";
        state.error = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(deleteNotification.pending, (state) => {
        state.error = null;
      })
      .addCase(deleteNotification.fulfilled, (state, action) => {
        if (action.payload?.userId !== state.ownerId) return;
        state.items = state.items.filter((item) => item.id !== action.payload.id);
        state.error = null;
      })
      .addCase(deleteNotification.rejected, (state, action) => {
        if (action.meta.arg?.userId !== state.ownerId) return;
        state.error = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(deleteAllNotifications.pending, (state) => {
        state.error = null;
      })
      .addCase(deleteAllNotifications.fulfilled, (state, action) => {
        if (action.payload?.userId !== state.ownerId) return;
        state.items = [];
        state.error = null;
      })
      .addCase(deleteAllNotifications.rejected, (state, action) => {
        if (action.meta.arg?.userId !== state.ownerId) return;
        state.error = action.payload ?? { errorCode: "SERVER_ERROR" };
      });
  },
});

export const {
  expireNotificationRequest,
  notificationReceived,
  resetNotificationsOwner,
} = notificationsSlice.actions;

export const selectNotificationItems = (state) =>
  state.notifications?.items ?? EMPTY_NOTIFICATIONS;

export const selectNotificationOwnerId = (state) =>
  state.notifications?.ownerId ?? "";

export const selectNotificationStatus = (state) =>
  state.notifications?.status ?? "idle";

export default notificationsSlice.reducer;

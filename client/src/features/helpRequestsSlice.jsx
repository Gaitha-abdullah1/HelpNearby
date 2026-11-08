import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

const API_URL = "http://localhost:5000/api";
const EMPTY_REQUESTS = [];

const rejectError = (error) => ({
  errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
});

const isCurrentFetch = (requestId, ownerId, action) => {
  const responseId = action.meta.arg?.requestId;
  const userId = action.meta.arg?.userId;
  if (responseId != null && responseId !== requestId) return false;
  if (ownerId && userId && userId !== ownerId) return false;
  return true;
};

const isCurrentMyFetch = (state, action) =>
  isCurrentFetch(state.myRequestId, state.myOwnerId, action);

const isCurrentVolunteerFetch = (state, action) =>
  isCurrentFetch(state.volunteerRequestId, state.volunteerOwnerId, action);

export const fetchMyHelpRequests = createAsyncThunk(
  "helpRequests/fetchMyHelpRequests",
  async ({ userId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/help-requests/my`, {
        params: { userId },
      });
      return response.data?.requests || [];
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

const applyMyHelpRequestPatch = (state, next, userId) => {
  if (!next?.id || !state.myOwnerId || userId !== state.myOwnerId) return;
  state.myRequests = state.myRequests.map((row) =>
    row.id === next.id ? { ...row, ...next } : row,
  );
};

export const createHelpRequest = createAsyncThunk(
  "helpRequests/createHelpRequest",
  async (request, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/help-requests`, request);
      return response.data;
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const cancelHelpRequest = createAsyncThunk(
  "helpRequests/cancelHelpRequest",
  async ({ id, userId }, { rejectWithValue }) => {
    try {
      const response = await axios.put(`${API_URL}/help-requests/${id}`, {
        userId,
        status: "cancelled",
      });
      return response.data?.request;
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const updateHelpRequestStatus = createAsyncThunk(
  "helpRequests/updateHelpRequestStatus",
  async ({ id, userId, status }, { rejectWithValue }) => {
    try {
      const response = await axios.put(`${API_URL}/help-requests/${id}`, {
        userId,
        status,
      });
      return {
        messageCode: response.data?.messageCode,
        request: response.data?.request,
        status,
      };
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const fetchVolunteerHelpRequests = createAsyncThunk(
  "helpRequests/fetchVolunteerHelpRequests",
  async ({ userId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/volunteer/help-requests`, {
        params: { userId },
      });
      return {
        requests: response.data?.requests || [],
        distanceAvailable: response.data?.distanceAvailable === true,
      };
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

const initialState = {
  myRequests: [],
  myOwnerId: "",
  myStatus: "idle",
  myError: null,
  myRequestId: 0,

  volunteerRequests: [],
  volunteerOwnerId: "",
  volunteerStatus: "idle",
  volunteerError: null,
  volunteerRequestId: 0,
  distanceAvailable: false,
};

const helpRequestsSlice = createSlice({
  name: "helpRequests",
  initialState,
  reducers: {
    resetMyHelpRequests(state, action) {
      const nextUserId = action.payload || "";
      if (!state.myOwnerId || state.myOwnerId === nextUserId) return;
      state.myRequests = [];
      state.myOwnerId = "";
      state.myStatus = "idle";
      state.myError = null;
      state.myRequestId += 1;
    },
    expireMyHelpRequestFetch(state) {
      state.myRequestId += 1;
    },
    resetVolunteerHelpRequests(state, action) {
      const nextUserId = action.payload || "";
      if (!state.volunteerOwnerId || state.volunteerOwnerId === nextUserId) return;
      state.volunteerRequests = [];
      state.volunteerOwnerId = "";
      state.volunteerStatus = "idle";
      state.volunteerError = null;
      state.volunteerRequestId += 1;
      state.distanceAvailable = false;
    },
    expireVolunteerHelpRequestFetch(state) {
      state.volunteerRequestId += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyHelpRequests.pending, (state, action) => {
        if (action.meta.arg?.requestId != null) {
          state.myRequestId = action.meta.arg.requestId;
        }
        if (!state.myOwnerId) state.myStatus = "loading";
        state.myError = null;
      })
      .addCase(fetchMyHelpRequests.fulfilled, (state, action) => {
        if (!isCurrentMyFetch(state, action)) return;
        state.myRequests = action.payload;
        state.myOwnerId = action.meta.arg?.userId || "";
        state.myStatus = "success";
        state.myError = null;
      })
      .addCase(fetchMyHelpRequests.rejected, (state, action) => {
        if (!isCurrentMyFetch(state, action)) return;
        state.myStatus = "error";
        state.myError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(fetchVolunteerHelpRequests.pending, (state, action) => {
        if (action.meta.arg?.requestId != null) {
          state.volunteerRequestId = action.meta.arg.requestId;
        }
        if (!state.volunteerOwnerId) state.volunteerStatus = "loading";
        state.volunteerError = null;
      })
      .addCase(fetchVolunteerHelpRequests.fulfilled, (state, action) => {
        if (!isCurrentVolunteerFetch(state, action)) return;
        state.volunteerRequests = action.payload?.requests || [];
        state.volunteerOwnerId = action.meta.arg?.userId || "";
        state.volunteerStatus = "success";
        state.volunteerError = null;
        state.distanceAvailable = action.payload?.distanceAvailable === true;
      })
      .addCase(fetchVolunteerHelpRequests.rejected, (state, action) => {
        if (!isCurrentVolunteerFetch(state, action)) return;
        if (action.meta.arg?.preserveStatusOnError) return;
        state.volunteerStatus = "error";
        state.volunteerError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(createHelpRequest.pending, (state) => {
        state.myError = null;
      })
      .addCase(createHelpRequest.fulfilled, (state) => {
        state.myError = null;
      })
      .addCase(createHelpRequest.rejected, (state, action) => {
        const userId = action.meta.arg?.userId;
        if (state.myOwnerId && userId && userId !== state.myOwnerId) return;
        state.myError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(cancelHelpRequest.pending, (state) => {
        state.myError = null;
      })
      .addCase(cancelHelpRequest.fulfilled, (state, action) => {
        applyMyHelpRequestPatch(state, action.payload, action.meta.arg?.userId);
        state.myError = null;
      })
      .addCase(cancelHelpRequest.rejected, (state, action) => {
        const userId = action.meta.arg?.userId;
        if (state.myOwnerId && userId && userId !== state.myOwnerId) return;
        state.myError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(updateHelpRequestStatus.pending, (state) => {
        state.volunteerError = null;
      })
      .addCase(updateHelpRequestStatus.fulfilled, (state) => {
        state.volunteerError = null;
      })
      .addCase(updateHelpRequestStatus.rejected, (state, action) => {
        const userId = action.meta.arg?.userId;
        if (state.volunteerOwnerId && userId && userId !== state.volunteerOwnerId) return;
        state.volunteerError = action.payload ?? { errorCode: "SERVER_ERROR" };
      });
  },
});

export const {
  expireMyHelpRequestFetch,
  expireVolunteerHelpRequestFetch,
  resetMyHelpRequests,
  resetVolunteerHelpRequests,
} = helpRequestsSlice.actions;

export const selectMyHelpRequests = (state) =>
  state.helpRequests?.myRequests ?? EMPTY_REQUESTS;

export const selectMyHelpRequestOwnerId = (state) =>
  state.helpRequests?.myOwnerId ?? "";

export const selectMyHelpRequestStatus = (state) =>
  state.helpRequests?.myStatus ?? "idle";

export const selectVolunteerHelpRequests = (state) =>
  state.helpRequests?.volunteerRequests ?? EMPTY_REQUESTS;

export const selectVolunteerHelpRequestOwnerId = (state) =>
  state.helpRequests?.volunteerOwnerId ?? "";

export const selectVolunteerHelpRequestStatus = (state) =>
  state.helpRequests?.volunteerStatus ?? "idle";

export const selectVolunteerDistanceAvailable = (state) =>
  state.helpRequests?.distanceAvailable ?? false;

export default helpRequestsSlice.reducer;

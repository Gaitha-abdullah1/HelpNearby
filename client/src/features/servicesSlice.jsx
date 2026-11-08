import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

const API_URL = "http://localhost:5000/api";
const ADMIN_API_URL = "http://localhost:5000/api/admin";
const EMPTY_SERVICES = [];

const rejectError = (error) => ({
  errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
});

const isCurrentRequest = (state, key, action) =>
  action.meta.arg == null || action.meta.arg === state[key];

export const fetchServiceCatalog = createAsyncThunk(
  "services/fetchServiceCatalog",
  async (_requestId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/services`);
      return response.data?.services || [];
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const fetchAdminServices = createAsyncThunk(
  "services/fetchAdminServices",
  async (_requestId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${ADMIN_API_URL}/services`);
      return response.data?.services || [];
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const createService = createAsyncThunk(
  "services/createService",
  async (service, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${ADMIN_API_URL}/services`, service);
      return response.data;
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const updateService = createAsyncThunk(
  "services/updateService",
  async ({ id, ...changes }, { rejectWithValue }) => {
    try {
      const response = await axios.put(`${ADMIN_API_URL}/services/${id}`, changes);
      return response.data;
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

export const deleteService = createAsyncThunk(
  "services/deleteService",
  async (id, { rejectWithValue }) => {
    try {
      const response = await axios.delete(`${ADMIN_API_URL}/services/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(rejectError(error));
    }
  },
);

const initialState = {
  catalog: [],
  catalogStatus: "idle",
  catalogError: null,
  catalogRequest: 0,

  adminItems: [],
  adminStatus: "idle",
  adminError: null,
  adminRequest: 0,
};

const servicesSlice = createSlice({
  name: "services",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchServiceCatalog.pending, (state, action) => {
        state.catalogRequest = action.meta.arg ?? state.catalogRequest;
        if (state.catalogStatus === "idle") state.catalogStatus = "loading";
        state.catalogError = null;
      })
      .addCase(fetchServiceCatalog.fulfilled, (state, action) => {
        if (!isCurrentRequest(state, "catalogRequest", action)) return;
        state.catalog = action.payload;
        state.catalogStatus = "success";
        state.catalogError = null;
      })
      .addCase(fetchServiceCatalog.rejected, (state, action) => {
        if (!isCurrentRequest(state, "catalogRequest", action)) return;
        state.catalogStatus = "error";
        state.catalogError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(fetchAdminServices.pending, (state, action) => {
        state.adminRequest = action.meta.arg ?? state.adminRequest;
        state.adminStatus = "loading";
        state.adminError = null;
      })
      .addCase(fetchAdminServices.fulfilled, (state, action) => {
        if (!isCurrentRequest(state, "adminRequest", action)) return;
        state.adminItems = action.payload;
        state.adminStatus = "success";
        state.adminError = null;
      })
      .addCase(fetchAdminServices.rejected, (state, action) => {
        if (!isCurrentRequest(state, "adminRequest", action)) return;
        state.adminStatus = "error";
        state.adminError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(createService.pending, (state) => {
        state.adminError = null;
      })
      .addCase(createService.fulfilled, (state) => {
        state.adminError = null;
      })
      .addCase(createService.rejected, (state, action) => {
        state.adminError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(updateService.pending, (state) => {
        state.adminError = null;
      })
      .addCase(updateService.fulfilled, (state) => {
        state.adminError = null;
      })
      .addCase(updateService.rejected, (state, action) => {
        state.adminError = action.payload ?? { errorCode: "SERVER_ERROR" };
      })
      .addCase(deleteService.pending, (state) => {
        state.adminError = null;
      })
      .addCase(deleteService.fulfilled, (state) => {
        state.adminError = null;
      })
      .addCase(deleteService.rejected, (state, action) => {
        state.adminError = action.payload ?? { errorCode: "SERVER_ERROR" };
      });
  },
});

export const selectServiceCatalog = (state) => state.services?.catalog ?? EMPTY_SERVICES;

export const selectCatalogStatus = (state) => state.services?.catalogStatus ?? "idle";

export const selectAdminServices = (state) => state.services?.adminItems ?? EMPTY_SERVICES;

export const selectAdminServiceStatus = (state) => state.services?.adminStatus ?? "idle";

export const ensureServicesReducer = (store) => {
  if (store.getState().services) return;

  store.replaceReducer((state, action) => {
    const current = state ?? {};
    const services = servicesSlice.reducer(current.services, action);
    if (services === current.services) return current;
    return { ...current, services };
  });
};

export default servicesSlice.reducer;

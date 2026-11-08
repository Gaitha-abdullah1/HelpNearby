import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

const API_URL = "http://localhost:5000/api/auth";
const USERS_API_URL = API_URL.replace("/auth", "/users");

const persistUser = (user) => {
  const serializedUser = JSON.stringify(user);

  if (localStorage.getItem("user")) {
    localStorage.setItem("user", serializedUser);
    sessionStorage.removeItem("user");
    return;
  }

  sessionStorage.setItem("user", serializedUser);
  localStorage.removeItem("user");
};

const readStoredUser = (storageName, key) => {
  try {
    const storage = window[storageName];
    const storedValue = storage.getItem(key);

    if (!storedValue) {
      return null;
    }

    const user = JSON.parse(storedValue);
    if (
      !user ||
      typeof user !== "object" ||
      Array.isArray(user) ||
      typeof user.email !== "string" ||
      typeof user.role !== "string"
    ) {
      storage.removeItem(key);
      return null;
    }

    return user;
  } catch {
    try {
      window[storageName].removeItem(key);
    } catch {
      void 0;
    }

    return null;
  }
};

const storedUser =
  readStoredUser("localStorage", "user") ||
  readStoredUser("sessionStorage", "user");

const birthDateValue = (value) => {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return value;
};

const initialState = {
  user: storedUser,
  isAuthenticated: !!storedUser,
  loading: false,
  success: false,
  error: null,
};

export const register = createAsyncThunk(
  "auth/register",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/register/user`, {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const registerVolunteer = createAsyncThunk(
  "auth/registerVolunteer",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/register/volunteer`, {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        phone: data.phone,
        skills: data.skills,
        dateOfBirth: birthDateValue(data.dateOfBirth),
      });

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const verifyEmail = createAsyncThunk(
  "auth/verifyEmail",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/verify-email`, {
        email: data.email,
        code: data.code,
      });

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const resendVerification = createAsyncThunk(
  "auth/resendVerification",
  async (email, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/resend-verification`, {
        email,
      });

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const forgotPassword = createAsyncThunk(
  "auth/forgotPassword",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/forgot-password`, {
        email: data.email,
      });

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const resetPassword = createAsyncThunk(
  "auth/resetPassword",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/reset-password`, {
        token: data.token,
        password: data.password,
      });

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async (data, { rejectWithValue }) => {
    try {
      const payload = {
        fullName: data.fullName,
        phone: data.phone,
      };

      if (data.skills !== undefined) {
        payload.skills = data.skills;
      }

      if (data.dateOfBirth !== undefined) {
        payload.dateOfBirth = data.dateOfBirth;
      }

      const response = await axios.put(
        `${USERS_API_URL}/${data.id}/profile`,
        payload,
      );

      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.put(`${USERS_API_URL}/${data.id}/password`, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });

      return {
        messageCode: response.data?.messageCode || "PASSWORD_CHANGED",
      };
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const reapplyVolunteer = createAsyncThunk(
  "auth/reapplyVolunteer",
  async (data, { getState, rejectWithValue }) => {
    try {
      const response = await axios.put("http://localhost:5000/api/volunteer/reapply", {
        userId: getState().auth.user?.id,
        phone: data.phone,
        skills: data.skills,
        dateOfBirth: birthDateValue(data.dateOfBirth),
      });
      return response.data;
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

export const login = createAsyncThunk(
  "auth/login",
  async (data, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/login`, {
        email: data.email,
        password: data.password,
      });

      return {
        ...response.data,
        rememberMe: Boolean(data.rememberMe),
      };
    } catch (error) {
      return rejectWithValue({
        errorCode: error.response?.data?.errorCode || "SERVER_ERROR",
      });
    }
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.success = false;
      state.error = null;
      localStorage.removeItem("user");
      sessionStorage.removeItem("user");
    },

    resetAuth: (state) => {
      state.loading = false;
      state.success = false;
      state.error = null;
    },

    applyAccountStatus: (state, action) => {
      if (!state.user) return;
      state.user = {
        ...state.user,
        role: action.payload.role,
        volunteerStatus: action.payload.volunteerStatus,
      };
      persistUser(state.user);
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(register.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })

      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(registerVolunteer.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(registerVolunteer.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })

      .addCase(registerVolunteer.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(verifyEmail.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(verifyEmail.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })

      .addCase(verifyEmail.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(resendVerification.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(resendVerification.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })

      .addCase(resendVerification.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(forgotPassword.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(forgotPassword.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })

      .addCase(forgotPassword.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(resetPassword.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(resetPassword.fulfilled, (state) => {
        state.loading = false;
        state.success = true;
        state.error = null;
      })

      .addCase(resetPassword.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(updateProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        persistUser(action.payload.user);
      })

      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    builder
      .addCase(changePassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(changePassword.fulfilled, (state) => {
        state.loading = false;
        state.error = null;
      })

      .addCase(changePassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })

      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.error = null;

        state.user = action.payload.user;
        state.isAuthenticated = true;

        if (action.payload.rememberMe) {
          localStorage.setItem("user", JSON.stringify(action.payload.user));
          sessionStorage.removeItem("user");
        } else {
          sessionStorage.setItem("user", JSON.stringify(action.payload.user));
          localStorage.removeItem("user");
        }
      })

      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      });

    builder
      .addCase(reapplyVolunteer.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(reapplyVolunteer.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        persistUser(action.payload.user);
      })
      .addCase(reapplyVolunteer.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { logout, resetAuth, applyAccountStatus } = authSlice.actions;
export default authSlice.reducer;

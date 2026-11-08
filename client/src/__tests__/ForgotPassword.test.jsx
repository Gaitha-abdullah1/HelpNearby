import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import axios from "axios";
import toast from "react-hot-toast";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import ForgotPassword from "../components/ForgotPassword.jsx";
import authReducer from "../features/authSlice.jsx";
import languageReducer from "../features/languageSlice.jsx";
import themeReducer from "../features/themeSlice.jsx";
import i18n from "../i18n.jsx";

for (const method of ["get", "post", "put", "delete"]) {
  if (!axios[method]?.mock) {
    vi.spyOn(axios, method).mockResolvedValue({ data: {} });
  }
}

if (!i18n.isInitialized) {
  await i18n.init();
}

const renderForgotPassword = () => {
  const store = configureStore({
    reducer: {
      theme: themeReducer,
      language: languageReducer,
      auth: authReducer,
    },
    preloadedState: {
      auth: {
        user: null,
        isAuthenticated: false,
        loading: false,
        success: false,
        error: null,
      },
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    </Provider>,
  );

  return store;
};

const submitReset = () => {
  fireEvent.submit(screen.getByRole("button", { name: "Send Reset Link" }).closest("form"));
};

beforeEach(() => {
  axios.post.mockReset();
  axios.post.mockResolvedValue({ data: { messageCode: "PASSWORD_RESET_EMAIL_SENT" } });
  vi.spyOn(toast, "error").mockImplementation(() => "toast");
  vi.spyOn(toast, "success").mockImplementation(() => "toast");
});

afterEach(() => {
  cleanup();
  toast.error.mockRestore();
  toast.success.mockRestore();
});

describe("Forgot password", () => {
  it("shows the password recovery form", () => {
    renderForgotPassword();

    expect(screen.getByRole("heading", { name: "Forgot Password?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Login" })).toBeInTheDocument();
  });

  it("requires an email address", async () => {
    renderForgotPassword();

    submitReset();

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("rejects an email that is not a Gmail address", async () => {
    renderForgotPassword();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@yahoo.com" },
    });
    submitReset();

    expect(await screen.findByText("Please enter a valid Gmail address.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("sends the reset request and confirms success", async () => {
    const store = renderForgotPassword();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@gmail.com" },
    });
    submitReset();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "A password reset link has been sent to your email address.",
        expect.any(Object),
      );
    });
    expect(axios.post).toHaveBeenCalledWith("http://localhost:5000/api/auth/forgot-password", {
      email: "person@gmail.com",
    });
    expect(store.getState().auth.success).toBe(true);
  });

  it("reports a recovery error from the server", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { errorCode: "USER_NOT_FOUND" } },
    });
    const store = renderForgotPassword();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "missing@gmail.com" },
    });
    submitReset();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No account is registered with this email address.",
        expect.any(Object),
      );
    });
    expect(store.getState().auth.success).toBe(false);
    expect(store.getState().auth.error).toEqual({ errorCode: "USER_NOT_FOUND" });
  });
});

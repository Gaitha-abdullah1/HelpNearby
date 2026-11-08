import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import axios from "axios";
import toast from "react-hot-toast";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import Login from "../components/Login.jsx";
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

const Pathname = () => {
  const location = useLocation();
  return <output aria-label="current path">{location.pathname}</output>;
};

const renderLogin = () => {
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
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
        <Pathname />
      </MemoryRouter>
    </Provider>,
  );

  return store;
};

const submitLogin = () => {
  fireEvent.submit(screen.getByRole("button", { name: "Login" }).closest("form"));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ data: {} });
  vi.spyOn(toast, "error").mockImplementation(() => "toast");
  vi.spyOn(toast, "success").mockImplementation(() => "toast");
});

afterEach(() => {
  cleanup();
  toast.error.mockRestore();
  toast.success.mockRestore();
});

describe("Login", () => {
  it("shows the login form", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("requires an email and a password", async () => {
    renderLogin();

    submitLogin();

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("accepts a valid email and password", async () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    submitLogin();

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(screen.queryByText("Email is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Password is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Please enter a valid Gmail address.")).not.toBeInTheDocument();
  });

  it("reports invalid login credentials", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { errorCode: "INVALID_CREDENTIALS" } },
    });
    const store = renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    submitLogin();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Invalid email or password.",
        expect.any(Object),
      );
    });
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(screen.getByLabelText("current path")).toHaveTextContent("/login");
  });

  it("signs the user in after a successful response", async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-1",
          fullName: "Sara Ahmed",
          email: "person@gmail.com",
          role: "user",
        },
      },
    });
    const store = renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    submitLogin();

    await waitFor(() => {
      expect(screen.getByLabelText("current path")).toHaveTextContent("/user");
    });
    expect(axios.post).toHaveBeenCalledWith("http://localhost:5000/api/auth/login", {
      email: "person@gmail.com",
      password: "secret",
    });
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user.role).toBe("user");
  });
});

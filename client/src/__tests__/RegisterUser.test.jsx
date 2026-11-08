import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import axios from "axios";
import toast from "react-hot-toast";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import RegisterUser from "../components/RegisterUser.jsx";
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

const renderRegister = () => {
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
      <MemoryRouter initialEntries={["/register"]}>
        <RegisterUser />
        <Pathname />
      </MemoryRouter>
    </Provider>,
  );

  return store;
};

const fill = (label, value) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const submitRegister = () => {
  fireEvent.submit(screen.getByRole("button", { name: "Register" }).closest("form"));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ data: { messageCode: "USER_REGISTERED" } });
  vi.spyOn(toast, "error").mockImplementation(() => "toast");
  vi.spyOn(toast, "success").mockImplementation(() => "toast");
});

afterEach(() => {
  cleanup();
  toast.error.mockRestore();
  toast.success.mockRestore();
});

describe("User registration", () => {
  it("shows the registration form", () => {
    renderRegister();

    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("requires the name, email, and password fields", async () => {
    renderRegister();

    submitRegister();

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm your password.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("rejects a name or email that does not match the rules", async () => {
    renderRegister();

    fill("Full Name", "Sara");
    fill("Email", "sara@yahoo.com");
    fill("Password", "Abcdef1!");
    fill("Confirm Password", "Abcdef1!");
    submitRegister();

    expect(
      await screen.findByText(
        "Full name must contain at least two words, each with at least 3 English letters.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Please enter a valid Gmail address.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("requires the password confirmation to match", async () => {
    renderRegister();

    fill("Full Name", "Sara Ahmed");
    fill("Email", "sara.ahmed@gmail.com");
    fill("Password", "Abcdef1!");
    fill("Confirm Password", "Abcdef2!");
    submitRegister();

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("creates the account and opens email verification", async () => {
    const store = renderRegister();

    fill("Full Name", "Sara Ahmed");
    fill("Email", "sara.ahmed@gmail.com");
    fill("Password", "Abcdef1!");
    fill("Confirm Password", "Abcdef1!");
    submitRegister();

    await waitFor(() => {
      expect(screen.getByLabelText("current path")).toHaveTextContent("/verify-email");
    });
    expect(axios.post).toHaveBeenCalledWith("http://localhost:5000/api/auth/register/user", {
      fullName: "Sara Ahmed",
      email: "sara.ahmed@gmail.com",
      password: "Abcdef1!",
    });
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it("reports a registration error from the server", async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { errorCode: "EMAIL_ALREADY_REGISTERED" } },
    });
    renderRegister();

    fill("Full Name", "Sara Ahmed");
    fill("Email", "sara.ahmed@gmail.com");
    fill("Password", "Abcdef1!");
    fill("Confirm Password", "Abcdef1!");
    submitRegister();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This email is already registered.",
        expect.any(Object),
      );
    });
    expect(screen.getByLabelText("current path")).toHaveTextContent("/register");
  });
});

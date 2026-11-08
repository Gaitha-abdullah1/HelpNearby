import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import axios from "axios";
import toast from "react-hot-toast";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import AdminDashboard from "../components/AdminDashboard.jsx";
import UserDashboard from "../components/UserDashboard.jsx";
import authReducer from "../features/authSlice.jsx";
import languageReducer from "../features/languageSlice.jsx";
import themeReducer from "../features/themeSlice.jsx";
import i18n from "../i18n.jsx";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

for (const method of ["get", "post", "put", "delete"]) {
  if (!axios[method]?.mock) {
    vi.spyOn(axios, method).mockResolvedValue({ data: {} });
  }
}

if (!i18n.isInitialized) {
  await i18n.init();
}

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const adminUser = {
  id: "admin-1",
  fullName: "Admin User",
  email: "admin@gmail.com",
  role: "admin",
};

const member = {
  id: "user-1",
  fullName: "Sara Ahmed",
  email: "sara.ahmed@gmail.com",
  role: "user",
};

const initialServices = [
  {
    id: "svc-grocery",
    name: "Grocery Help",
    description: "Buy groceries nearby.",
    isVisible: true,
  },
  {
    id: "svc-medicine",
    name: "Medicine Delivery",
    description: "Deliver medicine nearby.",
    isVisible: true,
  },
  {
    id: "svc-hidden",
    name: "Hidden Repair",
    description: "This service is hidden.",
    isVisible: false,
  },
];

let services = [];

const visibleServices = () => services.filter((service) => service.isVisible);

const renderWithUser = (user, ui, path) => {
  const store = configureStore({
    reducer: {
      theme: themeReducer,
      language: languageReducer,
      auth: authReducer,
    },
    preloadedState: {
      auth: {
        user,
        isAuthenticated: true,
        loading: false,
        success: false,
        error: null,
      },
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        {ui}
      </MemoryRouter>
    </Provider>,
  );
};

beforeEach(() => {
  services = initialServices.map((service) => ({ ...service }));
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("helpnearby-guide", JSON.stringify({ [member.id]: "dismissed" }));
  axios.get.mockReset();
  axios.post.mockReset();
  axios.put.mockReset();
  axios.delete.mockReset();
  axios.get.mockImplementation((url) => {
    if (url === "http://localhost:5000/api/admin/services") {
      return Promise.resolve({ data: { services } });
    }
    if (url === "http://localhost:5000/api/services") {
      return Promise.resolve({ data: { services: visibleServices() } });
    }
    if (url === "http://localhost:5000/api/categories") {
      return Promise.resolve({
        data: {
          categories: [
            { id: "education", nameEn: "Education", nameAr: "التعليم", isActive: true },
            { id: "food-grocery", nameEn: "Food", nameAr: "الغذاء", isActive: true },
          ],
        },
      });
    }
    if (String(url).includes("/help-requests")) {
      return Promise.resolve({ data: { requests: [] } });
    }
    if (String(url).includes("/feedback")) {
      return Promise.resolve({ data: { feedbacks: [] } });
    }
    if (String(url).includes("/notifications")) {
      return Promise.resolve({ data: { notifications: [] } });
    }
    if (String(url).includes("/volunteers/locations")) {
      return Promise.resolve({ data: { volunteers: [] } });
    }
    return Promise.resolve({ data: {} });
  });
  axios.post.mockImplementation(async (url, body) => {
    if (url === "http://localhost:5000/api/admin/services") {
      services = [
        ...services,
        {
          id: "svc-new",
          name: body.name,
          description: body.description,
          isVisible: true,
        },
      ];
    }
    return { data: {} };
  });
  axios.put.mockImplementation(async (url, body) => {
    const id = String(url).split("/").pop();
    services = services.map((service) => (
      service.id === id ? { ...service, ...body } : service
    ));
    return { data: {} };
  });
  axios.delete.mockImplementation(async (url) => {
    const id = String(url).split("/").pop();
    services = services.filter((service) => service.id !== id);
    return { data: {} };
  });
  vi.spyOn(toast, "success").mockImplementation(() => "toast");
  vi.spyOn(toast, "error").mockImplementation(() => "toast");
});

afterEach(() => {
  cleanup();
  toast.error.mockRestore();
  toast.success.mockRestore();
});

describe("Service management", () => {
  it("shows the saved services and whether each one is visible", async () => {
    renderWithUser(adminUser, <AdminDashboard />, "/admin?section=services");

    expect(await screen.findByText("Grocery Help")).toBeInTheDocument();
    expect(screen.getByText("Medicine Delivery")).toBeInTheDocument();
    expect(screen.getByText("Hidden Repair")).toBeInTheDocument();
    expect(within(screen.getByText("Grocery Help").closest("tr")).getByText("Visible")).toBeInTheDocument();
    expect(within(screen.getByText("Medicine Delivery").closest("tr")).getByText("Visible")).toBeInTheDocument();
    expect(within(screen.getByText("Hidden Repair").closest("tr")).getByText("Hidden")).toBeInTheDocument();
  });

  it("adds a service", async () => {
    renderWithUser(adminUser, <AdminDashboard />, "/admin?section=services");
    await screen.findByText("Grocery Help");

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));
    fireEvent.change(screen.getByLabelText("Service Name"), {
      target: { value: "Evening Help" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Help during the evening." },
    });
    fireEvent.change(screen.getByLabelText("Service name (Arabic)"), {
      target: { value: "مساعدة مسائية" },
    });
    fireEvent.change(screen.getByLabelText("Description (Arabic)"), {
      target: { value: "مساعدة خلال المساء." },
    });
    expect(await screen.findByRole("option", { name: "Education" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "education" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Service created.", expect.any(Object));
    });
    expect(axios.post).toHaveBeenCalledWith("http://localhost:5000/api/admin/services", {
      name: "Evening Help",
      description: "Help during the evening.",
      nameAr: "مساعدة مسائية",
      descriptionAr: "مساعدة خلال المساء.",
      category: "education",
    });
    expect(await screen.findByText("Evening Help")).toBeInTheDocument();
  });

  it("edits an existing service", async () => {
    renderWithUser(adminUser, <AdminDashboard />, "/admin?section=services");
    await screen.findByText("Grocery Help");

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText("Service Name"), {
      target: { value: "Grocery Pickup" },
    });
    fireEvent.change(screen.getByLabelText("Service name (Arabic)"), {
      target: { value: "توصيل البقالة" },
    });
    fireEvent.change(screen.getByLabelText("Description (Arabic)"), {
      target: { value: "شراء البقالة من مكان قريب." },
    });
    expect(await screen.findByRole("option", { name: "Food" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "food-grocery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Service updated.", expect.any(Object));
    });
    expect(axios.put).toHaveBeenCalledWith(
      "http://localhost:5000/api/admin/services/svc-grocery",
      {
        name: "Grocery Pickup",
        description: "Buy groceries nearby.",
        nameAr: "توصيل البقالة",
        descriptionAr: "شراء البقالة من مكان قريب.",
        category: "food-grocery",
        isVisible: true,
      },
    );
    expect(await screen.findByText("Grocery Pickup")).toBeInTheDocument();
  });

  it("hides a visible service and shows a hidden one", async () => {
    renderWithUser(adminUser, <AdminDashboard />, "/admin?section=services");
    const grocery = (await screen.findByText("Grocery Help")).closest("tr");
    const hidden = screen.getByText("Hidden Repair").closest("tr");

    fireEvent.click(within(grocery).getByRole("button", { name: "Hide service" }));
    await waitFor(() => {
      expect(within(grocery).getByText("Hidden")).toBeInTheDocument();
    });
    expect(axios.put).toHaveBeenCalledWith(
      "http://localhost:5000/api/admin/services/svc-grocery",
      {
        name: "Grocery Help",
        description: "Buy groceries nearby.",
        isVisible: false,
      },
    );

    fireEvent.click(within(hidden).getByRole("button", { name: "Show service" }));
    await waitFor(() => {
      expect(within(hidden).getByText("Visible")).toBeInTheDocument();
    });
    expect(axios.put).toHaveBeenCalledWith(
      "http://localhost:5000/api/admin/services/svc-hidden",
      {
        name: "Hidden Repair",
        description: "This service is hidden.",
        isVisible: true,
      },
    );
  });

  it("deletes a service after confirmation", async () => {
    renderWithUser(adminUser, <AdminDashboard />, "/admin?section=services");
    const grocery = (await screen.findByText("Grocery Help")).closest("tr");

    fireEvent.click(within(grocery).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Service deleted.", expect.any(Object));
    });
    expect(axios.delete).toHaveBeenCalledWith(
      "http://localhost:5000/api/admin/services/svc-grocery",
    );
    await waitFor(() => {
      expect(screen.queryByText("Grocery Help")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Medicine Delivery")).toBeInTheDocument();
  });
});

describe("Help request services", () => {
  const renderRequestForm = () => {
    services = services.map((service) => ({
      ...service,
      category: service.id === "svc-hidden" ? "education" : "food-grocery",
    }));
    renderWithUser(member, <UserDashboard />, "/user?section=requests");
  };

  const selectFoodCategory = async () => {
    fireEvent.change(await screen.findByLabelText("Category"), {
      target: { value: "food-grocery" },
    });
  };

  it("offers only the visible services for selection", async () => {
    renderRequestForm();
    await selectFoodCategory();

    expect(await screen.findByRole("checkbox", { name: "Grocery Help" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Medicine Delivery" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Hidden Repair" })).not.toBeInTheDocument();
  });

  it("keeps the other selected services when one is cleared", async () => {
    renderRequestForm();
    await selectFoodCategory();
    const grocery = await screen.findByRole("checkbox", { name: "Grocery Help" });
    const medicine = screen.getByRole("checkbox", { name: "Medicine Delivery" });

    fireEvent.click(grocery);
    fireEvent.click(medicine);
    fireEvent.click(grocery);

    expect(grocery).not.toBeChecked();
    expect(medicine).toBeChecked();
  });

  it("does not send a help request when no service is selected", async () => {
    renderRequestForm();
    await selectFoodCategory();
    await screen.findByRole("checkbox", { name: "Grocery Help" });

    fireEvent.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(await screen.findByText("Please select at least one service.")).toBeInTheDocument();
    expect(
      axios.post.mock.calls.some((call) => String(call[0]).includes("/help-requests")),
    ).toBe(false);
  });
});

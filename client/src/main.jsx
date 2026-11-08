import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import "./i18n";
import App from "./App.jsx";
import store from "./store.jsx";

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error?.config?.url || "");
    if (
      error?.response?.data?.errorCode === "ACCOUNT_BLOCKED" &&
      !requestUrl.includes("/api/auth/login")
    ) {
      window.dispatchEvent(new CustomEvent("helpnearby-account-blocked"));
    }
    return Promise.reject(error);
  },
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);

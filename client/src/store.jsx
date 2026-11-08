import { configureStore } from "@reduxjs/toolkit";
import themeReducer from "./features/themeSlice";
import languageReducer from "./features/languageSlice";
import authReducer from "./features/authSlice";
import servicesReducer from "./features/servicesSlice";
import notificationsReducer from "./features/notificationsSlice";
import helpRequestsReducer from "./features/helpRequestsSlice";

const store = configureStore({
  reducer: {
    theme: themeReducer,
    language: languageReducer,
    auth: authReducer,
    services: servicesReducer,
    notifications: notificationsReducer,
    helpRequests: helpRequestsReducer,
  },
});

export default store;

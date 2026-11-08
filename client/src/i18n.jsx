import axios from "axios";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ar from "./locales/ar.json";
import { readStoredLanguage } from "./features/languageSlice";

const language = readStoredLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    ar: {
      translation: ar,
    },
  },

  lng: language,
  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

axios.defaults.headers.common["Accept-Language"] = language;

if (typeof document !== "undefined") {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}

export default i18n;

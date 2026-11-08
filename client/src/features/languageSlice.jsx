import { createSlice } from "@reduxjs/toolkit";

export const readStoredLanguage = () => {
  try {
    const stored = sessionStorage.getItem("language");
    return stored === "ar" || stored === "en" ? stored : "en";
  } catch {
    return "en";
  }
};

const initialState = {
  language: readStoredLanguage(),
};

const languageSlice = createSlice({
  name: "language",
  initialState,
  reducers: {
    toggleLanguage: (state) => {
      state.language = state.language === "en" ? "ar" : "en";
      sessionStorage.setItem("language", state.language);
    },
  },
});

export const { toggleLanguage } = languageSlice.actions;
export default languageSlice.reducer;

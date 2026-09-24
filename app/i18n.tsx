"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Locale = "zh" | "en";

export const ENGLISH_READY = false;

const STORAGE_KEY = "westlake-guide-locale";
const I18nContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: "zh", setLocale: () => undefined });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    if (saved !== "en" || !ENGLISH_READY) return;
    const timer = window.setTimeout(() => setLocaleState("en"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the in-memory preference. */ }
  };

  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function T({ zh, en }: { zh: string; en: string }) {
  const { locale } = useI18n();
  return <>{locale === "zh" ? zh : en}</>;
}

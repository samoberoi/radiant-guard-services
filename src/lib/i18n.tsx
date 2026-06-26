import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LangCode = "en" | "hi" | "mr";

export const LANG_LABELS: Record<LangCode, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

export const NAME_TO_CODE: Record<string, LangCode> = {
  english: "en",
  hindi: "hi",
  marathi: "mr",
};

const STORAGE_KEY = "rg.lang";

// Dictionary — keys are English source strings. Untranslated strings fall back to English.
const DICT: Record<LangCode, Record<string, string>> = {
  en: {},
  hi: {
    "Dashboard": "डैशबोर्ड",
    "Organizations": "संगठन",
    "Contracts": "अनुबंध",
    "Employees": "कर्मचारी",
    "Attendance": "उपस्थिति",
    "Payroll": "वेतन",
    "Invoice": "चालान",
    "Inventory": "इन्वेंट्री",
    "Vehicles": "वाहन",
    "Assets": "संपत्तियाँ",
    "Office Assets": "कार्यालय संपत्तियाँ",
    "Control Center": "नियंत्रण केंद्र",
    "My Profile": "मेरी प्रोफ़ाइल",
    "My Inventory": "मेरी इन्वेंट्री",
    "Logout": "लॉग आउट",
    "Sign out": "साइन आउट",
    "Search": "खोजें",
    "Save": "सहेजें",
    "Cancel": "रद्द करें",
    "Add New": "नया जोड़ें",
    "Edit": "संपादित करें",
    "Delete": "हटाएँ",
    "Export": "निर्यात",
    "Status": "स्थिति",
    "Name": "नाम",
    "Actions": "क्रियाएँ",
    "Language": "भाषा",
    "Settings": "सेटिंग्स",
    "Notifications": "सूचनाएँ",
    "Profile": "प्रोफ़ाइल",
    "Open": "खोलें",
    "Enabled": "सक्षम",
    "Disabled": "अक्षम",
    "Yes": "हाँ",
    "No": "नहीं",
    "Loading…": "लोड हो रहा है…",
    "No data": "कोई डेटा नहीं",
  },
  mr: {
    "Dashboard": "डॅशबोर्ड",
    "Organizations": "संस्था",
    "Contracts": "करार",
    "Employees": "कर्मचारी",
    "Attendance": "उपस्थिती",
    "Payroll": "पगारपत्रक",
    "Invoice": "चलन",
    "Inventory": "साठा",
    "Vehicles": "वाहने",
    "Assets": "मालमत्ता",
    "Office Assets": "कार्यालयीन मालमत्ता",
    "Control Center": "नियंत्रण केंद्र",
    "My Profile": "माझे प्रोफाइल",
    "My Inventory": "माझा साठा",
    "Logout": "बाहेर पडा",
    "Sign out": "बाहेर पडा",
    "Search": "शोधा",
    "Save": "जतन करा",
    "Cancel": "रद्द करा",
    "Add New": "नवीन जोडा",
    "Edit": "संपादित करा",
    "Delete": "हटवा",
    "Export": "निर्यात",
    "Status": "स्थिती",
    "Name": "नाव",
    "Actions": "क्रिया",
    "Language": "भाषा",
    "Settings": "सेटिंग्ज",
    "Notifications": "सूचना",
    "Profile": "प्रोफाइल",
    "Open": "उघडा",
    "Enabled": "सक्षम",
    "Disabled": "अक्षम",
    "Yes": "होय",
    "No": "नाही",
    "Loading…": "लोड होत आहे…",
    "No data": "डेटा नाही",
  },
};

type Ctx = {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (s: string) => string;
  enabled: LangCode[];
};

const I18nCtx = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (s) => s,
  enabled: ["en", "hi", "mr"],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");
  const [enabled, setEnabled] = useState<LangCode[]>(["en", "hi", "mr"]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (stored && ["en", "hi", "mr"].includes(stored)) setLangState(stored);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("languages" as never)
          .select("name,enabled")
          .returns<Array<{ name: string; enabled: boolean }>>();
        if (!alive || !data) return;
        const codes = data
          .filter((r) => r.enabled)
          .map((r) => NAME_TO_CODE[r.name.trim().toLowerCase()])
          .filter((c): c is LangCode => !!c);
        const uniq = Array.from(new Set<LangCode>(["en", ...codes]));
        setEnabled(uniq);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (s: string) => {
      if (lang === "en") return s;
      return DICT[lang][s] ?? s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, enabled }), [lang, setLang, t, enabled]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}

export function useT() {
  return useContext(I18nCtx).t;
}

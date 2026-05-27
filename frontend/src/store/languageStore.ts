import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'uz' | 'ru' | 'en';

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'uz',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'bozor-language' }
  )
);

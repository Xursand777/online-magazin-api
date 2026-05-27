import { useLanguageStore } from '../store/languageStore';
import translations from './translations';

export const useTranslation = () => {
  const language = useLanguageStore((s) => s.language);
  const t = translations[language];
  return { t, language };
};

export default useTranslation;

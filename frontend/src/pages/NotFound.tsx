import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <span className="material-symbols-outlined text-[80px] text-primary mb-4">
        sentiment_dissatisfied
      </span>
      <h1 className="text-h1 font-h1 text-on-surface mb-2">404</h1>
      <h2 className="text-h3 font-h3 text-on-surface-variant mb-6">
        Sahifa topilmadi
      </h2>
      <p className="text-body-md font-body-md text-on-surface-variant max-w-md mb-8">
        Siz qidirayotgan sahifa o'chirilgan, nomi o'zgartirilgan yoki vaqtinchalik mavjud bo'lmasligi mumkin.
      </p>
      <Link
        to="/"
        className="px-6 py-3 bg-primary text-on-primary rounded-xl font-label-md hover:opacity-90 transition-opacity flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-[20px]">home</span>
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
};

export default NotFound;

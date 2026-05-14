import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="hidden md:block bg-surface-container-lowest w-full py-12 px-8 border-t mt-16 border-outline-variant">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
        <div>
          <div className="text-lg font-bold text-primary mb-4">Bozor</div>
          <p className="font-sans text-sm text-on-surface-variant">
            © 2024 Bozor. All rights reserved. Registered Marketplace of Uzbekistan.
          </p>
        </div>
        <div className="flex flex-col gap-2 font-sans text-sm text-on-surface-variant">
          <Link to="/about" className="hover:text-primary hover:underline">About Us</Link>
          <Link to="/delivery" className="hover:text-primary hover:underline">Delivery Policy</Link>
        </div>
        <div className="flex flex-col gap-2 font-sans text-sm text-on-surface-variant">
          <Link to="/payments" className="hover:text-primary hover:underline">Payment Methods</Link>
          <Link to="/help" className="hover:text-primary hover:underline">Help Center</Link>
        </div>
        <div className="flex flex-col gap-2 font-sans text-sm text-on-surface-variant">
          <Link to="/terms" className="hover:text-primary hover:underline">Terms & Conditions</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

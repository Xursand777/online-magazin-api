import { Outlet } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import BottomNavBar from '../components/BottomNavBar';
import Footer from '../components/Footer';

const MainLayout = () => {
  return (
    <>
      <TopNavBar />
      <main className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop w-full mt-md mb-lg min-h-screen">
        <Outlet />
      </main>
      <Footer />
      <BottomNavBar />
    </>
  );
};

export default MainLayout;

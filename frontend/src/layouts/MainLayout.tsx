import { Outlet } from 'react-router-dom';
import { AssistantWidget } from '../components/AssistantWidget';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';

export const MainLayout = () => (
  <div className="app-shell">
    <Navbar />
    <main id="main-content" className="page-shell">
      <Outlet />
    </main>
    <Footer />
    <AssistantWidget />
  </div>
);

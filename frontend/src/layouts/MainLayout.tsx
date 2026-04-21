import { useOutlet } from 'react-router-dom';
import { AssistantWidget } from '../components/AssistantWidget';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';

export const MainLayout = () => {
  const outlet = useOutlet();

  return (
    <div className="app-shell">
      <Navbar />
      <main id="main-content" className="page-shell">
        {outlet}
      </main>
      <Footer />
      <AssistantWidget />
    </div>
  );
};

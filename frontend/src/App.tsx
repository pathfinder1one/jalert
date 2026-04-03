import { BrowserRouter } from 'react-router-dom';
import { LoadingState } from './components/LoadingState';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { AppRouter } from './routes/AppRouter';

function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PreferencesProvider>
            <AppRouter />
          </PreferencesProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}

export default App;

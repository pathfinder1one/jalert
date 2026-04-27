import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogIn, LogOut, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export const ProfileDropdown = () => {
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="profile-wrap" ref={wrapRef}>
      <button
        type="button"
        className="profile-trigger"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isAuthenticated ? user?.name?.split(' ')[0] : 'Account'}
        <ChevronDown size={16} />
      </button>

      {isOpen ? (
        <div className="profile-menu">
          <Link to="/profile" onClick={() => setIsOpen(false)}>
            {t('nav.viewProfile')}
            <UserRound size={16} />
          </Link>
          {!isAuthenticated ? (
            <>
              <Link to="/login" onClick={() => setIsOpen(false)}>
                {t('nav.login')}
                <LogIn size={16} />
              </Link>
              <Link to="/admin/login" onClick={() => setIsOpen(false)}>
                Admin login
                <ShieldCheck size={16} />
              </Link>
              <Link to="/register" onClick={() => setIsOpen(false)}>
                {t('nav.register')}
                <UserPlus size={16} />
              </Link>
            </>
          ) : (
            <>
              <Link to="/notifications" onClick={() => setIsOpen(false)}>
                Notifications
                <Bell size={16} />
              </Link>
              {user?.role === 'admin' ? (
                <Link to="/admin-portal" onClick={() => setIsOpen(false)}>
                  Admin portal
                  <ShieldCheck size={16} />
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  logout();
                  setIsOpen(false);
                  navigate('/');
                }}
              >
                {t('nav.logout')}
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export const LoginPage = () => {
  const { t } = useTranslation();
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  if (isAuthenticated) {
    return <Navigate replace to={user?.role === 'admin' ? '/admin-portal' : '/'} />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">Welcome back</div>
        <h1>{t('auth.welcomeBack')}</h1>
        <p className="section-subtitle">
          Sign in to check your village alerts, water readings, and health reports.
        </p>

        <form
          className="stack"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const profile = await login(values.email, values.password);
              toast.success('Logged in successfully.');
              if (profile.role === 'admin') {
                navigate('/admin-portal', { replace: true });
              }
            } catch {
              toast.error('Login failed. Please check your email and password.');
            }
          })}
        >
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" {...form.register('email')} />
            {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" {...form.register('password')} />
            {form.formState.errors.password ? <span className="field-error">{form.formState.errors.password.message}</span> : null}
          </div>
          <button type="submit" className="primary-button">
            Login
          </button>
        </form>

        <div className="auth-paths">
          <Link className="auth-path-chip" to="/admin/login">
            <ShieldCheck size={16} />
            Administrator login
          </Link>
          <Link className="auth-path-chip" to="/register">
            Need an account? Create one here
          </Link>
        </div>
      </section>
    </main>
  );
};

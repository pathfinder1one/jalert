import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';

import { useAuth } from '../context/AuthContext';

const schema = z.object({
  email: z.string().email('Enter a valid administrator email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, user } = useAuth();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  if (isAuthenticated && user?.role === 'admin') {
    return <Navigate replace to="/admin-portal" />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  return (
    <main className="auth-shell admin-login-shell">
      <section className="auth-card admin-login-card">
        <div className="admin-login-banner">
          <ShieldCheck size={18} />
          <span>Administrator access</span>
        </div>
        <div className="eyebrow">Separate portal</div>
        <h1>Sign in to the administrator portal</h1>
        <p className="section-subtitle">
          Use an administrator account to review village operations, monitor reporting readiness, and manage response workflows.
        </p>

        <form
          className="stack"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const profile = await login(values.email, values.password);
              if (profile.role !== 'admin') {
                logout();
                toast.error('This login page is reserved for administrator accounts.');
                return;
              }

              toast.success('Administrator login successful.');
              navigate('/admin-portal', { replace: true });
            } catch {
              toast.error('Administrator login failed. Please verify your credentials.');
            }
          })}
        >
          <div className="field">
            <label htmlFor="admin-email">Administrator email</label>
            <input id="admin-email" type="email" {...form.register('email')} />
            {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" {...form.register('password')} />
            {form.formState.errors.password ? <span className="field-error">{form.formState.errors.password.message}</span> : null}
          </div>
          <button type="submit" className="primary-button">
            Open administrator portal
          </button>
        </form>

        <div className="auth-paths">
          <Link className="auth-path-chip" to="/login">
            Use regular login
          </Link>
          <Link className="auth-path-chip" to="/register">
            Create public account
          </Link>
        </div>
      </section>
    </main>
  );
};

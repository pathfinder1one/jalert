import { Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LANGUAGES } from '../i18n/languages';
import { villageService } from '../services/villageService';

const schema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(8, 'Enter a valid phone number').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['public', 'admin']),
  preferred_language: z.string().min(2),
  village_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type RegisterRole = FormValues['role'];

const normalizePhone = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.replace(/^0+/, '') || digitsOnly;
};

const resolveRegisterError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length) {
      const firstIssue = detail[0];
      if (typeof firstIssue?.msg === 'string') {
        return firstIssue.msg;
      }
    }
  }

  return 'Registration failed. Please try again.';
};

export const RegisterPage = () => {
  const { t } = useTranslation();
  const { register, isAuthenticated, user } = useAuth();
  const villagesQuery = useQuery({
    queryKey: ['villages-register'],
    queryFn: villageService.list,
    enabled: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: 'public',
      preferred_language: 'en',
    },
  });

  const selectedRole = form.watch('role');

  if (isAuthenticated) {
    return <Navigate replace to={user?.role === 'admin' ? '/admin-portal' : '/'} />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">Create account</div>
        <h1>{t('auth.createAccount')}</h1>
        <p className="section-subtitle">
          Create an account to follow village alerts, submit reports, and set your language preferences.
        </p>

        <div className="field">
          <label>Choose account type</label>
          <div className="register-role-toggle" role="tablist" aria-label="Choose account type">
            {[
              {
                value: 'public' as RegisterRole,
                label: 'Public account',
                description: 'Use the main JALERT website and village tools.',
                icon: <UserRound size={16} />,
              },
              {
                value: 'admin' as RegisterRole,
                label: 'Administrator account',
                description: 'Open the separate administrator portal after signup.',
                icon: <ShieldCheck size={16} />,
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`register-role-card ${selectedRole === option.value ? 'active' : ''}`}
                onClick={() => form.setValue('role', option.value, { shouldDirty: true })}
              >
                <span className="register-role-label">
                  {option.icon}
                  {option.label}
                </span>
                <span className="register-role-description">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <form
          className="stack"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const profile = await register({
                ...values,
                phone: normalizePhone(values.phone),
                village_id: values.village_id || undefined,
              });
              toast.success(
                profile.role === 'admin'
                  ? 'Administrator account created successfully.'
                  : 'Account created successfully.',
              );
            } catch (error) {
              toast.error(resolveRegisterError(error));
            }
          })}
        >
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" {...form.register('name')} />
              {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" {...form.register('phone')} placeholder="Enter mobile number" />
              {form.formState.errors.phone ? <span className="field-error">{form.formState.errors.phone.message}</span> : null}
            </div>
          </div>

          <div className="form-grid two">
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
          </div>

          <div className="form-grid two">
            <div className="field">
              <label htmlFor="preferred_language">Preferred language</label>
              <select id="preferred_language" {...form.register('preferred_language')}>
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="village_id">Village</label>
              <select
                id="village_id"
                {...form.register('village_id')}
                onFocus={() => {
                  if (!villagesQuery.data) {
                    void villagesQuery.refetch();
                  }
                }}
              >
                <option value="">Choose later</option>
                {villagesQuery.data?.map((village) => (
                  <option key={village.id} value={village.id}>
                    {village.name}, {village.district}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="primary-button">
            {selectedRole === 'admin' ? 'Register as administrator' : 'Register'}
          </button>
        </form>

        {selectedRole === 'admin' ? (
          <p className="register-role-note">
            Administrator signup will create an account with admin access and then open the separate administrator portal.
          </p>
        ) : null}
        <p className="subtle">
          Phone numbers are cleaned automatically. For example, `09368646394` will be saved as `9368646394`.
        </p>

        <p className="subtle">
          Already registered? <Link to="/login">Login here</Link>
        </p>
        <div className="auth-paths">
          <Link className="auth-path-chip" to="/admin/login">
            Administrator login
          </Link>
        </div>
      </section>
    </main>
  );
};

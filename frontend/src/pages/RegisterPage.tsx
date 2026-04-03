import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
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
  preferred_language: z.string().min(2),
  village_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export const RegisterPage = () => {
  const { t } = useTranslation();
  const { register, isAuthenticated } = useAuth();
  const villagesQuery = useQuery({
    queryKey: ['villages-register'],
    queryFn: villageService.list,
    enabled: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      preferred_language: 'en',
    },
  });

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">Create account</div>
        <h1>{t('auth.createAccount')}</h1>
        <p className="section-subtitle">
          Create an account to follow village alerts, submit reports, and set your language preferences.
        </p>

        <form
          className="stack"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await register({
                ...values,
                phone: values.phone || undefined,
                village_id: values.village_id || undefined,
              });
              toast.success('Account created successfully.');
            } catch {
              toast.error('Registration failed. Please try again.');
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
              <input id="phone" {...form.register('phone')} />
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
            Register
          </button>
        </form>

        <p className="subtle">
          Already registered? <Link to="/login">Login here</Link>
        </p>
      </section>
    </main>
  );
};

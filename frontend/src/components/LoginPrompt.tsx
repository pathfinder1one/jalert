import { FileText, LockKeyhole, ShieldCheck, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LoginPrompt = ({
  title = 'Login is required to view this section',
  description = 'Please sign in to securely access village data and reports.',
}: {
  title?: string;
  description?: string;
}) => (
  <div className="login-prompt">
    <div className="login-prompt__content">
      <span className="login-prompt__eyebrow">Secure access</span>

      <div className="login-prompt__heading">
        <div className="login-prompt__icon" aria-hidden="true">
          <LockKeyhole size={24} />
        </div>

        <div className="login-prompt__copy">
          <h3>{title}</h3>
          <p className="section-subtitle">{description}</p>
        </div>
      </div>

      <div className="login-prompt__actions">
        <Link to="/login" className="primary-button">
          Login
        </Link>
        <Link to="/register" className="secondary-button">
          Create account
        </Link>
      </div>
    </div>

    <aside className="login-prompt__panel" aria-label="Benefits after signing in">
      <p className="login-prompt__panel-title">What you unlock</p>

      <div className="login-prompt__feature-list">
        <div className="login-prompt__feature">
          <span className="login-prompt__feature-icon" aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>Trusted village dashboards</strong>
            <span>See live risk summaries, alerts, and health signals in one place.</span>
          </div>
        </div>

        <div className="login-prompt__feature">
          <span className="login-prompt__feature-icon" aria-hidden="true">
            <Waves size={18} />
          </span>
          <div>
            <strong>Water and sensor insights</strong>
            <span>Track readings, recent trends, and practical next steps.</span>
          </div>
        </div>

        <div className="login-prompt__feature">
          <span className="login-prompt__feature-icon" aria-hidden="true">
            <FileText size={18} />
          </span>
          <div>
            <strong>Private reports and records</strong>
            <span>Access generated reports securely and continue where you left off.</span>
          </div>
        </div>
      </div>
    </aside>
  </div>
);

import { Link } from 'react-router-dom';

export const LoginPrompt = ({
  title = 'Login is required to view this section',
  description = 'Please sign in to securely access village data and reports.',
}: {
  title?: string;
  description?: string;
}) => (
  <div className="login-prompt">
    <h3>{title}</h3>
    <p className="section-subtitle">{description}</p>
    <div className="helper-row">
      <Link to="/login" className="primary-button">
        Login
      </Link>
      <Link to="/register" className="secondary-button">
        Register
      </Link>
    </div>
  </div>
);

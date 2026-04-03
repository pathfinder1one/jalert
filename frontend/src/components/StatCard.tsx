export const StatCard = ({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) => (
  <article className="metric-card">
    <p className="subtle">{label}</p>
    <span className="stat-value">{value}</span>
    {helper ? <p className="subtle">{helper}</p> : null}
  </article>
);

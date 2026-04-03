export const EmptyState = ({
  title = 'Nothing to show yet',
  description = 'When new data arrives, it will appear here.',
}: {
  title?: string;
  description?: string;
}) => (
  <div className="empty-state">
    <h3>{title}</h3>
    <p className="section-subtitle">{description}</p>
  </div>
);

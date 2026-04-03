export const LoadingState = ({ label = 'Loading data...' }: { label?: string }) => (
  <div className="loading-state">
    <h3>Please wait</h3>
    <p className="section-subtitle">{label}</p>
  </div>
);

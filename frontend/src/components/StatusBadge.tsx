import { sentenceCase } from '../utils/format';

export const StatusBadge = ({ value }: { value: string }) => (
  <span className={`status-badge ${value}`}>{sentenceCase(value)}</span>
);

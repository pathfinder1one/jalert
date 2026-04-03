import type { Village } from '../types/api';

export const VillageSelector = ({
  villages,
  value,
  onChange,
  label = 'Village',
}: {
  villages: Village[];
  value: string | null;
  onChange: (value: string) => void;
  label?: string;
}) => (
  <div className="field">
    <label htmlFor="village-selector">{label}</label>
    <select
      id="village-selector"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" disabled>
        Select village
      </option>
      {villages.map((village) => (
        <option key={village.id} value={village.id}>
          {village.name}, {village.district}, {village.state}
        </option>
      ))}
    </select>
  </div>
);

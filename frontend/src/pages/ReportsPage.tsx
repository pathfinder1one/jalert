import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { imagery } from '../assets/imagery';
import { EmptyState } from '../components/EmptyState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { ReportDownloadCard } from '../components/ReportDownloadCard';
import { VillageSelector } from '../components/VillageSelector';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { reportService } from '../services/reportService';
import { villageService } from '../services/villageService';

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const ReportsPage = () => {
  const { isAuthenticated, user } = useAuth();
  const { activeVillageId, setActiveVillageId } = usePreferences();
  const [search, setSearch] = useState('');
  const [shareLink, setShareLink] = useState<string | null>(null);

  const villagesQuery = useQuery({
    queryKey: ['villages'],
    queryFn: villageService.list,
    enabled: isAuthenticated,
  });

  const canAccess = user?.role === 'admin' || user?.role === 'health_worker';

  const cards = useMemo(
    () => [
      {
        id: 'pdf',
        title: 'Village PDF summary',
        description: 'Download a printable village summary with current risk details and guidance.',
        actionLabel: 'Download PDF',
        search: 'pdf summary print risk village',
        action: async () => {
          const blob = await reportService.downloadPdf(activeVillageId!);
          saveBlob(blob, `jalert-${activeVillageId}-summary.pdf`);
          toast.success('PDF report downloaded.');
        },
      },
      {
        id: 'csv',
        title: 'Sensor history export',
        description: 'Export recent sensor readings in CSV format for field analysis or review.',
        actionLabel: 'Download CSV',
        search: 'csv sensor export history',
        action: async () => {
          const blob = await reportService.downloadSensorCsv(activeVillageId!, 7);
          saveBlob(blob, `jalert-${activeVillageId}-sensors.csv`);
          toast.success('CSV export downloaded.');
        },
      },
      {
        id: 'secure-link',
        title: 'Secure share link',
        description: 'Generate a time-limited download link for sharing a report securely.',
        actionLabel: 'Generate secure link',
        search: 'share secure link report',
        action: async () => {
          const upload = await reportService.uploadPdf(activeVillageId!);
          setShareLink(upload.download_url);
          toast.success('Secure report link created.');
        },
      },
    ],
    [activeVillageId],
  );

  const filteredCards = cards.filter((card) =>
    `${card.title} ${card.description} ${card.search}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHero
        eyebrow="Report access"
        title="Download, export, and share village reports"
        subtitle="Use friendly report cards to access PDFs, sensor exports, and secure sharing tools."
        image={imagery.report}
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : !canAccess ? (
        <section className="section">
          <EmptyState
            title="Reports are shared through authorized field users"
            description="Village reports are currently available to health workers and administrators."
          />
        </section>
      ) : (
        <>
          <section className="section content-card">
            <div className="inline-between">
              <VillageSelector
                villages={villagesQuery.data ?? []}
                value={activeVillageId}
                onChange={setActiveVillageId}
              />
              <div className="field" style={{ minWidth: '240px' }}>
                <label htmlFor="report-search">Search report tools</label>
                <input
                  id="report-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search report types"
                />
              </div>
            </div>
          </section>

          {!activeVillageId ? (
            <section className="section">
              <EmptyState title="Choose a village to access reports" description="Once selected, report downloads and exports will appear." />
            </section>
          ) : (
            <section className="section card-grid">
              {filteredCards.map((card) => (
                <ReportDownloadCard
                  key={card.id}
                  title={card.title}
                  description={card.description}
                  actionLabel={card.actionLabel}
                  onAction={() => void card.action()}
                  secondaryAction={
                    card.id === 'secure-link' && shareLink ? (
                      <a className="link-chip" href={shareLink} target="_blank" rel="noreferrer">
                        Open secure link
                      </a>
                    ) : undefined
                  }
                />
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
};

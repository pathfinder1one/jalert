import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, FileText, HeartPulse, Link2, ShieldCheck, Waves } from 'lucide-react';
import toast from 'react-hot-toast';

import { imagery } from '../assets/imagery';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { ReportDownloadCard } from '../components/ReportDownloadCard';
import { VillageSelector } from '../components/VillageSelector';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { reportService } from '../services/reportService';
import { villageService } from '../services/villageService';
import { formatNumber } from '../utils/format';

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const openBlob = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 15000);
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
    staleTime: 300_000,
  });

  const canAccess = user?.role === 'admin' || user?.role === 'health_worker';

  useEffect(() => {
    if (!activeVillageId && villagesQuery.data?.length) {
      setActiveVillageId(villagesQuery.data[0].id);
    }
  }, [activeVillageId, setActiveVillageId, villagesQuery.data]);

  const dashboardQuery = useQuery({
    queryKey: ['report-dashboard', activeVillageId],
    queryFn: () => villageService.getDashboard(activeVillageId!),
    enabled: isAuthenticated && !!activeVillageId,
    staleTime: 60_000,
  });

  const reportActivityQuery = useQuery({
    queryKey: ['report-activity'],
    queryFn: () => reportService.listActivity(20),
    enabled: isAuthenticated && canAccess,
    staleTime: 30_000,
  });
  const villageCount = villagesQuery.data?.length ?? 0;
  const qualityScore = dashboardQuery.data?.latest_sensor.quality_score;
  const riskScore = dashboardQuery.data?.risk.score;
  const alertCount = dashboardQuery.data?.active_alerts.length ?? 0;
  const scoreText = qualityScore != null ? formatNumber(qualityScore) : 'Live';
  const riskText = riskScore != null ? formatNumber(riskScore) : 'Ready';
  const coverageText = villageCount ? String(villageCount) : 'Live';
  const latestDateLabel = qualityScore != null ? 'Latest monitoring window' : 'Available after village sync';

  const denyIfUnauthorized = () => {
    if (!activeVillageId) {
      toast.error('Choose a village first to open report actions.');
      return true;
    }
    if (!canAccess) {
      toast.error('Report downloads are currently available to health workers and administrators.');
      return true;
    }
    return false;
  };

  const downloadPdf = async (filenameSuffix: string) => {
    if (denyIfUnauthorized()) return;
    const blob = await reportService.downloadPdf(activeVillageId!);
    saveBlob(blob, `jalert-${activeVillageId}-${filenameSuffix}.pdf`);
    toast.success('PDF report downloaded.');
  };

  const viewPdf = async () => {
    if (denyIfUnauthorized()) return;
    const blob = await reportService.downloadPdf(activeVillageId!);
    openBlob(blob);
  };

  const downloadCsv = async (days: number, filenameSuffix: string) => {
    if (denyIfUnauthorized()) return;
    const blob = await reportService.downloadSensorCsv(activeVillageId!, days);
    saveBlob(blob, `jalert-${activeVillageId}-${filenameSuffix}.csv`);
    toast.success('Sensor export downloaded.');
  };

  const viewCsv = async (days: number) => {
    if (denyIfUnauthorized()) return;
    const blob = await reportService.downloadSensorCsv(activeVillageId!, days);
    openBlob(blob);
  };

  const createShareLink = async () => {
    if (denyIfUnauthorized()) return;
    const upload = await reportService.uploadPdf(activeVillageId!);
    setShareLink(upload.download_url);
    window.open(upload.download_url, '_blank', 'noopener,noreferrer');
    toast.success('Secure report link created.');
  };

  const reportCards = [
    {
      id: 'water-quality',
      icon: <Waves size={28} />,
      iconClassName: 'report-showcase-icon-water',
      title: 'Village Water Quality Report',
      metaLabel: latestDateLabel,
      villageCountLabel: `${coverageText} villages`,
      metricValue: scoreText,
      metricLabel: 'avg score',
      search: 'water quality pdf report score villages',
      onDownload: () => void downloadPdf('water-quality-report'),
      onView: () => void viewPdf(),
    },
    {
      id: 'sensor-export',
      icon: <Activity size={28} />,
      iconClassName: 'report-showcase-icon-sensor',
      title: 'Seven-Day Sensor Export',
      metaLabel: 'Recent field monitoring',
      villageCountLabel: `${coverageText} villages`,
      metricValue: coverageText,
      metricLabel: 'villages covered',
      search: 'sensor csv export seven day villages',
      onDownload: () => void downloadCsv(7, 'sensor-export-7d'),
      onView: () => void viewCsv(7),
    },
    {
      id: 'share-link',
      icon: <Link2 size={28} />,
      iconClassName: 'report-showcase-icon-share',
      title: 'Secure Share Package',
      metaLabel: 'Time-limited access',
      villageCountLabel: `${coverageText} villages`,
      metricValue: shareLink ? 'Ready' : 'Locked',
      metricLabel: 'share status',
      search: 'secure share link pdf access report',
      onDownload: () => void createShareLink(),
      onView: () => void createShareLink(),
    },
    {
      id: 'district-health',
      icon: <HeartPulse size={28} />,
      iconClassName: 'report-showcase-icon-health',
      title: 'District Health Report',
      metaLabel: 'Health and water correlation',
      villageCountLabel: `${coverageText} villages`,
      metricValue: riskText,
      metricLabel: 'risk score',
      search: 'district health report risk pdf',
      onDownload: () => void downloadPdf('district-health-report'),
      onView: () => void viewPdf(),
    },
    {
      id: 'surveillance',
      icon: <FileText size={28} />,
      iconClassName: 'report-showcase-icon-surveillance',
      title: 'Disease Surveillance Export',
      metaLabel: 'Trend review package',
      villageCountLabel: `${alertCount} live alerts`,
      metricValue: alertCount ? String(alertCount) : '0',
      metricLabel: 'alert signals',
      search: 'disease surveillance export alerts csv',
      onDownload: () => void downloadCsv(30, 'surveillance-export-30d'),
      onView: () => void viewCsv(30),
    },
    {
      id: 'annual-summary',
      icon: <ShieldCheck size={28} />,
      iconClassName: 'report-showcase-icon-annual',
      title: 'Annual Water Safety Summary',
      metaLabel: 'Long-form leadership brief',
      villageCountLabel: `${coverageText} villages`,
      metricValue: scoreText,
      metricLabel: 'quality score',
      search: 'annual water safety summary pdf report',
      onDownload: () => void downloadPdf('annual-water-safety-summary'),
      onView: () => void viewPdf(),
    },
  ];

  const filteredCards = reportCards.filter((card) =>
    `${card.title} ${card.metaLabel} ${card.metricLabel} ${card.search}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHero
        eyebrow="Report access"
        title="Download, export, and share village reports"
        subtitle="Use friendly report cards to access PDFs, sensor exports, and secure sharing tools."
        image={imagery.report}
        badges={['PDF reports', 'Sensor CSV export', 'Secure share link', 'Annual summary']}
        primaryLabel="Browse report tools"
        primaryTo="/reports"
        secondaryLabel="Open alerts"
        secondaryTo="/alerts"
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
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

            {!canAccess ? (
              <div className="report-access-note">
                You can browse the report gallery now. Download and share actions are enabled for health workers and administrators.
              </div>
            ) : null}
          </section>

          <section className="section report-showcase-grid">
            {filteredCards.map((card) => (
              <ReportDownloadCard
                key={card.id}
                icon={card.icon}
                iconClassName={card.iconClassName}
                title={card.title}
                metaLabel={card.metaLabel}
                villageCountLabel={card.villageCountLabel}
                metricValue={card.metricValue}
                metricLabel={card.metricLabel}
                onDownload={card.onDownload}
                onView={card.onView}
                disabled={!activeVillageId}
              />
            ))}
          </section>

          <section className="section content-card report-section-heading">
            <div>
              <div className="eyebrow">Recent report activity</div>
              <h2>Real export and sharing history</h2>
              <p className="section-subtitle">
                These entries are drawn from live report actions instead of sample placeholders.
              </p>
            </div>
          </section>

          <section className="section stack">
            {reportActivityQuery.data?.length ? (
              reportActivityQuery.data.map((item) => (
                <article key={item.id} className="content-card">
                  <div className="inline-between">
                    <div>
                      <h3>{item.action}</h3>
                      <p className="section-subtitle">{item.user_name || item.user_email || 'System action'}</p>
                    </div>
                    <span className="status-badge neutral">{item.created_at.slice(0, 10)}</span>
                  </div>
                  <div className="meta-row">
                    <span>{String(item.detail?.format || 'report')}</span>
                    {item.detail?.days ? <span>{String(item.detail.days)} day window</span> : null}
                    {item.detail?.village_id ? <span>Village {String(item.detail.village_id)}</span> : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="content-card">
                <p className="section-subtitle">
                  No report generation history is available yet. Export or share a report to build the live activity log.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
};

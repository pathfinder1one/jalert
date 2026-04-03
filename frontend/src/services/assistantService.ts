import { alertService } from './alertService';
import { predictionService } from './predictionService';
import { reportService } from './reportService';
import { sensorService } from './sensorService';
import { villageService } from './villageService';
import { formatDate, formatNumber, sentenceCase } from '../utils/format';
import type { AssistantReply, UserRole } from '../types/api';

interface AssistantContext {
  villageId?: string | null;
  role?: UserRole;
  isAuthenticated: boolean;
}

const createReply = (text: string, links?: AssistantReply['links']): AssistantReply => ({
  id:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  text,
  links,
});

export const assistantService = {
  async respond(message: string, context: AssistantContext): Promise<AssistantReply> {
    const normalized = message.toLowerCase();
    const villageId = context.villageId;

    if (!context.isAuthenticated) {
      return createReply(
        'Please sign in first so I can check your village alerts, reports, and water status securely.',
        [
          { label: 'Login', href: '/login' },
          { label: 'Register', href: '/register' },
        ],
      );
    }

    if (!villageId) {
      return createReply(
        'Choose a village first. Then I can explain the local alerts, water readings, and health updates for that area.',
        [{ label: 'Village Status', href: '/village-status' }],
      );
    }

    if (normalized.includes('alert')) {
      const alerts = await alertService.list({ village_id: villageId, limit: 3, status: 'active' });
      if (!alerts.length) {
        return createReply('There are no active alerts for your selected village right now.');
      }

      const summary = alerts
        .map((item) => `${sentenceCase(item.severity)}: ${item.title}`)
        .join(' | ');

      return createReply(`Here are the latest active alerts: ${summary}`, [
        { label: 'Open Alerts', href: '/alerts' },
      ]);
    }

    if (normalized.includes('prediction') || normalized.includes('explain')) {
      const explanation = await predictionService.explain(villageId);
      return createReply(explanation.explanation, [
        { label: 'View Predictions', href: '/predictions' },
      ]);
    }

    if (normalized.includes('water') || normalized.includes('safe')) {
      const dashboard = await villageService.getDashboard(villageId);
      const sensor = dashboard.latest_sensor;
      const scoreText =
        sensor.quality_score !== null && sensor.quality_score !== undefined
          ? `${formatNumber(sensor.quality_score)} out of 100`
          : 'not yet available';

      return createReply(
        `The latest water snapshot shows pH ${formatNumber(sensor.ph)}, turbidity ${formatNumber(sensor.turbidity)}, E.coli ${formatNumber(sensor.ecoli)}, and a quality score of ${scoreText}.`,
        [{ label: 'Open Water Monitoring', href: '/sensors' }],
      );
    }

    if (normalized.includes('status') || normalized.includes('village')) {
      const dashboard = await villageService.getDashboard(villageId);
      return createReply(
        `${dashboard.village.name} currently has ${dashboard.active_alerts.length} active alerts. The latest risk category is ${sentenceCase(dashboard.risk.category)} and the most recent update came at ${formatDate(dashboard.risk.last_updated)}.`,
        [{ label: 'Village Status', href: '/village-status' }],
      );
    }

    if (normalized.includes('report') || normalized.includes('download')) {
      if (context.role === 'public') {
        return createReply(
          'Reports are usually shared through village health workers. You can still open the reports page to learn what is available.',
          [{ label: 'Reports', href: '/reports' }],
        );
      }

      const upload = await reportService.uploadPdf(villageId);
      return createReply(
        'I generated a secure report link for your village summary. It will remain active for a limited time.',
        [
          { label: 'Reports Page', href: '/reports' },
          { label: 'Open Secure Link', href: upload.download_url },
        ],
      );
    }

    const readings = await sensorService.readings(villageId, 24, 12);
    return createReply(
      `I can help you check village status, explain predictions, review active alerts, and guide you to reports. I already found ${readings.length} recent water readings for your selected village.`,
      [
        { label: 'Village Status', href: '/village-status' },
        { label: 'View Alerts', href: '/alerts' },
      ],
    );
  },
};

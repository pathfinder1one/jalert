import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BellRing, CheckCheck } from 'lucide-react';

import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { LoginPrompt } from '../components/LoginPrompt';
import { PageHero } from '../components/PageHero';
import { StatusBadge } from '../components/StatusBadge';
import { imagery } from '../assets/imagery';
import { useAuth } from '../context/AuthContext';
import { notificationService } from '../services/notificationService';
import { formatDate, sentenceCase } from '../utils/format';

export const NotificationsPage = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 100 }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const unreadCount = (notificationsQuery.data ?? []).filter((item) => !item.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => notificationService.markRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: (result) => {
      toast.success(`${result.updated} notifications marked as read.`);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return (
    <>
      <PageHero
        eyebrow="Notification center"
        title="Track alert delivery, daily summaries, and action prompts"
        subtitle="This inbox keeps delivery history, unread status, and operational nudges in one place."
        image={imagery.report}
        badges={['In-app inbox', 'Delivery log', 'Unread tracking', 'Daily summaries']}
        primaryLabel="Open alerts"
        primaryTo="/alerts"
        secondaryLabel="Open profile"
        secondaryTo="/profile"
      />

      {!isAuthenticated ? (
        <section className="section">
          <LoginPrompt />
        </section>
      ) : (
        <>
          <section className="section content-card">
            <div className="inline-between">
              <div>
                <h2>Unread notifications</h2>
                <p className="section-subtitle">
                  {unreadCount} items still need review in your synced inbox.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending || unreadCount === 0}
              >
                <CheckCheck size={16} />
                Mark all as read
              </button>
            </div>
          </section>

          <section className="section stack">
            {notificationsQuery.isLoading && !notificationsQuery.data ? (
              <LoadingState label="Loading notifications..." />
            ) : null}
            {notificationsQuery.isError ? (
              <ErrorState description="Notification delivery history could not be loaded right now." />
            ) : null}
            {notificationsQuery.data?.length === 0 ? (
              <EmptyState
                title="No notifications yet"
                description="New alert delivery logs, summaries, and prompts will appear here."
              />
            ) : null}
            {notificationsQuery.data?.map((item) => (
              <article key={item.id} className="content-card interactive-card">
                <div className="inline-between">
                  <div className="stack-tight">
                    <div className="meta-row">
                      {item.severity ? <StatusBadge value={item.severity} /> : null}
                      <StatusBadge value={item.delivery_status} />
                      <span className="alert-card-type">
                        <BellRing size={14} />
                        {sentenceCase(item.channel.replace(/_/g, ' '))}
                      </span>
                    </div>
                    <h3>{item.title}</h3>
                  </div>
                  {!item.is_read ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => markReadMutation.mutate(item.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
                <p className="body-copy">{item.message}</p>
                <div className="meta-row">
                  <span>{formatDate(item.created_at)}</span>
                  {item.read_at ? <span>Read {formatDate(item.read_at)}</span> : null}
                  {item.link ? <span>Link {item.link}</span> : null}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
};

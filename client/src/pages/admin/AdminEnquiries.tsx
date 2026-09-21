import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { Enquiry } from '../../lib/types';
import { formatDate, relativeTime, statusMeta, truncate } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, DataTable, DefinitionList,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, ConfirmDialog, MailIcon, Modal, Pagination, PhoneIcon,
  Select, Textarea, TrashIcon,
} from '../../components/ui';

const STATUSES = ['NEW', 'IN_PROGRESS', 'QUOTED', 'CLOSED', 'SPAM'];
const TYPES = ['CONTACT', 'CUSTOM_ORDER', 'PRODUCT_ENQUIRY', 'BULK_ORDER', 'PRICE_REQUEST'];

export default function AdminEnquiries() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [viewing, setViewing] = useState<Enquiry | null>(null);
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState<Enquiry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-enquiries', page, search, status, type],
    queryFn: () => api.list<Enquiry[]>('/admin/enquiries', { page, perPage: 25, search, status, type }),
    placeholderData: keepPreviousData,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-enquiries'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.patch<Enquiry>(`/admin/enquiries/${id}`, payload),
    onSuccess: async (updated) => {
      await invalidate();
      if (viewing?.id === updated.id) setViewing(updated);
      push('Enquiry updated', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/enquiries/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      setViewing(null);
      push('Enquiry deleted', 'info');
    },
  });

  const enquiries = data?.data ?? [];

  const open = (enquiry: Enquiry) => {
    setViewing(enquiry);
    setNote(enquiry.adminNote ?? '');
    // Opening a new enquiry marks it as being worked on.
    if (enquiry.status === 'NEW') {
      update.mutate({ id: enquiry.id, payload: { status: 'IN_PROGRESS' } });
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Enquiries"
        description="Contact messages, custom order requests and price requests."
      />

      <AdminCard>
        <div className="mb-5 flex flex-wrap gap-3">
          <AdminSearch
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search name, email, message…"
            className="min-w-[240px] flex-1"
          />
          <Select
            value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            aria-label="Filter by status" className="w-auto min-w-[150px]"
            options={[
              { value: '', label: 'All statuses' },
              ...STATUSES.map((s) => ({ value: s, label: statusMeta(s).label })),
            ]}
          />
          <Select
            value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
            aria-label="Filter by type" className="w-auto min-w-[180px]"
            options={[
              { value: '', label: 'All types' },
              ...TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').toLowerCase() })),
            ]}
          />
        </div>

        <DataTable
          rows={enquiries}
          loading={isLoading}
          emptyTitle="No enquiries yet"
          emptyDescription="Messages from the contact and custom order forms land here."
          columns={[
            {
              key: 'from',
              header: 'From',
              render: (enquiry) => (
                <button type="button" onClick={() => open(enquiry)} className="text-left">
                  <p className="flex items-center gap-2 text-sm font-medium hover:underline">
                    {enquiry.name}
                    {enquiry.status === 'NEW' ? <Badge tone="warning">New</Badge> : null}
                  </p>
                  <p className="text-2xs text-ink-400">{enquiry.email}</p>
                </button>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: (enquiry) => (
                <Badge>{enquiry.type.replace(/_/g, ' ').toLowerCase()}</Badge>
              ),
            },
            {
              key: 'message',
              header: 'Message',
              render: (enquiry) => (
                <button type="button" onClick={() => open(enquiry)} className="text-left">
                  {enquiry.subject ? (
                    <p className="text-xs font-medium">{enquiry.subject}</p>
                  ) : null}
                  <p className="text-2xs text-ink-400">{truncate(enquiry.message, 70)}</p>
                </button>
              ),
            },
            {
              key: 'attachments',
              header: 'Files',
              render: (enquiry) =>
                enquiry.attachments?.length ? <Badge>{enquiry.attachments.length}</Badge> : null,
            },
            {
              key: 'status',
              header: 'Status',
              render: (enquiry) => {
                return (
                  <Select
                    value={enquiry.status}
                    aria-label="Change status"
                    className="w-auto min-w-[130px] py-1.5 text-xs"
                    onChange={(e) =>
                      update.mutate({ id: enquiry.id, payload: { status: e.target.value } })
                    }
                    options={STATUSES.map((s) => ({ value: s, label: statusMeta(s).label }))}
                  />
                );
              },
            },
            {
              key: 'received',
              header: 'Received',
              render: (enquiry) => (
                <span className="text-2xs text-ink-400">{relativeTime(enquiry.createdAt)}</span>
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (enquiry) => (
                <button
                  type="button"
                  onClick={() => setDeleting(enquiry)}
                  className="p-1.5 text-ink-400 hover:text-state-danger"
                  aria-label="Delete"
                >
                  <TrashIcon size={15} />
                </button>
              ),
            },
          ]}
        />

        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </AdminCard>

      {/* Detail */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `Enquiry from ${viewing.name}` : ''}
        size="lg"
        footer={
          viewing ? (
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <a
                  href={`mailto:${viewing.email}?subject=${encodeURIComponent(`Re: ${viewing.subject ?? 'Your enquiry'}`)}`}
                  className="inline-flex items-center gap-2 border border-ink px-4 py-2 text-2xs uppercase tracking-architect transition-colors hover:bg-ink hover:text-paper"
                >
                  <MailIcon size={14} /> Reply by email
                </a>
                {viewing.phone ? (
                  <a
                    href={`tel:${viewing.phone}`}
                    className="inline-flex items-center gap-2 border border-stone-line px-4 py-2 text-2xs uppercase tracking-architect transition-colors hover:border-ink"
                  >
                    <PhoneIcon size={14} /> Call
                  </a>
                ) : null}
              </div>
              <Button
                size="sm"
                loading={update.isPending}
                onClick={() => update.mutate({ id: viewing.id, payload: { adminNote: note } })}
              >
                Save note
              </Button>
            </div>
          ) : null
        }
      >
        {viewing ? (
          <div className="space-y-6">
            <DefinitionList
              rows={[
                { label: 'Type', value: <Badge>{viewing.type.replace(/_/g, ' ').toLowerCase()}</Badge> },
                { label: 'Email', value: <a href={`mailto:${viewing.email}`} className="link-underline">{viewing.email}</a> },
                ...(viewing.phone ? [{ label: 'Phone', value: viewing.phone }] : []),
                ...(viewing.company ? [{ label: 'Company', value: viewing.company }] : []),
                ...(viewing.quantity ? [{ label: 'Quantity', value: String(viewing.quantity) }] : []),
                ...(viewing.budget ? [{ label: 'Budget', value: viewing.budget }] : []),
                ...(viewing.product ? [{ label: 'Product', value: viewing.product.name }] : []),
                { label: 'Received', value: formatDate(viewing.createdAt, true) },
              ]}
            />

            <div>
              <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                Message
              </p>
              <div className="whitespace-pre-line border border-stone-line bg-paper-off p-4 text-sm leading-relaxed">
                {viewing.message}
              </div>
            </div>

            {viewing.attachments?.length ? (
              <div>
                <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                  Attachments
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {viewing.attachments.map((file) => (
                    <a
                      key={file.url}
                      href={assetUrl(file.url)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="border border-stone-line p-2 transition-colors hover:border-ink"
                    >
                      {/\.(png|jpe?g|webp|gif|svg)$/i.test(file.filename) ? (
                        <img src={assetUrl(file.url)} alt="" className="aspect-square w-full object-contain" />
                      ) : (
                        <span className="flex aspect-square items-center justify-center bg-paper-warm text-2xs uppercase text-ink-400">
                          {file.filename.split('.').pop()}
                        </span>
                      )}
                      <p className="mt-1.5 truncate text-2xs text-ink-500">{file.filename}</p>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                Internal note
              </p>
              <Textarea
                value={note}
                rows={3}
                placeholder="What did you quote? What is the next step?"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this enquiry?"
        message="The message and any attached files are permanently removed."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

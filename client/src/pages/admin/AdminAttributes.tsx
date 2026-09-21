import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import type { AttributeGroup, AttributeValue, ContentStatus } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader, SortableList, StatusToggle } from '../../components/admin/AdminKit';
import {
  Badge, Button, Checkbox, ConfirmDialog, EditIcon, Input, Modal, PlusIcon,
  Select, Skeleton, TrashIcon,
} from '../../components/ui';

const KINDS = [
  { value: 'MATERIAL', label: 'Material' },
  { value: 'STYLE', label: 'Style' },
  { value: 'SHAPE', label: 'Shape' },
  { value: 'PROFESSION', label: 'Profession' },
  { value: 'REQUIREMENT', label: 'Requirement' },
  { value: 'PRINT_CATEGORY', label: 'Print category' },
  { value: 'SIGN_CATEGORY', label: 'Sign category' },
  { value: 'OCCASION', label: 'Occasion' },
  { value: 'COLOUR', label: 'Colour' },
  { value: 'FONT', label: 'Font' },
  { value: 'OTHER', label: 'Other' },
];

interface GroupDraft {
  id?: string;
  name: string;
  kind: string;
  helpText: string;
  showInFilter: boolean;
  multiSelect: boolean;
  status: ContentStatus;
}

interface ValueDraft {
  id?: string;
  groupId: string;
  name: string;
  hexColor: string;
  status: ContentStatus;
}

export default function AdminAttributes() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [valueDraft, setValueDraft] = useState<ValueDraft | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<AttributeGroup | null>(null);
  const [deletingValue, setDeletingValue] = useState<AttributeValue | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-attribute-groups'],
    queryFn: () => api.list<AttributeGroup[]>('/admin/attribute-groups', { perPage: 100 }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-attribute-groups'] });
    await queryClient.invalidateQueries({ queryKey: ['catalog-filters'] });
  };

  const saveGroup = useMutation({
    mutationFn: (draft: GroupDraft) => {
      const payload = {
        name: draft.name,
        kind: draft.kind,
        helpText: draft.helpText || null,
        showInFilter: draft.showInFilter,
        multiSelect: draft.multiSelect,
        status: draft.status,
      };
      return draft.id
        ? api.patch(`/admin/attribute-groups/${draft.id}`, payload)
        : api.post('/admin/attribute-groups', payload);
    },
    onSuccess: async () => {
      await invalidate();
      setGroupDraft(null);
      push('Filter group saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save', 'error'),
  });

  const saveValue = useMutation({
    mutationFn: (draft: ValueDraft) => {
      const payload = {
        groupId: draft.groupId,
        name: draft.name,
        hexColor: draft.hexColor || null,
        status: draft.status,
      };
      return draft.id
        ? api.patch(`/admin/attribute-values/${draft.id}`, payload)
        : api.post('/admin/attribute-values', payload);
    },
    onSuccess: async () => {
      await invalidate();
      setValueDraft(null);
      push('Option saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save', 'error'),
  });

  const removeGroup = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/attribute-groups/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeletingGroup(null);
      push('Filter group deleted', 'info');
    },
  });

  const removeValue = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/attribute-values/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeletingValue(null);
      push('Option deleted', 'info');
    },
  });

  const setGroupStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      api.patch(`/admin/attribute-groups/${id}/status`, { status }),
    onSuccess: invalidate,
  });

  const reorderValues = useMutation({
    mutationFn: (items: AttributeValue[]) =>
      api.post('/admin/attribute-values/reorder', {
        items: items.map((item, index) => ({ id: item.id, sortOrder: index })),
      }),
    onSuccess: invalidate,
  });

  const groups = data?.data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Materials, styles & shapes"
        description="These groups become the filter rails on the shop page, and the tags you apply to each product."
        actions={
          <Button
            size="sm"
            icon={<PlusIcon size={14} />}
            onClick={() =>
              setGroupDraft({
                name: '', kind: 'OTHER', helpText: '',
                showInFilter: true, multiSelect: true, status: 'PUBLISHED',
              })
            }
          >
            Add filter group
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <AdminCard>
          <p className="py-10 text-center text-sm text-ink-400">
            No filter groups yet. Add one — Material, Style or Shape are good starting points.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <AdminCard
              key={group.id}
              title={group.name}
              description={group.helpText ?? `${group.values?.length ?? 0} options · ${group.kind.toLowerCase()}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {!group.showInFilter ? <Badge>Hidden from filters</Badge> : null}
                  <StatusToggle
                    status={group.status}
                    onChange={(status) => setGroupStatus.mutate({ id: group.id, status })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setGroupDraft({
                        id: group.id,
                        name: group.name,
                        kind: group.kind,
                        helpText: group.helpText ?? '',
                        showInFilter: group.showInFilter,
                        multiSelect: group.multiSelect,
                        status: group.status,
                      })
                    }
                    className="p-1.5 text-ink-400 hover:text-ink"
                    aria-label="Edit group"
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingGroup(group)}
                    className="p-1.5 text-ink-400 hover:text-state-danger"
                    aria-label="Delete group"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              }
            >
              {group.values?.length ? (
                <SortableList
                  items={group.values}
                  onReorder={(next) => reorderValues.mutate(next)}
                  renderItem={(value) => (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {value.hexColor ? (
                          <span className="h-4 w-4 border border-ink-100" style={{ background: value.hexColor }} />
                        ) : null}
                        <span className="text-sm">{value.name}</span>
                        <span className="font-mono text-2xs text-ink-300">{value.slug}</span>
                        {value.status === 'DRAFT' ? <Badge tone="warning">Draft</Badge> : null}
                        {value._count?.products ? (
                          <Badge>{value._count.products} products</Badge>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setValueDraft({
                              id: value.id,
                              groupId: group.id,
                              name: value.name,
                              hexColor: value.hexColor ?? '',
                              status: value.status,
                            })
                          }
                          className="p-1.5 text-ink-400 hover:text-ink"
                          aria-label="Edit option"
                        >
                          <EditIcon size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingValue(value)}
                          className="p-1.5 text-ink-400 hover:text-state-danger"
                          aria-label="Delete option"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                />
              ) : (
                <p className="py-4 text-center text-xs text-ink-400">No options yet.</p>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                icon={<PlusIcon size={13} />}
                onClick={() =>
                  setValueDraft({ groupId: group.id, name: '', hexColor: '', status: 'PUBLISHED' })
                }
              >
                Add option
              </Button>
            </AdminCard>
          ))}
        </div>
      )}

      {/* Group editor */}
      <Modal
        open={Boolean(groupDraft)}
        onClose={() => setGroupDraft(null)}
        title={groupDraft?.id ? 'Edit filter group' : 'Add filter group'}
      >
        {groupDraft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveGroup.mutate(groupDraft);
            }}
            className="space-y-5"
          >
            <Input
              label="Group name" required value={groupDraft.name}
              placeholder="e.g. Material"
              onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })}
            />
            <Select
              label="Kind" value={groupDraft.kind}
              hint="Used for grouping and for schema output."
              onChange={(e) => setGroupDraft({ ...groupDraft, kind: e.target.value })}
              options={KINDS}
            />
            <Input
              label="Help text" value={groupDraft.helpText}
              onChange={(e) => setGroupDraft({ ...groupDraft, helpText: e.target.value })}
            />
            <div className="space-y-3">
              <Checkbox
                label="Show as a filter on the shop page"
                checked={groupDraft.showInFilter}
                onChange={(v) => setGroupDraft({ ...groupDraft, showInFilter: v })}
              />
              <Checkbox
                label="Allow multiple selections"
                checked={groupDraft.multiSelect}
                onChange={(v) => setGroupDraft({ ...groupDraft, multiSelect: v })}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setGroupDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saveGroup.isPending}>
                Save group
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Value editor */}
      <Modal
        open={Boolean(valueDraft)}
        onClose={() => setValueDraft(null)}
        title={valueDraft?.id ? 'Edit option' : 'Add option'}
        size="sm"
      >
        {valueDraft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveValue.mutate(valueDraft);
            }}
            className="space-y-5"
          >
            <Input
              label="Option name" required value={valueDraft.name}
              placeholder="e.g. Stainless Steel"
              onChange={(e) => setValueDraft({ ...valueDraft, name: e.target.value })}
            />
            <div>
              <span className="field-label">Swatch colour (optional)</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={valueDraft.hexColor || '#111111'}
                  onChange={(e) => setValueDraft({ ...valueDraft, hexColor: e.target.value })}
                  className="h-10 w-14 cursor-pointer border border-stone-line bg-paper p-1"
                />
                <input
                  value={valueDraft.hexColor}
                  placeholder="Leave blank for no swatch"
                  className="field flex-1"
                  onChange={(e) => setValueDraft({ ...valueDraft, hexColor: e.target.value })}
                />
              </div>
            </div>
            <Checkbox
              label="Published"
              checked={valueDraft.status === 'PUBLISHED'}
              onChange={(v) => setValueDraft({ ...valueDraft, status: v ? 'PUBLISHED' : 'DRAFT' })}
            />
            <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setValueDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saveValue.isPending}>
                Save option
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingGroup)}
        title={`Delete "${deletingGroup?.name}"?`}
        message="All options in this group are deleted too, and removed from any product that used them."
        loading={removeGroup.isPending}
        onCancel={() => setDeletingGroup(null)}
        onConfirm={() => deletingGroup && removeGroup.mutate(deletingGroup.id)}
      />

      <ConfirmDialog
        open={Boolean(deletingValue)}
        title={`Delete "${deletingValue?.name}"?`}
        message="This option is removed from every product that uses it."
        loading={removeValue.isPending}
        onCancel={() => setDeletingValue(null)}
        onConfirm={() => deletingValue && removeValue.mutate(deletingValue.id)}
      />
    </>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import type { ContentStatus, HomeSection, SectionType } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import { useAdminTheme } from '../../lib/adminTheme';
import { ImageField, ProductPicker } from '../../components/admin/AdminKit';
import { SectionRenderer } from '../../components/home/Sections';
import {
  ArrowRight, Badge, Button, ChevronDown, CloseIcon, ConfirmDialog, CopyIcon, DragIcon, EyeIcon,
  Input, PageLoader, PlusIcon, SearchIcon, Select, Textarea, TrashIcon,
} from '../../components/ui';

/*
 * Three shapes the shared kit has no use for. They are outlines of a screen, a
 * tablet and a phone, drawn to the same 24px grid and stroke as everything in
 * components/ui so the toolbar stays of a piece.
 */
const deviceIcon = (body: ReactNode) =>
  function DeviceIcon({ size = 16 }: { size?: number }) {
    return (
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      >
        {body}
      </svg>
    );
  };

const MonitorIcon = deviceIcon(<><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>);
const TabletIcon = deviceIcon(<><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>);
const PhoneFrameIcon = deviceIcon(<><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M12 18h.01" /></>);
const ArrowLeft = ({ size = 18 }: { size?: number }) => (
  <ArrowRight size={size} className="rotate-180" />
);

/**
 * The visual page builder.
 *
 * Three columns: the widgets you can add, the page as it will really look, and
 * the fields for whichever block is selected.
 *
 * The middle column renders with the same components the storefront uses, so
 * what an admin sees is the page itself rather than a drawing of it. Every edit
 * saves immediately — there is no "unsaved work" state to lose — and the Save
 * button exists to publish, not to rescue anything.
 */

// ---------------------------------------------------------------------------
// Types mirroring the widget catalogue the API serves
// ---------------------------------------------------------------------------

interface WidgetField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'image' | 'number' | 'link' | 'select' | 'products' | 'categories';
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  inConfig?: boolean;
}

interface Widget {
  type: SectionType;
  name: string;
  description: string;
  group: 'Layout' | 'Catalogue' | 'Content' | 'Trust';
  fields: WidgetField[];
}

interface Layout {
  key: string;
  name: string;
  description: string;
  sections: SectionType[];
}

interface BuilderPage {
  id: string;
  slug: string;
  title: string;
  status: ContentStatus;
  isSystem: boolean;
  sections: HomeSection[];
}

const GROUP_ORDER: Widget['group'][] = ['Layout', 'Catalogue', 'Content', 'Trust'];

/**
 * The widths the page can be edited at.
 *
 * The frame is the real storefront at that width, not a scaled screenshot, so
 * what the phone column does here is what it does on a phone.
 */
type DeviceKey = 'desktop' | 'tablet' | 'phone';

const DEVICES: Record<DeviceKey, { label: string; width: string; icon: ReactNode }> = {
  desktop: { label: 'Desktop', width: '100%', icon: <MonitorIcon size={15} /> },
  tablet: { label: 'Tablet', width: '834px', icon: <TabletIcon size={15} /> },
  phone: { label: 'Phone', width: '430px', icon: <PhoneFrameIcon size={15} /> },
};

/** The window's width, kept current as it changes. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export default function AdminPageBuilder() {
  const [params, setParams] = useSearchParams();
  const pageSlug = params.get('page') ?? 'home';
  const queryClient = useQueryClient();
  const { push } = useToast();
  // This route sits outside AdminLayout, so it reads the theme for itself.
  const { theme: adminTheme } = useAdminTheme();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState<DeviceKey>('desktop');
  const [deleting, setDeleting] = useState<HomeSection | null>(null);
  /** Where a newly picked block will land. null means the picker is closed. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /*
   * The last block removed, kept so it can be put back.
   *
   * Deleting is the one action here with no natural way back -- the row is
   * gone from the database -- so its type, fields and position are held on to
   * and replayed if the offer in the bar is taken.
   */
  const [lastDeleted, setLastDeleted] = useState<{ section: HomeSection; index: number } | null>(null);
  /*
   * Which panels fit alongside the preview.
   *
   * Three columns need roughly 1100px. Below that they are shown one at a time,
   * and on a phone the whole idea stops working: a page preview squeezed into
   * 400px next to two panels is not an editor. Rather than ship something that
   * technically renders and cannot be used, a phone gets an honest message.
   */
  const width = useViewportWidth();
  const layoutMode = width >= 1100 ? 'full' : width >= 700 ? 'compact' : 'phone';

  const pageKey = ['builder-page', pageSlug];

  const { data: page, isLoading } = useQuery({
    queryKey: pageKey,
    queryFn: () => api.get<BuilderPage>(`/admin/builder/pages/${pageSlug}`),
  });

  const { data: catalogue } = useQuery({
    queryKey: ['builder-widgets'],
    queryFn: () => api.get<{ widgets: Widget[]; layouts: Layout[] }>('/admin/builder/widgets'),
    staleTime: 5 * 60_000,
  });

  const widgets = catalogue?.widgets ?? [];
  const layouts = catalogue?.layouts ?? [];
  const sections = page?.sections ?? [];
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const selectedWidget = widgets.find((w) => w.type === selected?.type) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: pageKey });
  const fail = (err: unknown) =>
    push(err instanceof ApiError ? err.message : 'That did not save. Please try again.', 'error');

  // --- Mutations -----------------------------------------------------------

  const addWidget = useMutation({
    mutationFn: (type: SectionType) =>
      api.post<HomeSection>(`/admin/builder/pages/${page!.id}/sections`, { type }),
    onSuccess: async (section) => {
      await refresh();
      setSelectedId(section.id);
      setInsertAt(null);
      setSearch('');
      push('Block added', 'success');
    },
    onError: fail,
  });

  const updateSection = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch<HomeSection>(`/admin/builder/pages/${page!.id}/sections/${id}`, patch),
    onSuccess: refresh,
    onError: fail,
  });

  const removeSection = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/builder/pages/${page!.id}/sections/${id}`),
    onMutate: (id: string) => {
      const index = sections.findIndex((s) => s.id === id);
      const section = sections.find((s) => s.id === id);
      if (section) setLastDeleted({ section, index: Math.max(0, index) });
    },
    onSuccess: async () => {
      await refresh();
      setSelectedId(null);
      setDeleting(null);
      push('Block removed', 'info');
    },
    onError: fail,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`/admin/builder/pages/${page!.id}/sections/reorder`, { ids }),
    onSuccess: refresh,
    onError: fail,
  });

  const useLayout = useMutation({
    mutationFn: ({ layout, replace }: { layout: string; replace: boolean }) =>
      api.post(`/admin/builder/pages/${page!.id}/apply-layout`, { layout, replace }),
    onSuccess: async () => {
      await refresh();
      push('Layout applied', 'success');
    },
    onError: fail,
  });

  const publish = useMutation({
    mutationFn: (status: ContentStatus) => api.patch(`/admin/pages/${page!.id}`, { status }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['builder-pages'] });
      push(page?.status === 'PUBLISHED' ? 'Page unpublished' : 'Page published', 'success');
    },
    onError: fail,
  });

  const openPalette = (at: number) => { setInsertAt(at); setSearch(''); };

  /** Drops the dragged block above the block it was released on. */
  const dropOn = (index: number) => {
    if (!dragId) return;
    const from = sections.findIndex((s) => s.id === dragId);
    setDragId(null);
    setOverIndex(null);
    if (from < 0 || from === index) return;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(from < index ? index - 1 : index, 0, moved);
    reorder.mutate(next.map((s) => s.id));
  };

  /*
   * Copies a block by making a new one of the same type and replaying its
   * fields onto it. There is no duplicate endpoint, and adding one would put
   * the same logic on the server for the sake of one button.
   */
  const duplicate = async (source: HomeSection) => {
    try {
      const made = await api.post<HomeSection>(`/admin/builder/pages/${page!.id}/sections`, {
        type: source.type,
      });
      await api.patch(`/admin/builder/pages/${page!.id}/sections/${made.id}`, {
        title: source.title,
        subtitle: source.subtitle,
        bodyText: source.bodyText,
        ctaLabel: source.ctaLabel,
        ctaLink: source.ctaLink,
        config: source.config ?? {},
        status: source.status,
      });
      const at = sections.findIndex((s) => s.id === source.id);
      const ids = sections.map((s) => s.id);
      ids.splice(at + 1, 0, made.id);
      await api.post(`/admin/builder/pages/${page!.id}/sections/reorder`, { ids });
      await refresh();
      push('Block duplicated', 'success');
    } catch (err) {
      fail(err);
    }
  };

  /** Puts back the block the bar is offering to restore. */
  const restoreDeleted = async () => {
    if (!lastDeleted) return;
    const { section, index } = lastDeleted;
    setLastDeleted(null);
    try {
      const made = await api.post<HomeSection>(`/admin/builder/pages/${page!.id}/sections`, {
        type: section.type,
      });
      await api.patch(`/admin/builder/pages/${page!.id}/sections/${made.id}`, {
        title: section.title,
        subtitle: section.subtitle,
        bodyText: section.bodyText,
        ctaLabel: section.ctaLabel,
        ctaLink: section.ctaLink,
        config: section.config ?? {},
        status: section.status,
      });
      const ids = sections.filter((s) => s.id !== made.id).map((s) => s.id);
      ids.splice(Math.min(index, ids.length), 0, made.id);
      await api.post(`/admin/builder/pages/${page!.id}/sections/reorder`, { ids });
      await refresh();
      push('Block restored', 'success');
    } catch (err) {
      fail(err);
    }
  };

  const busy = updateSection.isPending || reorder.isPending || addWidget.isPending;

  const move = (id: string, delta: -1 | 1) => {
    const index = sections.findIndex((s) => s.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((s) => s.id));
  };

  const filteredWidgets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return widgets;
    return widgets.filter(
      (w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q),
    );
  }, [widgets, search]);

  if (isLoading || !page) return <PageLoader label="Opening the editor" />;

  if (layoutMode === 'phone') {
    return <TooNarrow page={page} />;
  }

  const frameWidth = DEVICES[device].width;

  return (
    <div className="admin-ui flex h-screen flex-col overflow-hidden" data-admin-theme={adminTheme}>
      {/* ---------------- Top bar ---------------- */}
      <header
        className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5"
        style={{ background: 'var(--a-surface)', borderColor: 'var(--a-line)' }}
      >
        <Link to="/admin/design-pages" className="a-btn a-btn-ghost px-2" aria-label="Back to all pages">
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{page.title}</p>
          <p className="text-[0.65rem] text-ink-400">
            {page.status === 'PUBLISHED' ? 'Live' : 'Draft'}
            {' · '}
            {sections.length} {sections.length === 1 ? 'block' : 'blocks'}
          </p>
        </div>

        <div className="flex-1" />

        {/* Which width the page is being edited at. */}
        <div
          className="hidden rounded-[var(--a-radius-sm)] p-0.5 sm:flex"
          style={{ background: 'var(--a-sunken)', border: '1px solid var(--a-line)' }}
        >
          {(Object.keys(DEVICES) as DeviceKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              aria-pressed={device === key}
              title={DEVICES[key].label}
              className={clsx(
                'rounded-[6px] px-2.5 py-1.5 transition-all',
                device === key
                  ? 'bg-paper text-ink shadow-[var(--a-shadow)]'
                  : 'text-[color:var(--a-faint)] hover:text-ink',
              )}
            >
              {DEVICES[key].icon}
              <span className="sr-only">{DEVICES[key].label}</span>
            </button>
          ))}
        </div>

        {lastDeleted ? (
          <button type="button" className="a-btn a-btn-secondary" onClick={restoreDeleted}>
            Undo delete
          </button>
        ) : null}

        <span className="hidden text-xs md:inline" style={{ color: 'var(--a-faint)' }}>
          {busy ? 'Saving…' : 'All changes saved'}
        </span>

        <a
          href={page.slug === 'home' ? '/' : '/' + page.slug}
          target="_blank"
          rel="noreferrer"
          className="a-btn a-btn-secondary"
        >
          View
        </a>

        <Button
          size="sm"
          loading={publish.isPending}
          onClick={() => publish.mutate(page.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')}
        >
          {page.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------------- The page itself ---------------- */}
        <main className="min-w-0 flex-1 overflow-y-auto" style={{ background: 'var(--a-canvas)' }}>
          <div
            data-editor-frame=""
            className="mx-auto min-h-full bg-paper shadow-[var(--a-shadow-lift)] transition-[max-width] duration-200"
            style={{ maxWidth: frameWidth, width: '100%' }}
          >
            {!sections.length ? (
              <EmptyCanvas
                layouts={layouts}
                onApply={(key) => useLayout.mutate({ layout: key, replace: false })}
                onAdd={() => openPalette(0)}
              />
            ) : (
              <>
                <InsertLine onClick={() => openPalette(0)} />
                {sections.map((section, index) => (
                  <SectionFrame
                    key={section.id}
                    index={index}
                    total={sections.length}
                    section={section}
                    widget={widgets.find((w) => w.type === section.type)}
                    selected={section.id === selectedId}
                    dragging={dragId === section.id}
                    dropTarget={overIndex === index}
                    onSelect={() => setSelectedId(section.id)}
                    onMove={(delta) => move(section.id, delta)}
                    onDuplicate={() => duplicate(section)}
                    onDelete={() => setDeleting(section)}
                    onToggleVisible={() =>
                      updateSection.mutate({
                        id: section.id,
                        patch: { status: section.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' },
                      })
                    }
                    onDragStart={() => setDragId(section.id)}
                    onDragOver={() => setOverIndex(index)}
                    onDrop={() => dropOn(index)}
                    onDragEnd={() => { setDragId(null); setOverIndex(null); }}
                    onInsertAfter={() => openPalette(index + 1)}
                  />
                ))}
              </>
            )}
          </div>
        </main>

        {/* ---------------- Editing panel, only while editing ---------------- */}
        {selected && selectedWidget ? (
          <aside
            className="w-[22rem] shrink-0 overflow-y-auto border-l p-5"
            style={{ background: 'var(--a-surface)', borderColor: 'var(--a-line)' }}
          >
            <SectionFields
              key={selected.id}
              section={selected}
              widget={selectedWidget}
              saving={updateSection.isPending}
              onChange={(patch) => updateSection.mutate({ id: selected.id, patch })}
              onDone={() => setSelectedId(null)}
            />
          </aside>
        ) : null}
      </div>

      {/* ---------------- Block picker ---------------- */}
      {insertAt !== null ? (
        <BlockPalette
          widgets={filteredWidgets}
          search={search}
          onSearch={setSearch}
          adding={addWidget.isPending}
          onPick={(type) => addWidget.mutate(type)}
          onClose={() => { setInsertAt(null); setSearch(''); }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove this block?"
        message="It comes off the page straight away. Undo is offered in the bar afterwards if you change your mind."
        confirmLabel="Remove block"
        tone="danger"
        loading={removeSection.isPending}
        onConfirm={() => deleting && removeSection.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The thin line between two blocks that adds another one.
   --------------------------------------------------------------------------- */

function InsertLine({ onClick }: { onClick: () => void }) {
  return (
    <div className="group/insert relative z-30 h-0">
      <div className="absolute inset-x-0 -top-3 flex h-6 items-center justify-center opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100 group-hover/insert:opacity-100">
        <span className="h-px flex-1" style={{ background: 'var(--a-accent)' }} />
        <button
          type="button"
          onClick={onClick}
          aria-label="Add a block here"
          className="mx-2 flex h-6 items-center gap-1 rounded-full px-2.5 text-[0.65rem] font-medium shadow-[var(--a-shadow)]"
          style={{ background: 'var(--a-accent)', color: 'var(--a-on-accent)' }}
        >
          <PlusIcon size={12} />
          Add block
        </button>
        <span className="h-px flex-1" style={{ background: 'var(--a-accent)' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

function EmptyCanvas({
  layouts, onApply, onAdd,
}: {
  layouts: Layout[];
  onApply: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center px-8 py-20 text-center">
      <h2 className="text-2xl">This page is empty</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        Start from a ready-made layout, or add one block at a time.
      </p>
      <button type="button" onClick={onAdd} className="a-btn a-btn-primary mt-6">
        <PlusIcon size={15} />
        Add your first block
      </button>
      <p className="mt-8 text-[0.65rem] uppercase tracking-architect text-ink-400">
        or start from a layout
      </p>
      <div className="mt-8 grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {layouts.map((layout) => (
          <button
            key={layout.key}
            type="button"
            onClick={() => onApply(layout.key)}
            className="border border-stone-line p-4 text-left transition-colors hover:border-ink"
          >
            <span className="block text-sm font-medium text-ink">{layout.name}</span>
            <span className="mt-1 block text-2xs leading-relaxed text-ink-400">
              {layout.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One block in the preview, with its controls.
 *
 * The block itself renders through the storefront's own component, so the
 * preview is the page. The chrome sits on top and only appears on hover or when
 * the block is selected.
 */
/**
 * One block, on the page.
 *
 * The controls live on the block rather than in a column somewhere else: hover
 * it and the toolbar is right there, against the thing it acts on. The frame
 * itself is the drag handle's payload, so reordering is a drag down the page
 * rather than a pair of arrow buttons.
 */
function SectionFrame({
  index, total, section, widget, selected, dragging, dropTarget,
  onSelect, onMove, onDuplicate, onDelete, onToggleVisible,
  onDragStart, onDragOver, onDrop, onDragEnd, onInsertAfter,
}: {
  index: number;
  total: number;
  section: HomeSection;
  widget?: Widget;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onInsertAfter: () => void;
}) {
  // draggable is switched on only while the handle is held, or every text
  // selection inside the preview would start a drag.
  const [byHandle, setByHandle] = useState(false);
  const hidden = section.status !== 'PUBLISHED';
  const name = widget?.name ?? section.type;

  return (
    <>
      <div
        draggable={byHandle}
        onDragStart={onDragStart}
        onDragEnd={() => { setByHandle(false); onDragEnd(); }}
        onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
        onDrop={(e) => { e.preventDefault(); onDrop(); }}
        className={clsx(
          'group/block relative transition-[outline-color,opacity] duration-150',
          'outline outline-2 -outline-offset-2',
          dragging && 'opacity-40',
          selected
            ? 'outline-[color:var(--a-accent)]'
            : 'outline-transparent hover:outline-[color:var(--a-border,var(--a-line))]',
        )}
      >
        {dropTarget && !dragging ? (
          <span className="absolute inset-x-0 top-0 z-40 h-1" style={{ background: 'var(--a-accent)' }} />
        ) : null}

        {/* Name, top left. */}
        <span
          className={clsx(
            'pointer-events-none absolute left-0 top-0 z-30 px-2 py-1 text-[0.6rem] font-medium transition-opacity',
            selected ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-100',
          )}
          style={{ background: 'var(--a-accent)', color: 'var(--a-on-accent)' }}
        >
          {index + 1}. {name}{hidden ? ' · hidden' : ''}
        </span>

        {/* Toolbar, top right, against the block it acts on. */}
        <div
          className={clsx(
            'absolute right-2 top-2 z-30 flex items-center gap-0.5 rounded-[var(--a-radius-sm)] p-1 shadow-[var(--a-shadow-lift)] transition-opacity',
            selected ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-100 focus-within:opacity-100',
          )}
          style={{ background: 'var(--a-surface)', border: '1px solid var(--a-line)' }}
        >
          <span
            onMouseDown={() => setByHandle(true)}
            onMouseUp={() => setByHandle(false)}
            role="button"
            tabIndex={-1}
            aria-label={'Drag ' + name + ' to reorder'}
            title="Drag to reorder"
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-ink-400 hover:text-ink active:cursor-grabbing"
          >
            <DragIcon size={14} />
          </span>
          <Tool label={'Move ' + name + ' up'} disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronDown size={14} className="rotate-180" />
          </Tool>
          <Tool label={'Move ' + name + ' down'} disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown size={14} />
          </Tool>
          <Tool label={'Duplicate ' + name} onClick={onDuplicate}>
            <CopyIcon size={14} />
          </Tool>
          <Tool label={hidden ? 'Show ' + name : 'Hide ' + name} onClick={onToggleVisible}>
            <EyeIcon size={14} />
          </Tool>
          <Tool label={'Remove ' + name} destructive onClick={onDelete}>
            <TrashIcon size={14} />
          </Tool>
          <button
            type="button"
            onClick={onSelect}
            className="ml-0.5 rounded px-2 py-1 text-[0.7rem] font-medium"
            style={{ background: 'var(--a-accent)', color: 'var(--a-on-accent)' }}
          >
            Edit
          </button>
        </div>

        {/* The block as the visitor sees it. Clicking anywhere on it edits it. */}
        <button
          type="button"
          onClick={onSelect}
          aria-label={'Edit ' + name}
          className={clsx('block w-full cursor-pointer text-left', hidden && 'opacity-45 grayscale')}
        >
          <div className="pointer-events-none">
            <SectionRenderer section={section} />
          </div>
        </button>
      </div>

      <InsertLine onClick={onInsertAfter} />
    </>
  );
}

function Tool({
  label, children, onClick, disabled, destructive,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-30',
        destructive ? 'text-ink-400 hover:text-state-danger' : 'text-ink-400 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The block picker.
 *
 * Opened from the line between two blocks, so the choice and the place it will
 * land are the same gesture. It replaces the column of blocks that used to sit
 * on the left whether or not anything was being added.
 */
function BlockPalette({
  widgets, search, onSearch, adding, onPick, onClose,
}: {
  widgets: Widget[];
  search: string;
  onSearch: (v: string) => void;
  adding: boolean;
  onPick: (type: SectionType) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[10vh]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.45)' }}
      />
      <div
        role="dialog"
        aria-label="Add a block"
        className="relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--a-radius)] shadow-[var(--a-shadow-lift)]"
        style={{ background: 'var(--a-surface)', border: '1px solid var(--a-line)' }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--a-line-soft)' }}>
          <SearchIcon size={16} style={{ color: 'var(--a-faint)' }} />
          <input
            autoFocus
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search blocks…"
            aria-label="Search blocks"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--a-text)' }}
          />
          <button type="button" onClick={onClose} aria-label="Close" className="a-btn a-btn-ghost px-2">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {GROUP_ORDER.map((group) => {
            const inGroup = widgets.filter((w) => w.group === group);
            if (!inGroup.length) return null;
            return (
              <section key={group} className="mb-4">
                <p className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--a-faint)' }}>
                  {group}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {inGroup.map((w) => (
                    <button
                      key={w.type}
                      type="button"
                      disabled={adding}
                      // Named for the block alone; the description stays visible beside
                      // it but would otherwise be read out as part of the name.
                      aria-label={w.name}
                      onClick={() => onPick(w.type)}
                      className="rounded-[var(--a-radius-sm)] border p-3 text-left transition-colors hover:border-[color:var(--a-accent)] disabled:opacity-50"
                      style={{ borderColor: 'var(--a-line)' }}
                    >
                      <span className="block text-sm font-medium text-ink">{w.name}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-500">{w.description}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}

          {!widgets.length ? (
            <p className="px-2 py-8 text-center text-sm text-ink-500">Nothing matches that.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionFields({
  section, widget, saving, onChange, onDone,
}: {
  section: HomeSection;
  widget: Widget;
  saving: boolean;
  onChange: (patch: Record<string, unknown>) => void;
  onDone: () => void;
}) {
  const config = (section.config ?? {}) as Record<string, unknown>;
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const savedRef = useRef(section);

  useEffect(() => {
    savedRef.current = section;
    setDraft({});
  }, [section]);

  const valueOf = (field: WidgetField): unknown => {
    if (field.key in draft) return draft[field.key];
    return field.inConfig
      ? config[field.key]
      : (section as unknown as Record<string, unknown>)[field.key];
  };

  const commit = (field: WidgetField, value: unknown) => {
    const current = field.inConfig
      ? config[field.key]
      : (section as unknown as Record<string, unknown>)[field.key];
    // Nothing changed — do not write.
    if (String(current ?? '') === String(value ?? '')) return;

    onChange(
      field.inConfig
        ? { config: { ...config, [field.key]: value } }
        : { [field.key]: value === '' ? null : value },
    );
  };

  return (
    <>
      <div className="mb-6 border-b border-stone-line pb-4">
        <p className="text-[0.6rem] uppercase tracking-architect text-ink-400">Now editing</p>
        <h2 className="mt-1 text-xl">{widget.name}</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">{widget.description}</p>
        {saving ? (
          <Badge tone="neutral" className="mt-3">
            Saving…
          </Badge>
        ) : null}
      </div>

      <div className="space-y-5">
        {widget.fields.map((field) => {
          const value = valueOf(field);
          const setLocal = (v: unknown) => setDraft((d) => ({ ...d, [field.key]: v }));

          switch (field.type) {
            case 'textarea':
              return (
                <Textarea
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  rows={4}
                  value={String(value ?? '')}
                  onChange={(e) => setLocal(e.target.value)}
                  onBlur={(e) => commit(field, e.target.value)}
                />
              );

            case 'image':
              return (
                <ImageField
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  folder="banners"
                  value={(value as string | null) ?? null}
                  onChange={(url) => commit(field, url)}
                />
              );

            case 'select':
              return (
                <Select
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  value={String(value ?? '')}
                  onChange={(e) => commit(field, e.target.value)}
                  options={field.options ?? []}
                />
              );

            case 'number':
              return (
                <Input
                  key={field.key}
                  type="number"
                  label={field.label}
                  hint={field.hint}
                  value={value === null || value === undefined ? '' : String(value)}
                  onChange={(e) => setLocal(e.target.value)}
                  onBlur={(e) => commit(field, e.target.value === '' ? null : Number(e.target.value))}
                />
              );

            case 'products':
              return (
                <IdListField
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  ids={(value as string[] | undefined) ?? []}
                  onChange={(ids) => commit(field, ids)}
                />
              );

            case 'categories':
              return (
                <CategoryListField
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  ids={(value as string[] | undefined) ?? []}
                  onChange={(ids) => commit(field, ids)}
                />
              );

            default:
              return (
                <Input
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  placeholder={field.placeholder}
                  value={String(value ?? '')}
                  onChange={(e) => setLocal(e.target.value)}
                  onBlur={(e) => commit(field, e.target.value)}
                />
              );
          }
        })}
      </div>

      <Button fullWidth className="mt-8" onClick={onDone}>
        Done editing
      </Button>

      <p className="mt-4 text-center text-2xs leading-relaxed text-ink-400">
        Changes save as you make them. “Done” just closes this panel.
      </p>
    </>
  );
}

/** Picks and orders products for a block. */
function IdListField({
  label, hint, ids, onChange,
}: {
  label: string;
  hint?: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <span className="field-label">{label}</span>

      {ids.length ? (
        <ul className="mb-2 space-y-1.5">
          {ids.map((id, index) => (
            <li key={id} className="flex items-center gap-2">
              <span className="flex-1 truncate">
                <ProductPicker
                  label=""
                  value={id}
                  allowEmpty={false}
                  onChange={(next) => {
                    if (!next) return;
                    const copy = [...ids];
                    copy[index] = next;
                    onChange(copy);
                  }}
                />
              </span>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(ids.filter((x) => x !== id))}
                className="shrink-0 p-1.5 text-ink-400 hover:text-state-danger"
              >
                <TrashIcon size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <ProductPicker
          label=""
          value={null}
          onChange={(id) => {
            if (id && !ids.includes(id)) onChange([...ids, id]);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 border border-dashed border-stone-line py-2.5 text-2xs uppercase tracking-architect text-ink-500 transition-colors hover:border-ink hover:text-ink"
        >
          <PlusIcon size={12} />
          Add a product
        </button>
      )}

      {hint ? <p className="mt-1.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

/** Picks and orders categories for a block. */
function CategoryListField({
  label, hint, ids, onChange,
}: {
  label: string;
  hint?: string;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: categories } = useQuery({
    queryKey: ['admin-categories-flat'],
    queryFn: () => api.get<{ id: string; name: string; parentId?: string | null }[]>('/admin/categories'),
    staleTime: 5 * 60_000,
  });

  const all = categories ?? [];
  const chosen = ids.map((id) => all.find((c) => c.id === id)).filter(Boolean) as typeof all;
  const remaining = all.filter((c) => !ids.includes(c.id));

  return (
    <div>
      <span className="field-label">{label}</span>

      {chosen.length ? (
        <ul className="mb-2 space-y-1">
          {chosen.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-2 border border-stone-line px-3 py-2 text-sm"
            >
              <span className="truncate">{category.name}</span>
              <button
                type="button"
                aria-label={`Remove ${category.name}`}
                onClick={() => onChange(ids.filter((x) => x !== category.id))}
                className="shrink-0 text-ink-400 hover:text-state-danger"
              >
                <TrashIcon size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Select
        value=""
        onChange={(e) => e.target.value && onChange([...ids, e.target.value])}
        options={[
          { value: '', label: chosen.length ? 'Add another…' : 'Add a category…' },
          ...remaining.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {hint ? <p className="mt-1.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

/**
 * What a phone gets.
 *
 * The editor needs a page preview beside two panels. On a phone that is not a
 * cramped version of the same thing, it is a different thing that does not
 * work — so it says so, and still offers what a phone can do well: see the
 * page, and publish or unpublish it.
 */
function TooNarrow({ page }: { page: BuilderPage }) {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const publish = useMutation({
    mutationFn: (status: ContentStatus) => api.patch(`/admin/pages/${page.id}`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['builder-page', page.slug] });
      await queryClient.invalidateQueries({ queryKey: ['builder-pages'] });
      push(page.status === 'PUBLISHED' ? 'Page unpublished' : 'Page published', 'success');
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper px-6 py-10">
      <Link
        to="/admin/design-pages"
        className="mb-10 inline-flex w-fit items-center gap-1.5 border border-stone-line px-3 py-2 text-2xs uppercase tracking-architect text-ink-600"
      >
        ← All pages
      </Link>

      <div className="mx-auto w-full max-w-sm text-center">
        <p className="eyebrow mb-4">{page.title}</p>
        <h1 className="text-2xl">The page editor needs a wider screen</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-500">
          It shows your page full size next to the blocks and their settings, which does not fit on
          a phone. Open it on a laptop, a desktop, or a tablet held sideways.
        </p>

        <div className="mt-9 space-y-3 border-t border-stone-line pt-8">
          <p className="text-xs text-ink-500">
            This page has {page.sections.length} block{page.sections.length === 1 ? '' : 's'} and is{' '}
            <strong className="text-ink">{page.status.toLowerCase()}</strong>.
          </p>

          <a
            href={page.slug === 'home' ? '/' : `/${page.slug}`}
            target="_blank"
            rel="noreferrer"
            className="block border border-stone-line px-4 py-3 text-2xs uppercase tracking-architect text-ink-600"
          >
            View the page
          </a>

          <Button
            fullWidth
            loading={publish.isPending}
            onClick={() => publish.mutate(page.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')}
          >
            {page.status === 'PUBLISHED' ? 'Unpublish' : 'Publish page'}
          </Button>
        </div>
      </div>
    </div>
  );
}

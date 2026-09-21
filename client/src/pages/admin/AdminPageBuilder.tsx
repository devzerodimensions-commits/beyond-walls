import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import type { ContentStatus, HomeSection, SectionType } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import { ImageField, ProductPicker } from '../../components/admin/AdminKit';
import { SectionRenderer } from '../../components/home/Sections';
import {
  ArrowRight, Badge, Button, ConfirmDialog, Input, PageLoader, PlusIcon, SearchIcon, Select,
  Textarea, TrashIcon,
} from '../../components/ui';

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState(false);
  const [deleting, setDeleting] = useState<HomeSection | null>(null);
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
  const [panel, setPanel] = useState<'blocks' | 'fields'>('blocks');

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
      setPanel('fields');
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper-off">
      {/* ---------------- Top bar ---------------- */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-stone-line bg-paper px-4 py-3">
        <Link
          to="/admin/design-pages"
          className="inline-flex items-center gap-1.5 border border-stone-line px-3 py-2 text-2xs uppercase tracking-architect text-ink-600 transition-colors hover:border-ink hover:text-ink"
        >
          ← All pages
        </Link>

        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-medium text-ink">{page.title}</p>
          <p className="text-[0.6rem] uppercase tracking-architect text-ink-400">
            Visual page editor
          </p>
        </div>

        <div className="flex items-center gap-2">
          {layoutMode === 'compact' ? (
            <div className="flex border border-stone-line">
              {(['blocks', 'fields'] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  onClick={() => setPanel(which)}
                  className={clsx(
                    'px-3 py-2 text-2xs uppercase tracking-architect transition-colors',
                    panel === which ? 'bg-ink text-paper' : 'text-ink-600 hover:text-ink',
                  )}
                >
                  {which === 'blocks' ? 'Blocks' : 'Settings'}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setMobileView((v) => !v)}
            className={clsx(
              'border px-3 py-2 text-2xs uppercase tracking-architect transition-colors',
              mobileView
                ? 'border-ink bg-ink text-paper'
                : 'border-stone-line text-ink-600 hover:border-ink hover:text-ink',
            )}
          >
            {mobileView ? 'Desktop view' : 'Mobile view'}
          </button>

          <a
            href={page.slug === 'home' ? '/' : `/${page.slug}`}
            target="_blank"
            rel="noreferrer"
            className="border border-stone-line px-3 py-2 text-2xs uppercase tracking-architect text-ink-600 transition-colors hover:border-ink hover:text-ink"
          >
            Preview
          </a>

          <Button size="sm" loading={publish.isPending} onClick={() => publish.mutate(page.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')}>
            {page.status === 'PUBLISHED' ? 'Unpublish' : 'Publish page'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------------- Left: widgets ---------------- */}
        <aside
          className={clsx(
            'flex w-[17rem] shrink-0 flex-col border-r border-stone-line bg-ink text-paper',
            layoutMode === 'compact' && panel !== 'blocks' && 'hidden',
          )}
        >
          <div className="border-b border-paper/10 p-4">
            <div className="relative">
              <SearchIcon
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper/40"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search blocks"
                className="w-full border border-paper/20 bg-transparent py-2 pl-9 pr-3 text-xs text-paper placeholder:text-paper/40 focus:border-paper/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!search ? (
              <section className="mb-7">
                <p className="mb-1 text-[0.6rem] uppercase tracking-architect text-[#C8A961]">
                  Ready-made layouts
                </p>
                <p className="mb-3 text-[0.65rem] leading-relaxed text-paper/45">
                  One click adds all the usual blocks for that kind of page.
                </p>
                <ul className="space-y-2">
                  {layouts.map((layout) => (
                    <li key={layout.key}>
                      <button
                        type="button"
                        disabled={useLayout.isPending}
                        onClick={() =>
                          useLayout.mutate({ layout: layout.key, replace: false })
                        }
                        className="w-full border border-paper/15 p-3 text-left transition-colors hover:border-paper/40 disabled:opacity-50"
                      >
                        <span className="block text-xs font-medium">{layout.name}</span>
                        <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-paper/45">
                          {layout.description}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="mb-3 text-[0.6rem] uppercase tracking-architect text-[#C8A961]">
              {search ? 'Matching blocks' : 'Add a block'}
            </p>

            {GROUP_ORDER.map((group) => {
              const inGroup = filteredWidgets.filter((w) => w.group === group);
              if (!inGroup.length) return null;
              return (
                <section key={group} className="mb-6">
                  <p className="mb-2 text-[0.6rem] uppercase tracking-architect text-paper/35">
                    {group}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {inGroup.map((widget) => (
                      <button
                        key={widget.type}
                        type="button"
                        title={widget.description}
                        disabled={addWidget.isPending}
                        onClick={() => addWidget.mutate(widget.type)}
                        className="flex flex-col items-center gap-1.5 border border-paper/15 px-2 py-4 text-center transition-colors hover:border-paper/50 disabled:opacity-50"
                      >
                        <PlusIcon size={15} className="text-paper/50" />
                        <span className="text-[0.65rem] leading-tight">{widget.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}

            {search && !filteredWidgets.length ? (
              <p className="text-xs text-paper/45">Nothing matches “{search}”.</p>
            ) : null}
          </div>
        </aside>

        {/* ---------------- Middle: the real page ---------------- */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-stone-100 p-6">
          <div
            className={clsx(
              'mx-auto bg-paper shadow-lift transition-[max-width] duration-300',
              mobileView ? 'max-w-[26rem]' : 'max-w-none',
            )}
          >
            {sections.length === 0 ? (
              <EmptyCanvas layouts={layouts} onApply={(key) => useLayout.mutate({ layout: key, replace: false })} />
            ) : (
              sections.map((section, index) => (
                <SectionFrame
                  key={section.id}
                  index={index}
                  total={sections.length}
                  section={section}
                  widget={widgets.find((w) => w.type === section.type)}
                  selected={section.id === selectedId}
                  onSelect={() => { setSelectedId(section.id); setPanel('fields'); }}
                  onMove={(delta) => move(section.id, delta)}
                  onDelete={() => setDeleting(section)}
                  onToggleVisible={() =>
                    updateSection.mutate({
                      id: section.id,
                      patch: { status: section.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' },
                    })
                  }
                />
              ))
            )}
          </div>
        </main>

        {/* ---------------- Right: fields ---------------- */}
        <aside
          className={clsx(
            'w-[21rem] shrink-0 overflow-y-auto border-l border-stone-line bg-paper p-6',
            layoutMode === 'compact' && panel !== 'fields' && 'hidden',
          )}
        >
          {selected && selectedWidget ? (
            <SectionFields
              key={selected.id}
              section={selected}
              widget={selectedWidget}
              saving={updateSection.isPending}
              onChange={(patch) => updateSection.mutate({ id: selected.id, patch })}
              onDone={() => setSelectedId(null)}
            />
          ) : (
            <div className="pt-10 text-center">
              <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center border border-stone-line text-ink-300">
                <ArrowRight size={18} />
              </span>
              <h2 className="text-lg">Click a block to edit it</h2>
              <p className="mx-auto mt-3 max-w-[15rem] text-xs leading-relaxed text-ink-500">
                Select any block in the preview and its editing fields appear here.
              </p>
              <ol className="mx-auto mt-6 max-w-[15rem] space-y-2 text-left text-xs text-ink-500">
                <li>1. Add a block, or start from a layout</li>
                <li>2. Click it in the preview</li>
                <li>3. Change the words or the picture</li>
                <li>4. Publish when you are happy</li>
              </ol>
              <p className="mt-6 text-2xs leading-relaxed text-ink-400">
                Every change saves as you make it.
              </p>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove this block?"
        message="It will be taken off the page. You can add it again afterwards, but its words and settings are not kept."
        confirmLabel="Remove block"
        tone="danger"
        loading={removeSection.isPending}
        onConfirm={() => deleting && removeSection.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

function EmptyCanvas({ layouts, onApply }: { layouts: Layout[]; onApply: (key: string) => void }) {
  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center px-8 py-20 text-center">
      <h2 className="text-2xl">This page is empty</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        Start from a ready-made layout, or add blocks one at a time from the left.
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
function SectionFrame({
  index, total, section, widget, selected, onSelect, onMove, onDelete, onToggleVisible,
}: {
  index: number;
  total: number;
  section: HomeSection;
  widget?: Widget;
  selected: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onToggleVisible: () => void;
}) {
  const hidden = section.status !== 'PUBLISHED';
  const name = widget?.name ?? section.type;

  return (
    <div
      className={clsx(
        'group relative border-2 transition-colors',
        selected ? 'border-[#C8A961]' : 'border-transparent hover:border-[#C8A961]/40',
      )}
    >
      {/* Block name */}
      <span
        className={clsx(
          'absolute left-0 top-0 z-20 px-2.5 py-1 text-[0.6rem] uppercase tracking-architect transition-opacity',
          selected
            ? 'bg-[#C8A961] text-ink opacity-100'
            : 'bg-ink text-paper opacity-0 group-hover:opacity-100',
        )}
      >
        {index + 1}. {name}
      </span>

      {/* Controls */}
      <div
        className={clsx(
          'absolute right-0 top-0 z-20 flex transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <ChromeButton
          disabled={index === 0}
          label={`Move ${name} up`}
          onClick={() => onMove(-1)}
        >
          Move up
        </ChromeButton>
        <ChromeButton
          disabled={index === total - 1}
          label={`Move ${name} down`}
          onClick={() => onMove(1)}
        >
          Move down
        </ChromeButton>
        <ChromeButton
          label={hidden ? `Show ${name}` : `Hide ${name}`}
          onClick={onToggleVisible}
        >
          {hidden ? 'Show' : 'Hide'}
        </ChromeButton>
        <ChromeButton destructive label={`Delete ${name}`} onClick={onDelete}>
          Delete
        </ChromeButton>
      </div>

      {hidden ? (
        <span className="absolute left-1/2 top-0 z-20 -translate-x-1/2 bg-state-warning px-2.5 py-1 text-[0.6rem] uppercase tracking-architect text-ink">
          Hidden from visitors
        </span>
      ) : null}

      {/*
        Clicking selects the block. The overlay sits above the real content so a
        link inside a hero cannot navigate the admin away from the editor.
      */}
      <button
        type="button"
        aria-label={`Edit ${name}`}
        onClick={onSelect}
        className="absolute inset-0 z-10 cursor-pointer"
      />

      <div className={clsx('pointer-events-none', hidden && 'opacity-40 grayscale')}>
        <SectionRenderer section={section} />
      </div>
    </div>
  );
}

function ChromeButton({
  children, onClick, disabled, destructive, label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Says which block this acts on; the visible text alone does not. */
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 text-[0.6rem] uppercase tracking-architect transition-colors',
        destructive ? 'bg-state-danger text-paper hover:opacity-85' : 'bg-ink text-paper hover:bg-ink-700',
        disabled && 'cursor-not-allowed opacity-30',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The field panel
// ---------------------------------------------------------------------------

/**
 * Fields for the selected block, built from the widget's own definition.
 *
 * Text is held locally while it is being typed and saved when the field loses
 * focus, so a save does not fire on every keystroke. Pickers and dropdowns save
 * immediately, because there is nothing to finish typing.
 */
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

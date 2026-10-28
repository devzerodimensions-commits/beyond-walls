import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type {
  AttributeGroup, AttributeValue, Category, ContentStatus, MediaAsset, PersonalizationField,
  PersonalizationType, Product, ProductImage, ProductVariant,
} from '../../lib/types';
import { slugify, toNumber } from '../../lib/format';
import { VIDEO_HELP, resolveVideo } from '../../lib/video';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, MediaPicker, MultiImageUpload, SortableList, StringListEditor,
} from '../../components/admin/AdminKit';
import {
  LivePreview, PLATE_FONTS, PREVIEW_SLOTS, PREVIEW_TEMPLATES, buildPreviewSlots,
  resolvePreviewConfig, type PreviewConfig,
} from '../../components/product/LivePreview';
import {
  Badge, Button, Checkbox, CloseIcon, ConfirmDialog, Input, Modal, PageLoader,
  PlusIcon, Select, Textarea, TrashIcon, EditIcon, EyeIcon,
} from '../../components/ui';

type Tab = 'details' | 'media' | 'pricing' | 'variants' | 'personalisation' | 'organisation' | 'seo';

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'media', label: 'Images' },
  { id: 'pricing', label: 'Price & stock' },
  { id: 'variants', label: 'Variants' },
  { id: 'personalisation', label: 'Personalisation' },
  { id: 'organisation', label: 'Organisation' },
  { id: 'seo', label: 'SEO' },
];

interface ProductForm {
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  designNote: string;
  materialNote: string;
  careInstructions: string;
  installationNote: string;
  shippingNote: string;
  features: string[];
  applications: string[];
  includedItems: string[];
  categoryId: string;
  subcategoryId: string;
  price: number | null;
  compareAtPrice: number | null;
  taxRatePercent: number | null;
  priceConfirmed: boolean;
  codAvailable: boolean;
  trackInventory: boolean;
  stock: number | null;
  lowStockAlert: number | null;
  minOrderQty: number | null;
  maxOrderQty: number | null;
  widthInches: number | null;
  heightInches: number | null;
  depthMm: number | null;
  weightGrams: number | null;
  status: ContentStatus;
  featured: boolean;
  isNew: boolean;
  badge: string;
  sortOrder: number | null;
  livePreviewEnabled: boolean;
  livePreviewTemplate: string;
  livePreviewConfig: Record<string, unknown>;
  productionDays: number | null;
  /** Optional gallery video: a YouTube or Vimeo link, or an mp4. */
  videoUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  attributeValueIds: string[];
}

const EMPTY_FORM: ProductForm = {
  name: '', slug: '', sku: '', shortDescription: '', description: '',
  designNote: '', materialNote: '', careInstructions: '',
  installationNote: '', shippingNote: '',
  features: [], applications: [], includedItems: [],
  categoryId: '', subcategoryId: '',
  price: null, compareAtPrice: null, taxRatePercent: 18, priceConfirmed: false, codAvailable: true,
  trackInventory: false, stock: 0, lowStockAlert: 5, minOrderQty: 1, maxOrderQty: null,
  widthInches: null, heightInches: null, depthMm: null, weightGrams: null,
  status: 'DRAFT', featured: false, isNew: false, badge: '', sortOrder: 0,
  livePreviewEnabled: false, livePreviewTemplate: '', livePreviewConfig: {}, productionDays: null, videoUrl: null,
  seoTitle: '', seoDescription: '', seoKeywords: '',
  attributeValueIds: [],
};

function toForm(product: Product): ProductForm {
  return {
    name: product.name,
    slug: product.slug,
    sku: product.sku ?? '',
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    designNote: product.designNote ?? '',
    materialNote: product.materialNote ?? '',
    careInstructions: product.careInstructions ?? '',
    installationNote: product.installationNote ?? '',
    shippingNote: product.shippingNote ?? '',
    features: product.features ?? [],
    applications: product.applications ?? [],
    includedItems: product.includedItems ?? [],
    categoryId: product.category?.id ?? '',
    subcategoryId: product.subcategory?.id ?? '',
    price: toNumber(product.price),
    compareAtPrice: toNumber(product.compareAtPrice),
    taxRatePercent: toNumber(product.taxRatePercent ?? 18),
    priceConfirmed: product.priceConfirmed ?? false,
    codAvailable: product.codAvailable ?? true,
    trackInventory: product.trackInventory,
    stock: product.stock,
    lowStockAlert: (product as unknown as { lowStockAlert?: number }).lowStockAlert ?? 5,
    minOrderQty: product.minOrderQty ?? 1,
    maxOrderQty: product.maxOrderQty ?? null,
    widthInches: toNumber(product.widthInches),
    heightInches: toNumber(product.heightInches),
    depthMm: toNumber(product.depthMm),
    weightGrams: product.weightGrams ?? null,
    status: product.status,
    featured: product.featured,
    isNew: product.isNew,
    badge: product.badge ?? '',
    sortOrder: product.sortOrder ?? 0,
    livePreviewEnabled: product.livePreviewEnabled,
    livePreviewTemplate: product.livePreviewTemplate ?? '',
    livePreviewConfig: product.livePreviewConfig ?? {},
    productionDays: product.productionDays ?? null,
    videoUrl: product.videoUrl ?? null,
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
    seoKeywords: product.seoKeywords ?? '',
    attributeValueIds: (product.attributes ?? []).map((a) => a.value.id),
  };
}

export default function AdminProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const isNew = !id || id === 'new';
  const requestedTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(TABS.some((item) => item.id === requestedTab) ? requestedTab! : 'details');
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const [attributeDraft, setAttributeDraft] = useState<{
    id?: string;
    groupId: string;
    groupName: string;
    name: string;
    hexColor: string;
  } | null>(null);
  const [deletingAttribute, setDeletingAttribute] = useState<AttributeValue | null>(null);

  const productQuery = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => api.get<Product>(`/admin/products/${id}`),
    enabled: !isNew,
  });

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories-tree'],
    queryFn: () => api.get<Category[]>('/admin/categories-tree'),
  });

  const attributesQuery = useQuery({
    queryKey: ['admin-attribute-groups'],
    queryFn: () => api.list<AttributeGroup[]>('/admin/attribute-groups', { perPage: 100 }),
  });

  useEffect(() => {
    if (productQuery.data) {
      setForm(toForm(productQuery.data));
      setSlugTouched(true);
    }
  }, [productQuery.data]);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async ({ publish }: { publish?: boolean; continueTo?: Tab }) => {
      const payload = {
        ...form,
        sku: form.sku || null,
        badge: form.badge || null,
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        livePreviewTemplate: form.livePreviewTemplate || null,
        livePreviewConfig: form.livePreviewConfig ?? {},
        shortDescription: form.shortDescription || null,
        description: form.description || null,
        designNote: form.designNote || null,
        materialNote: form.materialNote || null,
        careInstructions: form.careInstructions || null,
        installationNote: form.installationNote || null,
        shippingNote: form.shippingNote || null,
        seoTitle: form.seoTitle || null,
        seoDescription: form.seoDescription || null,
        seoKeywords: form.seoKeywords || null,
        // A product priced on request must not carry a stale price.
        price: form.price,
        status: publish === undefined ? form.status : publish ? 'PUBLISHED' : 'DRAFT',
      };

      return isNew
        ? api.post<Product>('/admin/products', payload)
        : api.patch<Product>(`/admin/products/${id}`, payload);
    },
    onSuccess: async (product, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-product', id] });
      push(isNew ? 'Product created' : 'Product saved', 'success');
      if (isNew) {
        const nextTab = variables.continueTo ?? 'details';
        setTab(nextTab);
        navigate(`/admin/products/${product.id}?tab=${nextTab}`, { replace: true });
      }
      else setForm(toForm(product));
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (isNew && (err.fieldErrors.name || err.fieldErrors.slug)) setTab('details');
        push(err.message, 'error');
      } else {
        push('Could not save the product', 'error');
      }
    },
  });

  const saveAttribute = useMutation({
    mutationFn: (draft: NonNullable<typeof attributeDraft>) => {
      const payload = {
        groupId: draft.groupId,
        name: draft.name.trim(),
        hexColor: draft.hexColor || null,
        status: 'PUBLISHED',
      };
      return draft.id
        ? api.patch<AttributeValue>(`/admin/attribute-values/${draft.id}`, payload)
        : api.post<AttributeValue>('/admin/attribute-values', payload);
    },
    onSuccess: async (value, draft) => {
      if (!draft.id) {
        setForm((prev) => ({
          ...prev,
          attributeValueIds: prev.attributeValueIds.includes(value.id)
            ? prev.attributeValueIds
            : [...prev.attributeValueIds, value.id],
        }));
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-attribute-groups'] });
      await queryClient.invalidateQueries({ queryKey: ['catalog-filters'] });
      setAttributeDraft(null);
      push(draft.id ? 'Option updated' : 'Option added and selected', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save option', 'error'),
  });

  const removeAttribute = useMutation({
    mutationFn: (value: AttributeValue) => api.delete(`/admin/attribute-values/${value.id}`),
    onSuccess: async (_, value) => {
      setForm((prev) => ({
        ...prev,
        attributeValueIds: prev.attributeValueIds.filter((idValue) => idValue !== value.id),
      }));
      await queryClient.invalidateQueries({ queryKey: ['admin-attribute-groups'] });
      await queryClient.invalidateQueries({ queryKey: ['catalog-filters'] });
      setDeletingAttribute(null);
      push('Option deleted', 'info');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not delete option', 'error'),
  });

  if (!isNew && productQuery.isLoading) return <PageLoader label="Loading product" />;

  const product = productQuery.data;
  const parentCategories = categoriesQuery.data ?? [];
  const subcategories = parentCategories.find((c) => c.id === form.categoryId)?.children ?? [];

  return (
    <>
      <AdminPageHeader
        breadcrumb={{ label: 'Products', to: '/admin/products' }}
        title={isNew ? 'New product' : form.name || 'Edit product'}
        actions={
          <>
            {!isNew && product?.status === 'PUBLISHED' ? (
              <a
                href={`/product/${product.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-stone-line px-4 py-2 text-2xs uppercase tracking-architect transition-colors hover:border-ink"
              >
                <EyeIcon size={14} /> View
              </a>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              loading={save.isPending}
              onClick={() => save.mutate({ publish: false })}
            >
              Save as draft
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ publish: true })}>
              {form.status === 'PUBLISHED' ? 'Save & keep live' : 'Publish'}
            </Button>
          </>
        }
      />

      {/* Status strip */}
      <div className="mb-6 flex flex-wrap items-center gap-3 border border-stone-line bg-paper px-5 py-3">
        <span className="text-2xs uppercase tracking-architect text-ink-400">Status</span>
        <Badge tone={form.status === 'PUBLISHED' ? 'success' : form.status === 'DRAFT' ? 'warning' : 'neutral'}>
          {form.status}
        </Badge>
        {form.price === null ? <Badge tone="danger">No base price</Badge> : null}
        {!form.priceConfirmed && form.price !== null ? (
          <Badge tone="warning">Price not confirmed</Badge>
        ) : null}
        {form.livePreviewEnabled ? <Badge tone="info">Live preview on</Badge> : null}
        {!isNew ? (
          <span className="ml-auto font-mono text-2xs text-ink-300">/product/{form.slug}</span>
        ) : null}
      </div>

      {/* Tabs */}
      <div
        className="no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-xl p-1"
        style={{ background: 'var(--a-sunken)', border: '1px solid var(--a-line)' }}
        role="tablist"
      >
        {TABS.map((item) => {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              role="tab"
              id={`producttab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls="producttab-panel"
              className={clsx(
                'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150',
                tab === item.id
                  ? 'bg-paper text-ink shadow-[var(--a-shadow)]'
                  : 'text-[color:var(--a-muted)] hover:text-ink',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div id="producttab-panel" role="tabpanel" aria-labelledby={`producttab-${tab}`}>

      {/* ---------------- Details ---------------- */}
      {tab === 'details' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <AdminCard title="Basics">
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Product name" required value={form.name} error={errors.name}
                  wrapClassName="sm:col-span-2"
                  onChange={(e) => {
                    set('name', e.target.value);
                    if (!slugTouched) set('slug', slugify(e.target.value));
                  }}
                />
                <Input
                  label="URL slug" value={form.slug} error={errors.slug}
                  hint={`/product/${form.slug || 'your-slug'}`}
                  onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }}
                />
                <Input label="SKU" value={form.sku} error={errors.sku} onChange={(e) => set('sku', e.target.value)} />
                <Textarea
                  label="Short description" value={form.shortDescription} rows={2}
                  wrapClassName="sm:col-span-2"
                  hint="Shown on product cards and used as the meta description fallback."
                  onChange={(e) => set('shortDescription', e.target.value)}
                />
                <Textarea
                  label="Full description" value={form.description} rows={8}
                  wrapClassName="sm:col-span-2"
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
            </AdminCard>

            <AdminCard title="Detail sections" description="Each section appears as an accordion on the product page.">
              <div className="space-y-5">
                <Textarea label="Design" value={form.designNote} rows={3} onChange={(e) => set('designNote', e.target.value)} />
                <Textarea label="Material & finish" value={form.materialNote} rows={3} onChange={(e) => set('materialNote', e.target.value)} />
                <Textarea label="Installation" value={form.installationNote} rows={3} hint="How the piece is fixed in place." onChange={(e) => set('installationNote', e.target.value)} />
                <Textarea label="Care instructions" value={form.careInstructions} rows={3} onChange={(e) => set('careInstructions', e.target.value)} />
                <Textarea label="Shipping" value={form.shippingNote} rows={2} hint="Shown on the product page and in the reassurance strip." onChange={(e) => set('shippingNote', e.target.value)} />
                <StringListEditor label="Features" values={form.features} onChange={(v) => set('features', v)} placeholder="e.g. Weather proof" />
                <StringListEditor label="What's included" values={form.includedItems} onChange={(v) => set('includedItems', v)} placeholder="e.g. Mounting screws" />
                <StringListEditor label="Ideal for" values={form.applications} onChange={(v) => set('applications', v)} placeholder="e.g. Office doors" />
              </div>
            </AdminCard>
          </div>

          <div className="space-y-6">
            <AdminCard title="Specifications">
              <div className="grid grid-cols-2 gap-4">
                <Input type="number" label="Width (in)" value={form.widthInches ?? ''} onChange={(e) => set('widthInches', e.target.value === '' ? null : Number(e.target.value))} />
                <Input type="number" label="Height (in)" value={form.heightInches ?? ''} onChange={(e) => set('heightInches', e.target.value === '' ? null : Number(e.target.value))} />
                <Input type="number" label="Thickness (mm)" value={form.depthMm ?? ''} onChange={(e) => set('depthMm', e.target.value === '' ? null : Number(e.target.value))} />
                <Input type="number" label="Weight (g)" value={form.weightGrams ?? ''} onChange={(e) => set('weightGrams', e.target.value === '' ? null : Number(e.target.value))} />
                <Input
                  type="number" label="Production days" value={form.productionDays ?? ''}
                  wrapClassName="col-span-2"
                  onChange={(e) => set('productionDays', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
            </AdminCard>

            <AdminCard title="Live preview">
              <Checkbox
                label="Enable the live nameplate preview"
                hint="Customers see their text rendered on the plate as they type."
                checked={form.livePreviewEnabled}
                onChange={(v) => set('livePreviewEnabled', v)}
              />
              {form.livePreviewEnabled ? (
                <div className="mt-4">
                  <Select
                    label="Preview template"
                    value={form.livePreviewTemplate}
                    onChange={(e) => set('livePreviewTemplate', e.target.value)}
                    options={PREVIEW_TEMPLATES}
                    hint="The template is the starting point. Everything below overrides it for this product only. Bind each personalisation field to a preview slot on the Personalisation tab."
                  />

                  <PreviewConfigEditor
                    template={form.livePreviewTemplate}
                    config={form.livePreviewConfig}
                    onChange={(next) => set('livePreviewConfig', next)}
                  />
                </div>
              ) : null}
            </AdminCard>
          </div>
        </div>
      ) : null}

      {/* ---------------- Images ---------------- */}
      {tab === 'media' ? (
        isNew ? (
          <UnsavedProductTab
            title="Add product images"
            description="Give the product a name, then save one draft so its images have a product to belong to. You will return directly to Images."
            action="Save draft & add images"
            loading={save.isPending}
            onContinue={() => save.mutate({ publish: false, continueTo: 'media' })}
          />
        ) : (
          <ImagesTab
            productId={id!}
            images={product?.images ?? []}
            videoUrl={form.videoUrl ?? ''}
            onVideoChange={(value) => set('videoUrl', value || null)}
          />
        )
      ) : null}

      {/* ---------------- Pricing ---------------- */}
      {tab === 'pricing' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard title="Price">
            <p className="mb-5 text-xs leading-relaxed text-ink-500">
              Catalogue products are direct-purchase. A product needs a price here, or a price on
              every published variant, before it can be published.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="number" label="Price (₹)" value={form.price ?? ''} error={errors.price}
                hint="Leave blank only if every variant sets its own price."
                onChange={(e) => set('price', e.target.value === '' ? null : Number(e.target.value))}
              />
              <Input
                type="number" label="Compare-at price (₹)" value={form.compareAtPrice ?? ''}
                hint="Shown struck through, if higher than the price."
                onChange={(e) => set('compareAtPrice', e.target.value === '' ? null : Number(e.target.value))}
              />
              <div className="sm:col-span-2">
                <Checkbox
                  label="This price has been reviewed and is correct"
                  hint="Seeded products start unconfirmed. The dashboard flags them until you tick this."
                  checked={form.priceConfirmed}
                  onChange={(v) => set('priceConfirmed', v)}
                />
              </div>
              <div className="sm:col-span-2">
                <Checkbox
                  label="Allow cash on delivery for this product"
                  hint="Leave off for anything made to order. A piece cut to a customer's name cannot be resold if the delivery is refused, and one such item in a basket turns cash on delivery off for that whole order."
                  checked={form.codAvailable}
                  onChange={(v) => set('codAvailable', v)}
                />
              </div>
              <Input
                type="number" label="GST rate (%)" value={form.taxRatePercent ?? ''}
                onChange={(e) => set('taxRatePercent', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </AdminCard>

          <AdminCard title="Stock">
            <Checkbox
              label="Track inventory for this product"
              hint="Turn off for made-to-order items that never run out."
              checked={form.trackInventory}
              onChange={(v) => set('trackInventory', v)}
            />
            <div className={clsx('mt-5 grid gap-4 sm:grid-cols-2', !form.trackInventory && 'opacity-50')}>
              <Input
                type="number" label="Stock on hand" value={form.stock ?? ''} disabled={!form.trackInventory}
                onChange={(e) => set('stock', e.target.value === '' ? null : Number(e.target.value))}
              />
              <Input
                type="number" label="Low stock alert at" value={form.lowStockAlert ?? ''} disabled={!form.trackInventory}
                onChange={(e) => set('lowStockAlert', e.target.value === '' ? null : Number(e.target.value))}
              />
              <Input
                type="number" label="Minimum order qty" value={form.minOrderQty ?? ''}
                onChange={(e) => set('minOrderQty', e.target.value === '' ? null : Number(e.target.value))}
              />
              <Input
                type="number" label="Maximum order qty" value={form.maxOrderQty ?? ''}
                hint="Leave blank for no limit."
                onChange={(e) => set('maxOrderQty', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </AdminCard>
        </div>
      ) : null}

      {/* ---------------- Variants ---------------- */}
      {tab === 'variants' ? (
        isNew ? (
          <UnsavedProductTab
            title="Add variants"
            description="Save one draft first, then add any number of sizes, materials, finishes, prices and stock levels."
            action="Save draft & add variants"
            loading={save.isPending}
            onContinue={() => save.mutate({ publish: false, continueTo: 'variants' })}
          />
        ) : <VariantsTab productId={id!} variants={product?.variants ?? []} />
      ) : null}

      {/* ---------------- Personalisation ---------------- */}
      {tab === 'personalisation' ? (
        isNew ? (
          <UnsavedProductTab
            title="Add personalisation choices"
            description="Save one draft first, then create customer fields for colours, typography, materials, text, artwork and any other choice."
            action="Save draft & add personalisation"
            loading={save.isPending}
            onContinue={() => save.mutate({ publish: false, continueTo: 'personalisation' })}
          />
        ) : (
          <PersonalizationTab
            productId={id!}
            fields={product?.personalization ?? []}
            previewTemplate={form.livePreviewTemplate}
            previewEnabled={form.livePreviewEnabled}
          />
        )
      ) : null}

      {/* ---------------- Organisation ---------------- */}
      {tab === 'organisation' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard title="Category">
            <div className="space-y-5">
              <Select
                label="Category"
                value={form.categoryId}
                onChange={(e) => { set('categoryId', e.target.value); set('subcategoryId', ''); }}
                options={[
                  { value: '', label: 'No category' },
                  ...parentCategories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <Select
                label="Subcategory"
                value={form.subcategoryId}
                onChange={(e) => set('subcategoryId', e.target.value)}
                options={[
                  { value: '', label: subcategories.length ? 'No subcategory' : 'Pick a category first' },
                  ...subcategories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          </AdminCard>

          <AdminCard title="Display">
            <div className="space-y-4">
              <Checkbox label="Featured product" checked={form.featured} onChange={(v) => set('featured', v)} />
              <Checkbox label="Mark as new" checked={form.isNew} onChange={(v) => set('isNew', v)} />
              <Input label="Badge text" value={form.badge} placeholder="e.g. Bestseller" onChange={(e) => set('badge', e.target.value)} />
              <Input
                type="number" label="Sort order" value={form.sortOrder ?? ''}
                hint="Lower numbers appear first."
                onChange={(e) => set('sortOrder', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </AdminCard>

          <AdminCard
            title="Materials, colours, styles & typography"
            description="Select what applies to this product. Add, edit or remove an option here; use the full manager to add or remove whole groups."
            className="lg:col-span-2"
            actions={
              <Link
                to="/admin/attributes"
                className="text-2xs uppercase tracking-architect text-ink-500 hover:text-ink"
              >
                Manage groups
              </Link>
            }
          >
            {attributesQuery.data?.data.length ? (
              <div className="space-y-6">
                {attributesQuery.data.data.map((group) => (
                  <div key={group.id} className="border-b border-stone-line pb-5 last:border-0 last:pb-0">
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <p className="text-2xs font-semibold uppercase tracking-architect">
                        {group.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => setAttributeDraft({
                          groupId: group.id,
                          groupName: group.name,
                          name: '',
                          hexColor: '',
                        })}
                        className="inline-flex items-center gap-1 text-2xs uppercase tracking-architect text-ink-500 hover:text-ink"
                      >
                        <PlusIcon size={12} /> Add option
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(group.values ?? []).map((value) => {
                        const selected = form.attributeValueIds.includes(value.id);
                        return (
                          <span
                            key={value.id}
                            className={clsx(
                              'inline-flex items-stretch border text-xs transition-colors',
                              selected ? 'border-ink bg-ink text-paper' : 'border-stone-line bg-paper',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                set(
                                  'attributeValueIds',
                                  selected
                                    ? form.attributeValueIds.filter((v) => v !== value.id)
                                    : [...form.attributeValueIds, value.id],
                                )
                              }
                              className="inline-flex items-center gap-2 px-3 py-2"
                              aria-pressed={selected}
                            >
                              {value.hexColor ? (
                                <span
                                  className="h-3.5 w-3.5 border border-current/30"
                                  style={{ backgroundColor: value.hexColor }}
                                />
                              ) : null}
                              {value.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAttributeDraft({
                                id: value.id,
                                groupId: group.id,
                                groupName: group.name,
                                name: value.name,
                                hexColor: value.hexColor ?? '',
                              })}
                              className="border-l border-current/20 px-2 opacity-65 hover:opacity-100"
                              aria-label={`Edit ${value.name}`}
                            >
                              <EditIcon size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingAttribute(value)}
                              className="border-l border-current/20 px-2 opacity-65 hover:text-state-danger hover:opacity-100"
                              aria-label={`Delete ${value.name}`}
                            >
                              <TrashIcon size={12} />
                            </button>
                          </span>
                        );
                      })}
                      {(group.values ?? []).length === 0 ? (
                        <p className="text-xs text-ink-400">No options yet. Add the first one.</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">
                No attribute groups yet. Create them under Materials, styles & shapes.
              </p>
            )}
          </AdminCard>
        </div>
      ) : null}

      {/* ---------------- SEO ---------------- */}
      {tab === 'seo' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <AdminCard title="Search engine listing" className="lg:col-span-2">
            <div className="space-y-5">
              <Input
                label="Page title" value={form.seoTitle} maxLength={70}
                hint={`${form.seoTitle.length}/70 — leave blank to use the product name.`}
                onChange={(e) => set('seoTitle', e.target.value)}
              />
              <Textarea
                label="Meta description" value={form.seoDescription} rows={3} maxLength={170}
                hint={`${form.seoDescription.length}/170 — leave blank to use the short description.`}
                onChange={(e) => set('seoDescription', e.target.value)}
              />
              <Input
                label="Keywords" value={form.seoKeywords}
                hint="Comma separated. Also used by the on-site search."
                onChange={(e) => set('seoKeywords', e.target.value)}
              />
            </div>
          </AdminCard>

          <AdminCard title="Preview">
            <div className="rounded-[var(--a-radius-sm)] border border-[#DADCE0] bg-white p-4">
              <p className="truncate text-xs text-[#1a0dab]">
                {form.seoTitle || form.name || 'Product name'} | Beyond Walls
              </p>
              <p className="mt-0.5 truncate font-mono text-2xs text-[#006621]">
                thebeyondwalls.com/product/{form.slug || 'slug'}
              </p>
              <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-[#4D5156]">
                {form.seoDescription || form.shortDescription || 'Add a description so search results read well.'}
              </p>
            </div>
            <p className="mt-4 text-2xs leading-relaxed text-ink-400">
              Product, breadcrumb and offer schema are generated automatically. A product priced on
              request publishes availability without a price, so no invented price reaches Google.
            </p>
          </AdminCard>
        </div>
      ) : null}

      </div>

      <Modal
        open={Boolean(attributeDraft)}
        onClose={() => setAttributeDraft(null)}
        title={attributeDraft?.id ? `Edit ${attributeDraft.groupName} option` : `Add ${attributeDraft?.groupName ?? ''} option`}
        size="sm"
      >
        {attributeDraft ? (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (attributeDraft.name.trim()) saveAttribute.mutate(attributeDraft);
            }}
          >
            <Input
              label="Option name"
              required
              value={attributeDraft.name}
              placeholder={`e.g. ${attributeDraft.groupName}`}
              onChange={(event) => setAttributeDraft({ ...attributeDraft, name: event.target.value })}
            />
            <div>
              <span className="field-label">Colour swatch (optional)</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={attributeDraft.hexColor || '#111111'}
                  onChange={(event) => setAttributeDraft({ ...attributeDraft, hexColor: event.target.value })}
                  className="h-10 w-14 cursor-pointer border border-stone-line bg-paper p-1"
                  aria-label="Option colour"
                />
                <input
                  value={attributeDraft.hexColor}
                  placeholder="#111111 or leave blank"
                  className="field flex-1 font-mono"
                  onChange={(event) => setAttributeDraft({ ...attributeDraft, hexColor: event.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setAttributeDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saveAttribute.isPending}>
                {attributeDraft.id ? 'Save option' : 'Add & select'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingAttribute)}
        title={`Delete “${deletingAttribute?.name ?? ''}”?`}
        message="This option will be removed from every product that uses it. Existing order records are not changed."
        loading={removeAttribute.isPending}
        onCancel={() => setDeletingAttribute(null)}
        onConfirm={() => deletingAttribute && removeAttribute.mutate(deletingAttribute)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Images tab
// ---------------------------------------------------------------------------

function UnsavedProductTab({
  title, description, action, loading, onContinue,
}: {
  title: string;
  description: string;
  action: string;
  loading: boolean;
  onContinue: () => void;
}) {
  return (
    <AdminCard title={title} description={description}>
      <div className="flex flex-col items-start gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Nothing is disabled.</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
            Images and reusable options need a saved product ID. This creates a private draft only;
            customers cannot see it until you publish.
          </p>
        </div>
        <Button type="button" loading={loading} onClick={onContinue}>
          {action}
        </Button>
      </div>
    </AdminCard>
  );
}

function ImagesTab({
  productId, images, videoUrl, onVideoChange,
}: {
  productId: string;
  images: ProductImage[];
  videoUrl: string;
  onVideoChange: (value: string) => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [ordered, setOrdered] = useState(images);

  useEffect(() => setOrdered(images), [images]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });

  const upload = async (files: FileList) => {
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append('images', file));
      form.append('folder', 'products');
      await api.upload(`/admin/products/${productId}/images`, form);
      await refresh();
      push(`${files.length} image${files.length === 1 ? '' : 's'} uploaded`, 'success');
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  /*
   * Attach images that are already on the site.
   *
   * Photography gets reused -- the same studio shot across a size variant, a
   * lifestyle image across a whole category -- and uploading it again would
   * put a second copy in storage for every product that shows it.
   *
   * Sent one at a time on purpose. The endpoint works out each image's
   * position from how many the product already has, so firing them off in
   * parallel would have them all read the same count and land in an arbitrary
   * order. In sequence, they arrive in the order they were ticked.
   *
   * The alt text stored against the file comes with it, so a picture
   * described once stays described everywhere it is used.
   */
  const linkFromLibrary = async (assets: MediaAsset[]) => {
    setLibraryOpen(false);
    if (!assets.length) return;
    setLinking(true);
    try {
      for (const asset of assets) {
        await api.post(`/admin/products/${productId}/images/link`, {
          url: asset.url,
          alt: asset.alt ?? '',
        });
      }
      await refresh();
      push(`${assets.length} image${assets.length === 1 ? '' : 's'} added`, 'success');
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not add images', 'error');
    } finally {
      setLinking(false);
    }
  };

  const remove = useMutation({
    mutationFn: (imageId: string) => api.delete(`/admin/products/${productId}/images/${imageId}`),
    onSuccess: async () => {
      await refresh();
      push('Image removed', 'info');
    },
  });

  const setPrimary = useMutation({
    mutationFn: (imageId: string) =>
      api.patch(`/admin/products/${productId}/images/${imageId}`, { isPrimary: true }),
    onSuccess: refresh,
  });

  const setAlt = useMutation({
    mutationFn: ({ imageId, alt }: { imageId: string; alt: string }) =>
      api.patch(`/admin/products/${productId}/images/${imageId}`, { alt }),
    onSuccess: async () => {
      await refresh();
      push('Alt text saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save alt text', 'error'),
  });

  const reorder = useMutation({
    mutationFn: (items: ProductImage[]) =>
      api.post(`/admin/products/${productId}/images/reorder`, {
        items: items.map((image, index) => ({ id: image.id, sortOrder: index })),
      }),
    onSuccess: refresh,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <AdminCard title="Product images" description="The first image is the one used on product cards." className="lg:col-span-2">
        {ordered.length ? (
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {ordered.map((image, index) => (
              <figure key={image.id} className="group border border-stone-line bg-paper-warm">
                <div className="relative">
                <img src={assetUrl(image.url)} alt={image.alt ?? ''} className="aspect-square w-full object-cover" />

                {image.isPrimary ? (
                  <Badge tone="dark" className="absolute left-2 top-2">
                    Main
                  </Badge>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-paper/95 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...ordered];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setOrdered(next);
                        reorder.mutate(next);
                      }}
                      className="px-1.5 text-ink-400 hover:text-ink disabled:opacity-25"
                      aria-label="Move left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === ordered.length - 1}
                      onClick={() => {
                        const next = [...ordered];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setOrdered(next);
                        reorder.mutate(next);
                      }}
                      className="px-1.5 text-ink-400 hover:text-ink disabled:opacity-25"
                      aria-label="Move right"
                    >
                      →
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {!image.isPrimary ? (
                      <button
                        type="button"
                        onClick={() => image.id && setPrimary.mutate(image.id)}
                        className="text-[0.6rem] uppercase tracking-architect text-ink-500 hover:text-ink"
                      >
                        Set main
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => image.id && remove.mutate(image.id)}
                      className="text-ink-400 hover:text-state-danger"
                      aria-label="Delete image"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
                </div>

                <figcaption className="border-t border-stone-line p-2">
                  <AltTextField
                    value={image.alt ?? ''}
                    saving={setAlt.isPending}
                    onSave={(alt) => image.id && setAlt.mutate({ imageId: image.id, alt })}
                  />
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        <div className="space-y-2.5">
          <MultiImageUpload onUpload={(files) => void upload(files)} uploading={uploading} />
          <Button
            type="button"
            variant="secondary"
            fullWidth
            loading={linking}
            onClick={() => setLibraryOpen(true)}
          >
            Choose from media library
          </Button>
        </div>

        <MediaPicker
          multiple
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onPick={(assets) => void linkFromLibrary(assets)}
        />
      </AdminCard>

      <AdminCard
        title="Product video"
        description="Optional. Shown as the last slide in the gallery."
        className="lg:col-span-2"
      >
        <VideoField value={videoUrl} onChange={onVideoChange} />
      </AdminCard>

      <AdminCard title="Tips">
        <ul className="space-y-3 text-xs leading-relaxed text-ink-500">
          <li>Use square images (1:1) so the grid stays even.</li>
          <li>Lead with a clean product shot, then show it in place.</li>
          <li>Alt text describes the image for screen readers and search engines. Say what is shown, e.g. “Brushed brass nameplate on a teak door”.</li>
          <li>Drag order here controls the order on the product page.</li>
        </ul>
      </AdminCard>
    </div>
  );
}

/**
 * Per-product live-preview configuration.
 *
 * The selected template supplies every default; this editor writes only the
 * values that have been deliberately changed, so a product keeps following its
 * template until an admin overrides a specific setting — and clearing a field
 * hands it back to the template.
 */
function PreviewConfigEditor({
  template, config, onChange,
}: {
  template: string;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const resolved = resolvePreviewConfig(template || 'nameplate-minimal', config);
  const stored = config as Partial<PreviewConfig>;

  /** Writes one branch of the config, dropping it entirely when it is empty. */
  const patch = (key: keyof PreviewConfig, value: unknown) => {
    const next = { ...config };
    if (value === undefined || value === null || value === '') delete next[key];
    else next[key] = value;
    onChange(next);
  };

  const patchGroup = <K extends 'plate' | 'defaults' | 'placeholders'>(
    group: K,
    field: string,
    value: unknown,
  ) => {
    const current = { ...(stored[group] ?? {}) } as Record<string, unknown>;
    if (value === undefined || value === null || value === '') delete current[field];
    else current[field] = value;
    patch(group, Object.keys(current).length ? current : undefined);
  };

  const overrideCount = Object.keys(config ?? {}).length;

  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-center justify-between border-b border-stone-line pb-2">
        <p className="text-2xs uppercase tracking-architect text-ink-400">
          Preview settings for this product
        </p>
        {overrideCount ? (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-2xs uppercase tracking-architect text-ink-500 hover:text-state-danger"
          >
            Reset to template
          </button>
        ) : (
          <span className="text-2xs text-ink-300">Following the template</span>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ColourOverrideField
          label="Default plate colour"
          value={String(stored.defaults?.plateColor ?? '')}
          fallback={resolved.defaults.plateColor}
          palette={resolved.palette.plate}
          onChange={(value) => patchGroup('defaults', 'plateColor', value)}
        />
        <ColourOverrideField
          label="Default text colour"
          value={String(stored.defaults?.textColor ?? '')}
          fallback={resolved.defaults.textColor}
          palette={resolved.palette.text}
          onChange={(value) => patchGroup('defaults', 'textColor', value)}
        />
        <label className="block">
          <span className="field-label">Default typography</span>
          <input
            list="preview-font-families"
            value={String(stored.defaults?.fontFamily ?? '')}
            placeholder={`From template (${resolved.defaults.fontFamily})`}
            className="field w-full"
            onChange={(event) => patchGroup('defaults', 'fontFamily', event.target.value)}
          />
          <datalist id="preview-font-families">
            {PLATE_FONTS.map((face) => <option key={face.id} value={face.id}>{face.label}</option>)}
          </datalist>
          <span className="mt-1 block text-2xs text-ink-400">
            Choose a built-in face or enter a CSS font family/stack.
          </span>
        </label>
        <Input
          type="number"
          label="Corner radius"
          value={stored.plate?.radius ?? ''}
          placeholder={String(resolved.plate.radius)}
          hint="0 for square corners."
          onChange={(e) => patchGroup('plate', 'radius', e.target.value === '' ? '' : Number(e.target.value))}
        />

        <div className="sm:col-span-2">
          <Checkbox
            label="Show mounting screws"
            checked={resolved.plate.showScrews}
            onChange={(v) => patchGroup('plate', 'showScrews', v)}
          />
        </div>

        <Input
          label="Placeholder — number"
          value={String(stored.placeholders?.number ?? '')}
          placeholder={resolved.placeholders.number ?? '—'}
          onChange={(e) => patchGroup('placeholders', 'number', e.target.value)}
        />
        <Input
          label="Placeholder — line 1"
          value={String(stored.placeholders?.line1 ?? '')}
          placeholder={resolved.placeholders.line1 ?? '—'}
          onChange={(e) => patchGroup('placeholders', 'line1', e.target.value)}
        />
        <Input
          label="Placeholder — line 2"
          value={String(stored.placeholders?.line2 ?? '')}
          placeholder={resolved.placeholders.line2 ?? '—'}
          onChange={(e) => patchGroup('placeholders', 'line2', e.target.value)}
        />
        <Input
          label="Placeholder — line 3"
          value={String(stored.placeholders?.line3 ?? '')}
          placeholder={resolved.placeholders.line3 ?? '—'}
          onChange={(e) => patchGroup('placeholders', 'line3', e.target.value)}
        />

        <Textarea
          label="Caption under the preview"
          value={String(stored.caption ?? '')}
          placeholder={resolved.caption}
          rows={2}
          wrapClassName="sm:col-span-2"
          hint="Customers read this as a promise about the finished piece. Leave it blank to keep the standard wording."
          onChange={(e) => patch('caption', e.target.value)}
        />
      </div>

      <div className="grid gap-5 border-t border-stone-line pt-5 sm:grid-cols-2">
        <PaletteEditor
          title="Plate colour choices"
          values={resolved.palette.plate}
          onChange={(values) => patch('palette', { ...resolved.palette, plate: values })}
        />
        <PaletteEditor
          title="Text colour choices"
          values={resolved.palette.text}
          onChange={(values) => patch('palette', { ...resolved.palette, text: values })}
        />
        {stored.palette ? (
          <button
            type="button"
            onClick={() => patch('palette', undefined)}
            className="justify-self-start text-2xs uppercase tracking-architect text-ink-500 hover:text-state-danger sm:col-span-2"
          >
            Reset both colour lists to template
          </button>
        ) : null}
      </div>

      <LivePreview
        template={template || 'nameplate-minimal'}
        config={config}
        slots={{}}
        className="border border-stone-line"
      />
    </div>
  );
}

type PreviewPaletteValue = PreviewConfig['palette']['plate'][number];

function paletteHex(value: string, palette: PreviewPaletteValue[]): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return palette.find((entry) => entry.value === value)?.hex ?? '#111111';
}

function ColourOverrideField({
  label, value, fallback, palette, onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  palette: PreviewPaletteValue[];
  onChange: (value: string) => void;
}) {
  const effective = value || fallback;
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex gap-2">
        <input
          type="color"
          value={paletteHex(effective, palette)}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 cursor-pointer border border-stone-line bg-paper p-1"
          aria-label={`${label} picker`}
        />
        <input
          value={value}
          placeholder={`From template (${fallback})`}
          className="field min-w-0 flex-1 font-mono text-xs"
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="border border-stone-line px-3 text-ink-400 hover:border-ink hover:text-ink"
            aria-label={`Use template ${label.toLowerCase()}`}
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-2xs text-ink-400">Pick any colour or enter a saved colour value.</p>
    </div>
  );
}

function PaletteEditor({
  title, values, onChange,
}: {
  title: string;
  values: PreviewPaletteValue[];
  onChange: (values: PreviewPaletteValue[]) => void;
}) {
  const update = (index: number, patch: Partial<PreviewPaletteValue>) => {
    const next = [...values];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <div className="border border-stone-line p-4">
      <p className="field-label">{title}</p>
      <p className="mb-3 text-2xs leading-relaxed text-ink-400">
        Save the exact colours used by this product; customer choices are created under Personalisation.
      </p>
      <div className="space-y-2">
        {values.map((entry, index) => (
          <div key={`${entry.value}-${index}`} className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2">
            <input
              type="color"
              value={paletteHex(entry.hex, values)}
              onChange={(event) => update(index, { hex: event.target.value })}
              className="h-10 w-10 cursor-pointer border border-stone-line bg-paper p-1"
              aria-label={`${entry.label || 'Colour'} swatch`}
            />
            <input
              value={entry.label}
              placeholder="Label"
              className="field min-w-0 text-xs"
              onChange={(event) => update(index, { label: event.target.value })}
            />
            <input
              value={entry.value}
              placeholder="value"
              className="field min-w-0 font-mono text-xs"
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}
              className="text-ink-400 hover:text-state-danger"
              aria-label={`Remove ${entry.label || 'colour'}`}
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="mt-3"
        icon={<PlusIcon size={13} />}
        onClick={() => {
          const suffix = values.length + 1;
          onChange([...values, { value: `custom-${suffix}`, label: `Custom ${suffix}`, hex: '#777777' }]);
        }}
      >
        Add colour
      </Button>
    </div>
  );
}

/**
 * Per-image alt text. Saves on blur or Enter, and only when it has actually
 * changed, so browsing the grid never fires a write.
 */
function AltTextField({
  value, onSave, saving,
}: {
  value: string;
  onSave: (alt: string) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  };

  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] uppercase tracking-architect text-ink-400">
        Alt text
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') setDraft(value);
        }}
        disabled={saving}
        placeholder="Describe this image"
        className="w-full border border-stone-line bg-paper px-2 py-1 text-xs text-ink-700 placeholder:text-ink-300 focus:border-ink focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Variants tab
// ---------------------------------------------------------------------------

interface VariantDraft {
  id?: string;
  label: string;
  sku: string;
  price: number | null;
  stock: number | null;
  isDefault: boolean;
  status: ContentStatus;
  options: { key: string; value: string }[];
}

const EMPTY_VARIANT: VariantDraft = {
  label: '', sku: '', price: null, stock: 0, isDefault: false, status: 'PUBLISHED', options: [],
};

function VariantsTab({ productId, variants }: { productId: string; variants: ProductVariant[] }) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [editing, setEditing] = useState<VariantDraft | null>(null);
  const [deleting, setDeleting] = useState<ProductVariant | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });

  const save = useMutation({
    mutationFn: (draft: VariantDraft) => {
      const payload = {
        label: draft.label,
        sku: draft.sku || null,
        price: draft.price,
        stock: draft.stock ?? 0,
        isDefault: draft.isDefault,
        status: draft.status,
        options: Object.fromEntries(draft.options.filter((o) => o.key).map((o) => [o.key, o.value])),
      };
      return draft.id
        ? api.patch(`/admin/products/${productId}/variants/${draft.id}`, payload)
        : api.post(`/admin/products/${productId}/variants`, payload);
    },
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      push('Variant saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save', 'error'),
  });

  const remove = useMutation({
    mutationFn: (variantId: string) => api.delete(`/admin/products/${productId}/variants/${variantId}`),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
      push('Variant removed', 'info');
    },
  });

  const reorder = useMutation({
    mutationFn: (items: ProductVariant[]) =>
      api.post(`/admin/products/${productId}/variants/reorder`, {
        items: items.map((v, index) => ({ id: v.id, sortOrder: index })),
      }),
    onSuccess: refresh,
  });

  return (
    <>
      <AdminCard
        title="Variants"
        description="Sizes, materials or finishes a customer can choose. A variant price overrides the product price."
        actions={
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setEditing({ ...EMPTY_VARIANT })}>
            Add variant
          </Button>
        }
      >
        {variants.length ? (
          <SortableList
            items={variants}
            onReorder={(next) => reorder.mutate(next)}
            renderItem={(variant) => (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {variant.label}
                    {variant.isDefault ? <Badge tone="dark">Default</Badge> : null}
                    {variant.status === 'DRAFT' ? <Badge tone="warning">Draft</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-2xs text-ink-400">
                    {variant.sku ? `${variant.sku} · ` : ''}
                    {variant.price !== null ? `₹${variant.price}` : 'Uses product price'} · stock {variant.stock}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: variant.id,
                        label: variant.label,
                        sku: variant.sku ?? '',
                        price: toNumber(variant.price),
                        stock: variant.stock,
                        isDefault: Boolean(variant.isDefault),
                        status: variant.status ?? 'PUBLISHED',
                        options: Object.entries(variant.options ?? {}).map(([key, value]) => ({ key, value })),
                      })
                    }
                    className="p-1.5 text-ink-400 hover:text-ink"
                    aria-label="Edit variant"
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(variant)}
                    className="p-1.5 text-ink-400 hover:text-state-danger"
                    aria-label="Delete variant"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
            )}
          />
        ) : (
          <p className="py-8 text-center text-sm text-ink-400">
            No variants. The product is sold as a single option.
          </p>
        )}
      </AdminCard>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit variant' : 'Add variant'}
      >
        {editing ? (
          <VariantForm
            draft={editing}
            saving={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(draft) => save.mutate(draft)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this variant?"
        message={`"${deleting?.label}" will be removed. Orders that already reference it keep their snapshot.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function VariantForm({
  draft, saving, onSubmit, onCancel,
}: {
  draft: VariantDraft;
  saving: boolean;
  onSubmit: (draft: VariantDraft) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(draft);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <Input
        label="Label" required value={form.label}
        placeholder="e.g. 12 x 6 inches — Acrylic"
        hint="This is what the customer picks on the product page."
        onChange={(e) => setForm({ ...form, label: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <Input
          type="number" label="Price (₹)" value={form.price ?? ''}
          hint="Blank = product price"
          onChange={(e) => setForm({ ...form, price: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <Input
          type="number" label="Stock" value={form.stock ?? ''}
          onChange={(e) => setForm({ ...form, stock: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </div>

      {/* Option key/value pairs */}
      <div>
        <span className="field-label">Options</span>
        {form.options.map((option, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="mb-2 flex gap-2">
            <input
              value={option.key}
              placeholder="Size"
              className="field flex-1"
              onChange={(e) => {
                const next = [...form.options];
                next[index] = { ...next[index], key: e.target.value };
                setForm({ ...form, options: next });
              }}
            />
            <input
              value={option.value}
              placeholder="12 x 6 in"
              className="field flex-1"
              onChange={(e) => {
                const next = [...form.options];
                next[index] = { ...next[index], value: e.target.value };
                setForm({ ...form, options: next });
              }}
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, options: form.options.filter((_, i) => i !== index) })}
              className="px-2 text-ink-400 hover:text-state-danger"
              aria-label="Remove option"
            >
              <CloseIcon size={15} />
            </button>
          </div>
        ))}
        <Button
          type="button" size="sm" variant="ghost"
          onClick={() => setForm({ ...form, options: [...form.options, { key: '', value: '' }] })}
        >
          + Add option
        </Button>
      </div>

      <div className="space-y-3">
        <Checkbox
          label="Default selection"
          checked={form.isDefault}
          onChange={(v) => setForm({ ...form, isDefault: v })}
        />
        <Checkbox
          label="Published (visible to customers)"
          checked={form.status === 'PUBLISHED'}
          onChange={(v) => setForm({ ...form, status: v ? 'PUBLISHED' : 'DRAFT' })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save variant
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Personalisation tab
// ---------------------------------------------------------------------------

const FIELD_TYPES: { value: PersonalizationType; label: string }[] = [
  { value: 'TEXT', label: 'Single line text' },
  { value: 'TEXTAREA', label: 'Multi-line text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'SELECT', label: 'Dropdown' },
  { value: 'RADIO', label: 'Button choice' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'COLOR', label: 'Colour swatches' },
  { value: 'FONT', label: 'Font choice' },
  { value: 'IMAGE_UPLOAD', label: 'Image upload (logo)' },
  { value: 'FILE_UPLOAD', label: 'File upload (artwork)' },
  { value: 'URL', label: 'URL (e.g. QR link)' },
  { value: 'GSTIN', label: 'GSTIN' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'DATE', label: 'Date' },
];

/** Ready-made field sets for the common Beyond Walls products. */
const PRESETS: { label: string; fields: Partial<PersonalizationField>[] }[] = [
  {
    label: 'Home nameplate',
    fields: [
      { key: 'houseNumber', label: 'House / flat number', type: 'TEXT', maxLength: 10, previewSlot: 'number' },
      { key: 'name', label: 'Name', type: 'TEXT', required: true, maxLength: 28, previewSlot: 'line1' },
      { key: 'familyName', label: 'Family name', type: 'TEXT', maxLength: 20, previewSlot: 'line2' },
      { key: 'instructions', label: 'Instructions for us', type: 'TEXTAREA', maxLength: 500 },
    ],
  },
  {
    label: 'Office / desk plate',
    fields: [
      { key: 'officeName', label: 'Office or company name', type: 'TEXT', required: true, maxLength: 40, previewSlot: 'line1' },
      { key: 'personName', label: 'Name', type: 'TEXT', maxLength: 30, previewSlot: 'line2' },
      { key: 'degree', label: 'Degree / qualification', type: 'TEXT', maxLength: 40, previewSlot: 'line3' },
      { key: 'logoUpload', label: 'Logo', type: 'IMAGE_UPLOAD', previewSlot: 'logo' },
      { key: 'instructions', label: 'Instructions for us', type: 'TEXTAREA', maxLength: 500 },
    ],
  },
  {
    label: 'GST plate',
    fields: [
      { key: 'officeName', label: 'Business name', type: 'TEXT', required: true, maxLength: 60, previewSlot: 'line1' },
      { key: 'gstin', label: 'GSTIN', type: 'GSTIN', required: true, previewSlot: 'line2' },
      { key: 'instructions', label: 'Instructions for us', type: 'TEXTAREA', maxLength: 500 },
    ],
  },
  {
    label: 'QR stand',
    fields: [
      { key: 'qrUrl', label: 'Link the QR should open', type: 'URL', required: true },
      { key: 'message', label: 'Text on the stand', type: 'TEXT', maxLength: 40, previewSlot: 'line1' },
      { key: 'logoUpload', label: 'Logo', type: 'IMAGE_UPLOAD', previewSlot: 'logo' },
    ],
  },
];

interface FieldDraft {
  id?: string;
  key: string;
  label: string;
  type: PersonalizationType;
  placeholder: string;
  helpText: string;
  required: boolean;
  maxLength: number | null;
  minLength: number | null;
  defaultValue: string;
  priceDelta: number | null;
  previewSlot: string;
  status: ContentStatus;
  options: { label: string; value: string; hex?: string; priceDelta?: number }[];
}

const EMPTY_FIELD: FieldDraft = {
  key: '', label: '', type: 'TEXT', placeholder: '', helpText: '', required: true,
  maxLength: null, minLength: null, defaultValue: '', priceDelta: 0, previewSlot: '',
  status: 'PUBLISHED', options: [],
};

function PersonalizationTab({
  productId, fields, previewTemplate, previewEnabled,
}: {
  productId: string;
  fields: PersonalizationField[];
  previewTemplate: string;
  previewEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [editing, setEditing] = useState<FieldDraft | null>(null);
  const [deleting, setDeleting] = useState<PersonalizationField | null>(null);
  const [demoValues, setDemoValues] = useState<Record<string, string>>({});

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });

  const save = useMutation({
    mutationFn: (draft: FieldDraft) => {
      const payload = {
        key: draft.key,
        label: draft.label,
        type: draft.type,
        placeholder: draft.placeholder || null,
        helpText: draft.helpText || null,
        required: true,
        maxLength: draft.maxLength,
        minLength: draft.minLength,
        defaultValue: draft.defaultValue || null,
        priceDelta: draft.priceDelta ?? 0,
        previewSlot: draft.previewSlot || null,
        status: draft.status,
        options: draft.options,
      };
      return draft.id
        ? api.patch(`/admin/products/${productId}/personalization/${draft.id}`, payload)
        : api.post(`/admin/products/${productId}/personalization`, payload);
    },
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      push('Field saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save field', 'error'),
  });

  const remove = useMutation({
    mutationFn: (fieldId: string) =>
      api.delete(`/admin/products/${productId}/personalization/${fieldId}`),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
      push('Field removed', 'info');
    },
  });

  const reorder = useMutation({
    mutationFn: (items: PersonalizationField[]) =>
      api.post(`/admin/products/${productId}/personalization/reorder`, {
        items: items.map((f, index) => ({ id: f.id, sortOrder: index })),
      }),
    onSuccess: refresh,
  });

  const applyPreset = useMutation({
    mutationFn: async (preset: (typeof PRESETS)[number]) => {
      for (const field of preset.fields) {
        // Skip a key that already exists, so re-applying is safe.
        if (fields.some((f) => f.key === field.key)) continue;
        await api.post(`/admin/products/${productId}/personalization`, {
          ...field,
          required: true,
          options: [],
          status: 'PUBLISHED',
        });
      }
    },
    onSuccess: async () => {
      await refresh();
      push('Preset applied', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not apply preset', 'error'),
  });

  const previewSlots = useMemo(() => buildPreviewSlots(fields, demoValues), [fields, demoValues]);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AdminCard
            title="Personalisation fields"
            description="Every published field is required. A WhatsApp contact number is added automatically for order reference and proof approval."
            actions={
              <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setEditing({ ...EMPTY_FIELD })}>
                Add field
              </Button>
            }
          >
            {fields.length ? (
              <SortableList
                items={fields}
                onReorder={(next) => reorder.mutate(next)}
                renderItem={(field) => (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {field.label}
                        {field.status === 'PUBLISHED' ? <Badge tone="danger">Required</Badge> : null}
                        {field.previewSlot ? <Badge tone="info">→ {field.previewSlot}</Badge> : null}
                        {field.status === 'DRAFT' ? <Badge tone="warning">Draft</Badge> : null}
                      </p>
                      <p className="mt-0.5 font-mono text-2xs text-ink-400">
                        {field.key} · {field.type}
                        {Number(field.priceDelta) > 0 ? ` · +₹${field.priceDelta}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            id: field.id,
                            key: field.key,
                            label: field.label,
                            type: field.type,
                            placeholder: field.placeholder ?? '',
                            helpText: field.helpText ?? '',
                            required: true,
                            maxLength: field.maxLength ?? null,
                            minLength: field.minLength ?? null,
                            defaultValue: field.defaultValue ?? '',
                            priceDelta: toNumber(field.priceDelta) ?? 0,
                            previewSlot: field.previewSlot ?? '',
                            status: field.status,
                            options: (field.options ?? []).map((o) => ({
                              label: o.label,
                              value: o.value,
                              hex: o.hex,
                              priceDelta: toNumber(o.priceDelta ?? 0) ?? 0,
                            })),
                          })
                        }
                        className="p-1.5 text-ink-400 hover:text-ink"
                        aria-label="Edit field"
                      >
                        <EditIcon size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(field)}
                        className="p-1.5 text-ink-400 hover:text-state-danger"
                        aria-label="Delete field"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                )}
              />
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-ink-400">No personalisation fields yet.</p>
                <p className="mt-4 text-2xs uppercase tracking-architect text-ink-300">
                  Start from a preset
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant="secondary"
                      loading={applyPreset.isPending}
                      onClick={() => applyPreset.mutate(preset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </AdminCard>
        </div>

        {/* Preview tester */}
        <AdminCard title="Try it" description="Fill these in to check the preview bindings.">
          {fields.length ? (
            <>
              <div className="space-y-3">
                {fields
                  .filter((f) => f.previewSlot)
                  .map((field) => (
                    <Input
                      key={field.id}
                      label={field.label}
                      value={demoValues[field.key] ?? ''}
                      onChange={(e) => setDemoValues({ ...demoValues, [field.key]: e.target.value })}
                    />
                  ))}
              </div>

              {previewEnabled ? (
                <LivePreview
                  template={previewTemplate || 'nameplate-minimal'}
                  slots={previewSlots}
                  className="mt-5 border border-stone-line"
                />
              ) : (
                <p className="mt-5 border border-dashed border-stone-line p-4 text-xs text-ink-400">
                  Live preview is off for this product. Turn it on under Details → Live preview.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-ink-400">Add a field to test the preview.</p>
          )}
        </AdminCard>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit field' : 'Add personalisation field'}
        size="lg"
      >
        {editing ? (
          <FieldForm
            draft={editing}
            saving={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(draft) => save.mutate(draft)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this field?"
        message={`"${deleting?.label}" will no longer be asked for. Existing orders keep the answers they already captured.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function FieldForm({
  draft, saving, onSubmit, onCancel,
}: {
  draft: FieldDraft;
  saving: boolean;
  onSubmit: (draft: FieldDraft) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(draft);
  const needsOptions = ['SELECT', 'RADIO', 'COLOR', 'FONT'].includes(form.type);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Label shown to the customer" required value={form.label}
          onChange={(e) => {
            const label = e.target.value;
            setForm((prev) => ({
              ...prev,
              label,
              // Derive a machine key on first entry only.
              key: prev.id || prev.key ? prev.key : label.replace(/[^a-zA-Z0-9 ]/g, '').split(' ')
                .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
                .join(''),
            }));
          }}
        />
        <Input
          label="Field key" required value={form.key}
          hint="Used in the order record. Letters, numbers and underscore."
          onChange={(e) => setForm({ ...form, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
        />
        <Select
          label="Field type" value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as PersonalizationType })}
          options={FIELD_TYPES}
        />
        <Select
          label="Live preview slot" value={form.previewSlot}
          hint="Where this value appears on the plate preview."
          onChange={(e) => setForm({ ...form, previewSlot: e.target.value })}
          options={PREVIEW_SLOTS}
        />
        <Input label="Placeholder" value={form.placeholder} onChange={(e) => setForm({ ...form, placeholder: e.target.value })} />
        <Input label="Default value" value={form.defaultValue} onChange={(e) => setForm({ ...form, defaultValue: e.target.value })} />
        <Input
          label="Help text" value={form.helpText} wrapClassName="sm:col-span-2"
          onChange={(e) => setForm({ ...form, helpText: e.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          type="number" label="Min length" value={form.minLength ?? ''}
          onChange={(e) => setForm({ ...form, minLength: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <Input
          type="number" label="Max length" value={form.maxLength ?? ''}
          onChange={(e) => setForm({ ...form, maxLength: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <Input
          type="number" label="Adds to price (₹)" value={form.priceDelta ?? ''}
          onChange={(e) => setForm({ ...form, priceDelta: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </div>

      {needsOptions ? (
        <div className="border border-stone-line p-4">
          <p className="field-label">Options</p>
          {form.type === 'FONT' ? (
            <p className="mb-3 text-xs leading-relaxed a-muted">
              Add or remove as many typography choices as needed. Built-in faces render reliably;
              a custom CSS font family works when that font is available in the customer&apos;s browser.
            </p>
          ) : null}
          {form.options.map((option, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="mb-2 grid grid-cols-12 gap-2">
              <input
                value={option.label} placeholder="Label" className="field col-span-4"
                onChange={(e) => {
                  const next = [...form.options];
                  next[index] = { ...next[index], label: e.target.value };
                  setForm({ ...form, options: next });
                }}
              />
              {/* Built-in typography is suggested, while a studio may still enter a custom CSS stack. */}
              {form.type === 'FONT' ? (
                <input
                  list="personalisation-font-families"
                  value={option.value}
                  placeholder="Font id or CSS stack"
                  className="field col-span-3 text-xs"
                  onChange={(e) => {
                    const next = [...form.options];
                    const face = PLATE_FONTS.find((f) => f.id === e.target.value);
                    next[index] = {
                      ...next[index],
                      value: e.target.value,
                      // Fill the label in on first pick, but never overwrite
                      // wording the admin has already chosen.
                      label: next[index].label || (face?.label ?? ''),
                    };
                    setForm({ ...form, options: next });
                  }}
                />
              ) : (
                <input
                  value={option.value} placeholder="value" className="field col-span-3 font-mono text-xs"
                  onChange={(e) => {
                    const next = [...form.options];
                    next[index] = { ...next[index], value: e.target.value };
                    setForm({ ...form, options: next });
                  }}
                />
              )}
              {form.type === 'COLOR' ? (
                <input
                  type="color" value={option.hex ?? '#111111'} className="col-span-2 h-10 cursor-pointer border border-stone-line bg-paper p-1"
                  onChange={(e) => {
                    const next = [...form.options];
                    next[index] = { ...next[index], hex: e.target.value };
                    setForm({ ...form, options: next });
                  }}
                />
              ) : (
                <span className="col-span-2" />
              )}
              <input
                type="number" value={option.priceDelta ?? 0} placeholder="+₹" className="field col-span-2"
                onChange={(e) => {
                  const next = [...form.options];
                  next[index] = { ...next[index], priceDelta: Number(e.target.value) };
                  setForm({ ...form, options: next });
                }}
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, options: form.options.filter((_, i) => i !== index) })}
                className="col-span-1 text-ink-400 hover:text-state-danger"
                aria-label="Remove option"
              >
                <CloseIcon size={15} />
              </button>
            </div>
          ))}
          {form.type === 'FONT' ? (
            <datalist id="personalisation-font-families">
              {PLATE_FONTS.map((face) => <option key={face.id} value={face.id}>{face.label}</option>)}
            </datalist>
          ) : null}
          <Button
            type="button" size="sm" variant="ghost"
            onClick={() =>
              setForm({ ...form, options: [...form.options, { label: '', value: '', priceDelta: 0 }] })
            }
          >
            + Add option
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-xs text-ink-500">
          Published personalisation fields are always required before purchase.
        </p>
        <Checkbox
          label="Published (shown to customers)"
          checked={form.status === 'PUBLISHED'}
          onChange={(v) => setForm({ ...form, status: v ? 'PUBLISHED' : 'DRAFT' })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save field
        </Button>
      </div>
    </form>
  );
}

/**
 * The optional product video.
 *
 * A link rather than an upload: a video is tens of megabytes, the uploads
 * directory on the host is wiped on every deploy, and YouTube and Vimeo
 * already do the transcoding and the bandwidth. The link is checked as it is
 * typed and played back here, so a wrong paste is obvious before saving.
 */
function VideoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const trimmed = draft.trim();
  const video = resolveVideo(trimmed);
  const broken = Boolean(trimmed) && !video;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <Input
          label="Video link"
          placeholder="https://www.youtube.com/watch?v=…"
          value={draft}
          error={broken ? VIDEO_HELP : undefined}
          hint={broken ? undefined : VIDEO_HELP}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = trimmed;
            // A link that cannot be played is not saved, so the gallery never
            // has to cope with one.
            if (next && !resolveVideo(next)) return;
            if (next !== (value ?? '')) onChange(next);
          }}
        />

        {value ? (
          <button
            type="button"
            className="a-btn a-btn-ghost mt-2 text-state-danger"
            onClick={() => { setDraft(''); onChange(''); }}
          >
            <TrashIcon size={13} />
            Remove the video
          </button>
        ) : null}
      </div>

      <div>
        <span className="field-label">Preview</span>
        {video ? (
          video.kind === 'file' ? (
            <video controls preload="metadata" className="aspect-video w-full rounded-[var(--a-radius-sm)] bg-ink">
              <source src={video.src} />
            </video>
          ) : (
            <iframe
              src={video.src}
              title="Video preview"
              loading="lazy"
              allowFullScreen
              className="aspect-video w-full rounded-[var(--a-radius-sm)] border-0 bg-ink"
            />
          )
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-[var(--a-radius-sm)] border border-dashed border-stone-line text-xs text-ink-400">
            {broken ? 'That link cannot be played' : 'No video yet'}
          </div>
        )}
      </div>
    </div>
  );
}

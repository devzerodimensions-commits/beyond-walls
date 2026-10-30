import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { Category, Product } from '../../lib/types';
import { slugify } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader, MediaPicker, MultiImageUpload } from '../../components/admin/AdminKit';
import { ProductCard } from '../../components/product/ProductCard';
import {
  Badge, Button, Checkbox, CheckIcon, CloseIcon, Input, Select, Textarea, TrashIcon,
} from '../../components/ui';
import type { MediaAsset, ProductImage } from '../../lib/types';

/**
 * Adding a product, one question at a time.
 *
 * The tabbed editor is the right tool for changing a product: everything is
 * one click away and nothing is hidden. It is the wrong tool for creating one,
 * because seven tabs of empty fields do not say which matter, which can wait,
 * or whether you are finished — and the answer to all three is different for a
 * first product than for a twentieth.
 *
 * So this exists alongside it rather than replacing it. Five steps, each asking
 * for one kind of thing, with the card the customer will see built up beside
 * them. The full editor is one click away at every step and is where anyone
 * ends up afterwards.
 *
 * The product is created as a draft at the end of step one, because images,
 * variants and everything else need something to belong to. That is also what
 * makes the flow safe to abandon: close the tab at step three and a draft is
 * waiting, not nothing.
 */

type StepId = 'basics' | 'images' | 'price' | 'shipping' | 'review';

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'basics', label: 'Name and description', hint: 'What it is called and what it is' },
  { id: 'images', label: 'Photographs', hint: 'What the customer sees first' },
  { id: 'price', label: 'Price and stock', hint: 'What it costs and how many there are' },
  { id: 'shipping', label: 'Size and weight', hint: 'What the courier charges on' },
  { id: 'review', label: 'Review and publish', hint: 'Check it, then put it live' },
];

export default function AdminProductNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [step, setStep] = useState<StepId>('basics');
  const [productId, setProductId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    shortDescription: '',
    description: '',
    price: '',
    sku: '',
    stock: '0',
    trackInventory: true,
    categoryId: '',
    weightGrams: '',
    widthInches: '',
    heightInches: '',
    depthMm: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const { data: categories } = useQuery({
    queryKey: ['admin-categories-tree'],
    queryFn: () => api.get<Category[]>('/admin/categories-tree'),
  });

  /* The product as it stands, once it exists. Drives the preview and the images step. */
  const { data: product } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => api.get<Product>(`/admin/products/${productId}`),
    enabled: Boolean(productId),
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });

  /*
   * Everything is sent as it is filled in, rather than held until the end.
   *
   * Half an hour of typing lost to a closed tab is the worst thing a form like
   * this can do, and the draft is useful on its own: somebody can stop at the
   * photographs and come back tomorrow.
   */
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!productId) {
        const created = await api.post<Product>('/admin/products', {
          ...payload,
          slug: slugify(form.name),
          status: 'DRAFT',
        });
        setProductId(created.id);
        return created;
      }
      return api.patch<Product>(`/admin/products/${productId}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      await refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors ?? {});
        push(err.message, 'error');
      } else {
        push('Could not save', 'error');
      }
    },
  });

  const publish = useMutation({
    mutationFn: () => api.patch<Product>(`/admin/products/${productId}/status`, { status: 'PUBLISHED' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      push('Product published', 'success');
      navigate(`/admin/products/${productId}`);
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not publish', 'error'),
  });

  const number = (value: string) => (value.trim() === '' ? null : Number(value));

  /** What this step sends, and whether it may be left. */
  const commit = async (): Promise<boolean> => {
    if (step === 'basics') {
      if (form.name.trim().length < 2) {
        setErrors({ name: 'Give the product a name' });
        return false;
      }
      await save.mutateAsync({
        name: form.name.trim(),
        shortDescription: form.shortDescription.trim() || null,
        description: form.description.trim() || null,
      });
      return !save.isError;
    }

    if (step === 'price') {
      await save.mutateAsync({
        price: number(form.price),
        sku: form.sku.trim() || null,
        stock: number(form.stock) ?? 0,
        trackInventory: form.trackInventory,
      });
      return true;
    }

    if (step === 'shipping') {
      await save.mutateAsync({
        categoryId: form.categoryId || null,
        weightGrams: number(form.weightGrams),
        widthInches: number(form.widthInches),
        heightInches: number(form.heightInches),
        depthMm: number(form.depthMm),
      });
      return true;
    }

    // Images save themselves as they are added.
    return true;
  };

  const goNext = async () => {
    if (!(await commit())) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  };

  const uploadImages = async (files: FileList) => {
    if (!productId) return;
    setUploading(true);
    try {
      const body = new FormData();
      Array.from(files).forEach((file) => body.append('images', file));
      body.append('folder', 'products');
      await api.upload(`/admin/products/${productId}/images`, body);
      await refresh();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const linkImages = async (assets: MediaAsset[]) => {
    setLibraryOpen(false);
    if (!productId || !assets.length) return;
    try {
      // Sequential: the endpoint derives each image's position from how many
      // are already there, so parallel requests would scramble the order.
      for (const asset of assets) {
        await api.post(`/admin/products/${productId}/images/link`, {
          url: asset.url,
          alt: asset.alt ?? '',
        });
      }
      await refresh();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not add images', 'error');
    }
  };

  const removeImage = async (imageId: string) => {
    try {
      await api.delete(`/admin/products/${productId}/images/${imageId}`);
      await refresh();
    } catch {
      push('Could not remove that image', 'error');
    }
  };

  const images: ProductImage[] = product?.images ?? [];

  /*
   * What still stands between this and the shop.
   *
   * A price is the server's rule, not ours: publishing without one is refused.
   * The others are warnings — a product with no photograph can go live, it just
   * should not, and saying so here is kinder than letting somebody find out
   * from the shop page.
   */
  const blockers = [
    !form.price.trim() && { level: 'stop' as const, text: 'A price is needed before this can be published.' },
    !images.length && { level: 'warn' as const, text: 'No photographs yet. The card will show an empty frame.' },
    !form.shortDescription.trim() && { level: 'warn' as const, text: 'No short description. It is what appears under the name on the shop page.' },
    !form.weightGrams.trim() && { level: 'warn' as const, text: 'No weight. The courier will be given an estimate and may re-weigh and re-bill.' },
  ].filter(Boolean) as { level: 'stop' | 'warn'; text: string }[];

  const canPublish = Boolean(productId) && !blockers.some((b) => b.level === 'stop');

  const categoryOptions = [
    { value: '', label: 'Uncategorised' },
    ...(categories ?? []).flatMap((parent) => [
      { value: parent.id, label: parent.name },
      ...(parent.children ?? []).map((child) => ({ value: child.id, label: `— ${child.name}` })),
    ]),
  ];

  return (
    <>
      <AdminPageHeader
        title="Add a product"
        description="Five steps. Everything is saved as you go, so you can stop and come back."
        actions={
          productId ? (
            <Link to={`/admin/products/${productId}`} className="a-btn a-btn-secondary text-xs">
              Open the full editor
            </Link>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Where you are */}
        <AdminCard className="h-fit">
          <ol className="space-y-1">
            {STEPS.map((s, index) => {
              const done = index < stepIndex;
              const current = s.id === step;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    // Only backwards. Skipping ahead would land somebody on a
                    // step whose product does not exist yet.
                    disabled={index > stepIndex}
                    onClick={() => setStep(s.id)}
                    className={clsx(
                      'flex w-full items-start gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors',
                      current && 'bg-paper-off',
                      index > stepIndex && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                      )}
                      style={{
                        background: done || current ? 'var(--brand-soft)' : 'var(--a-sunken)',
                        color: done || current ? 'var(--brand-strong)' : 'var(--a-faint)',
                      }}
                    >
                      {done ? <CheckIcon size={13} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx('block text-sm', current && 'font-medium')}>{s.label}</span>
                      <span className="block text-2xs leading-snug text-ink-400">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </AdminCard>

        {/* The question being asked */}
        <div className="space-y-6">
          {step === 'basics' ? (
            <AdminCard
              title="What is it called?"
              description="The name is what customers search for and what appears on the card. Everything else here is optional for now."
            >
              <div className="space-y-5">
                <Input
                  label="Product name"
                  placeholder="Minimal acrylic name plate"
                  value={form.name}
                  error={errors.name}
                  onChange={(e) => set('name', e.target.value)}
                />
                <Textarea
                  label="Short description"
                  rows={2}
                  placeholder="One sentence. Shown under the name on the shop page."
                  value={form.shortDescription}
                  onChange={(e) => set('shortDescription', e.target.value)}
                />
                <Textarea
                  label="Full description"
                  rows={7}
                  placeholder="What it is made of, what it suits, how it is finished."
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
            </AdminCard>
          ) : null}

          {step === 'images' ? (
            <AdminCard
              title="Photographs"
              description="The first image is the one on the product card. Square images keep the shop grid even."
            >
              {images.length ? (
                <div className="mb-5 grid grid-cols-3 gap-3">
                  {images.map((image, index) => (
                    <figure key={image.id} className="group relative border border-stone-line">
                      <img
                        src={assetUrl(image.url)}
                        alt={image.alt ?? ''}
                        className="aspect-square w-full object-cover"
                      />
                      {index === 0 ? (
                        <Badge tone="dark" className="absolute left-2 top-2">Card image</Badge>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => { if (image.id) void removeImage(image.id); }}
                        className="absolute right-2 top-2 bg-paper/90 p-1 text-ink-500 opacity-0 transition-opacity hover:text-state-danger group-hover:opacity-100"
                        aria-label="Remove image"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </figure>
                  ))}
                </div>
              ) : null}

              <div className="space-y-2.5">
                <MultiImageUpload onUpload={(files) => void uploadImages(files)} uploading={uploading} />
                <Button type="button" variant="secondary" fullWidth onClick={() => setLibraryOpen(true)}>
                  Choose from media library
                </Button>
              </div>

              <MediaPicker
                multiple
                open={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                onPick={(assets) => void linkImages(assets)}
              />
            </AdminCard>
          ) : null}

          {step === 'price' ? (
            <AdminCard
              title="Price and stock"
              description="The price is the only thing that must be set before this can go live."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Price (₹)"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1499"
                  value={form.price}
                  error={errors.price}
                  onChange={(e) => set('price', e.target.value)}
                />
                <Input
                  label="SKU"
                  placeholder="BW-HOME-NP-001"
                  hint="Your own code for it. Used by the courier and the CSV export."
                  value={form.sku}
                  onChange={(e) => set('sku', e.target.value)}
                />
              </div>

              <div className="mt-5 space-y-4">
                <Checkbox
                  label="Track stock for this product"
                  hint="Turn this off for made-to-order pieces that never run out."
                  checked={form.trackInventory}
                  onChange={(v) => set('trackInventory', v)}
                />
                {form.trackInventory ? (
                  <Input
                    label="Stock"
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={(e) => set('stock', e.target.value)}
                  />
                ) : null}
              </div>
            </AdminCard>
          ) : null}

          {step === 'shipping' ? (
            <AdminCard
              title="Size and weight"
              description="Shiprocket charges on the weight and size you declare. Leave these blank and the site sends an estimate — the courier then re-weighs the parcel and bills the difference."
            >
              <div className="space-y-5">
                <Select
                  label="Category"
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  options={categoryOptions}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Weight (g)"
                    type="number" min="0" step="1" placeholder="450"
                    hint="The packed weight, box included."
                    value={form.weightGrams}
                    onChange={(e) => set('weightGrams', e.target.value)}
                  />
                  <Input
                    label="Thickness (mm)"
                    type="number" min="0" step="1" placeholder="5"
                    value={form.depthMm}
                    onChange={(e) => set('depthMm', e.target.value)}
                  />
                  <Input
                    label="Width (in)"
                    type="number" min="0" step="0.5" placeholder="12"
                    value={form.widthInches}
                    onChange={(e) => set('widthInches', e.target.value)}
                  />
                  <Input
                    label="Height (in)"
                    type="number" min="0" step="0.5" placeholder="6"
                    value={form.heightInches}
                    onChange={(e) => set('heightInches', e.target.value)}
                  />
                </div>
              </div>
            </AdminCard>
          ) : null}

          {step === 'review' ? (
            <AdminCard
              title="Ready?"
              description="This is what a customer will see. Publishing puts it in the shop immediately."
            >
              {blockers.length ? (
                <ul className="mb-6 space-y-2.5">
                  {blockers.map((b) => (
                    <li key={b.text} className="flex items-start gap-2.5 text-sm">
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          b.level === 'stop' ? 'bg-state-danger' : 'bg-state-warning',
                        )}
                      />
                      <span className={b.level === 'stop' ? 'text-ink' : 'text-ink-500'}>{b.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-6 flex items-center gap-2 text-sm text-state-success">
                  <CheckIcon size={16} />
                  Nothing missing.
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!canPublish}
                  loading={publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  Publish
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    push('Saved as a draft', 'success');
                    navigate(`/admin/products/${productId}`);
                  }}
                >
                  Keep as draft
                </Button>
              </div>

              {!canPublish ? (
                <p className="mt-3 text-2xs text-ink-400">
                  Go back to <button type="button" className="underline" onClick={() => setStep('price')}>Price and stock</button> to set a price.
                </p>
              ) : null}
            </AdminCard>
          ) : null}

          {/* Moving between steps */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={stepIndex === 0}
              onClick={() => setStep(STEPS[stepIndex - 1].id)}
            >
              Back
            </Button>

            {step === 'review' ? null : (
              <Button loading={save.isPending} onClick={() => void goNext()}>
                {step === 'basics' && !productId ? 'Save and continue' : 'Continue'}
              </Button>
            )}
          </div>
        </div>

        {/* The card being built */}
        <div className="hidden lg:block">
          <AdminCard title="On the shop page" className="sticky top-6">
            {product ? (
              <div className="pointer-events-none">
                <ProductCard
                  hideWishlist
                  product={{
                    ...product,
                    name: form.name || product.name,
                    shortDescription: form.shortDescription || product.shortDescription,
                    price: form.price === '' ? product.price : (Number(form.price) as never),
                  }}
                />
              </div>
            ) : (
              /*
               * Before the draft exists there is nothing honest to show, and a
               * fake card would only teach somebody to expect the wrong thing.
               */
              <div className="flex aspect-[3/4] items-center justify-center border border-dashed border-stone-mute px-6 text-center">
                <p className="text-2xs leading-relaxed text-ink-400">
                  The card appears here once the product has a name.
                </p>
              </div>
            )}
            {product ? (
              <p className="mt-4 text-2xs leading-relaxed text-ink-400">
                Not interactive here. The cart and wishlist work on the real shop page.
              </p>
            ) : null}
          </AdminCard>
        </div>
      </div>
    </>
  );
}

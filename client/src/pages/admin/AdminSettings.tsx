import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import type { BusinessHour, CheckoutConfig, SettingsMap } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader, ImageField, StringListEditor } from '../../components/admin/AdminKit';
import {
  AlertIcon, Badge, Button, Checkbox, Input, PageLoader, Select, Textarea, TrashIcon,
} from '../../components/ui';

type Group =
  | 'brand' | 'contact' | 'hours' | 'social' | 'footer'
  | 'announcement' | 'payment' | 'shipping' | 'tax' | 'seo' | 'store';

const GROUPS: { id: Group; label: string; description: string }[] = [
  { id: 'brand', label: 'Brand & logo', description: 'Your logo, name and tagline.' },
  { id: 'contact', label: 'Contact', description: 'Phone, email and studio address.' },
  { id: 'hours', label: 'Business hours', description: 'Shown in the footer and used for local SEO.' },
  { id: 'social', label: 'Social links', description: 'Only the ones you fill in appear on the site.' },
  { id: 'announcement', label: 'Announcement bar', description: 'The strip above the header.' },
  { id: 'payment', label: 'Payments', description: 'Razorpay and cash on delivery.' },
  { id: 'shipping', label: 'Shipping & tax', description: 'Rates, free shipping and GST handling.' },
  { id: 'store', label: 'Store behaviour', description: 'Wishlist, reviews, checkout and budget filters.' },
  { id: 'footer', label: 'Footer', description: 'Footer text and copyright.' },
  { id: 'seo', label: 'SEO defaults', description: 'Titles, descriptions and the canonical site URL.' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  // ?group=seo lets the dashboard link straight to a tab.
  const [params, setParams] = useSearchParams();
  const requested = params.get('group') as Group | null;
  const [group, setGroupState] = useState<Group>(
    requested && GROUPS.some((g) => g.id === requested) ? requested : 'brand',
  );
  const setGroup = (next: Group) => {
    setGroupState(next);
    const p = new URLSearchParams(params);
    p.set('group', next);
    setParams(p, { replace: true });
  };
  const [values, setValues] = useState<SettingsMap>({});
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<{ values: SettingsMap; groups: string[] }>('/admin/settings'),
  });

  const { data: paymentConfig } = useQuery({
    queryKey: ['checkout-config'],
    queryFn: () => api.get<CheckoutConfig>('/checkout/config'),
  });

  useEffect(() => {
    if (data?.values) setValues(data.values);
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/admin/settings', { values }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['checkout-config'] });
      setDirty(false);
      push('Settings saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save settings', 'error'),
  });

  const set = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const str = (key: string) => String(values[key] ?? '');
  const bool = (key: string) => Boolean(values[key]);
  const num = (key: string) => (values[key] === null || values[key] === undefined ? '' : String(values[key]));

  if (isLoading) return <PageLoader label="Loading settings" />;

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Everything about how the site presents your business."
        actions={
          <Button size="sm" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Group nav */}
        <nav className="lg:col-span-3">
          <ul className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:px-0">
            {GROUPS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setGroup(item.id)}
                  className={clsx(
                    'w-full whitespace-nowrap border-b-2 px-4 py-2.5 text-left text-xs transition-colors lg:border-b-0 lg:border-l-2',
                    group === item.id
                      ? 'border-ink bg-paper font-medium text-ink'
                      : 'border-transparent text-ink-500 hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-6 lg:col-span-9">
          {/* ---- Brand ---- */}
          {group === 'brand' ? (
            <AdminCard title="Brand & logo" description="Until you upload artwork, the site uses the text logo below.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Input label="Business name" value={str('brand.name')} onChange={(e) => set('brand.name', e.target.value)} />
                <Input
                  label="Text logo" value={str('brand.logoText')}
                  hint="Shown when no logo image is uploaded."
                  onChange={(e) => set('brand.logoText', e.target.value)}
                />
                <Input
                  label="Logo tagline" value={str('brand.logoTagline')}
                  onChange={(e) => set('brand.logoTagline', e.target.value)}
                />
                <div />
                <ImageField
                  label="Logo (for light backgrounds)"
                  value={values['brand.logoImage'] as string | null}
                  folder="logo"
                  hint="Upload the black logo here. It replaces the text mark everywhere."
                  onChange={(url) => set('brand.logoImage', url)}
                />
                <ImageField
                  label="Logo (for dark backgrounds)"
                  value={values['brand.logoImageDark'] as string | null}
                  folder="logo"
                  hint="The white version, used on dark panels."
                  onChange={(url) => set('brand.logoImageDark', url)}
                />
                <ImageField
                  label="Favicon"
                  value={values['brand.favicon'] as string | null}
                  folder="logo"
                  onChange={(url) => set('brand.favicon', url)}
                />
              </div>
            </AdminCard>
          ) : null}

          {/* ---- Contact ---- */}
          {group === 'contact' ? (
            <AdminCard title="Contact details" description="Used in the footer, the contact page and your local business schema.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Input label="Phone" value={str('contact.phone')} onChange={(e) => set('contact.phone', e.target.value)} />
                <Input label="WhatsApp number" value={str('contact.whatsapp')} onChange={(e) => set('contact.whatsapp', e.target.value)} />
                <Input label="Email" type="email" value={str('contact.email')} onChange={(e) => set('contact.email', e.target.value)} />
                <div />
                <div className="sm:col-span-2">
                  <StringListEditor
                    label="Address lines"
                    values={(values['contact.addressLines'] as string[] | undefined) ?? []}
                    onChange={(v) => set('contact.addressLines', v)}
                    placeholder="Add a line and press Enter"
                  />
                </div>
                <Input label="City" value={str('contact.city')} onChange={(e) => set('contact.city', e.target.value)} />
                <Input label="State" value={str('contact.state')} onChange={(e) => set('contact.state', e.target.value)} />
                <Input label="Postal code" value={str('contact.postalCode')} onChange={(e) => set('contact.postalCode', e.target.value)} />
                <Input label="Country" value={str('contact.country')} onChange={(e) => set('contact.country', e.target.value)} />
                <Textarea
                  label="Google Maps embed URL" value={str('contact.mapEmbedUrl')} rows={2}
                  wrapClassName="sm:col-span-2"
                  hint="In Google Maps: Share → Embed a map → copy the src URL from the iframe."
                  onChange={(e) => set('contact.mapEmbedUrl', e.target.value)}
                />
              </div>
            </AdminCard>
          ) : null}

          {/* ---- Hours ---- */}
          {group === 'hours' ? (
            <AdminCard title="Business hours">
              <Input
                label="Summary line" value={str('hours.summary')}
                hint="A short version, e.g. Monday–Saturday, 10 AM – 8 PM."
                wrapClassName="mb-6"
                onChange={(e) => set('hours.summary', e.target.value)}
              />

              <div className="space-y-2">
                {DAYS.map((day) => {
                  const schedule = (values['hours.schedule'] as BusinessHour[] | undefined) ?? [];
                  const entry = schedule.find((s) => s.day === day) ?? {
                    day, open: '10:00', close: '20:00', closed: false,
                  };

                  const updateDay = (patch: Partial<BusinessHour>) => {
                    const next = DAYS.map((d) => {
                      const existing = schedule.find((s) => s.day === d) ?? {
                        day: d, open: '10:00', close: '20:00', closed: false,
                      };
                      return d === day ? { ...existing, ...patch } : existing;
                    });
                    set('hours.schedule', next);
                  };

                  return (
                    <div key={day} className="grid items-center gap-3 border border-stone-line px-4 py-2.5 sm:grid-cols-[130px_1fr_1fr_auto]">
                      <span className="text-sm">{day}</span>
                      <input
                        type="time"
                        value={entry.open ?? ''}
                        disabled={entry.closed}
                        className="field py-1.5 disabled:opacity-40"
                        onChange={(e) => updateDay({ open: e.target.value })}
                        aria-label={`${day} opening time`}
                      />
                      <input
                        type="time"
                        value={entry.close ?? ''}
                        disabled={entry.closed}
                        className="field py-1.5 disabled:opacity-40"
                        onChange={(e) => updateDay({ close: e.target.value })}
                        aria-label={`${day} closing time`}
                      />
                      <Checkbox
                        label="Closed"
                        checked={entry.closed}
                        onChange={(closed) => updateDay({ closed })}
                      />
                    </div>
                  );
                })}
              </div>
            </AdminCard>
          ) : null}

          {/* ---- Social ---- */}
          {group === 'social' ? (
            <AdminCard title="Social links" description="Leave a field blank to hide that link.">
              <div className="grid gap-5 sm:grid-cols-2">
                {['instagram', 'facebook', 'linkedin', 'youtube', 'pinterest'].map((network) => (
                  <Input
                    key={network}
                    label={network.charAt(0).toUpperCase() + network.slice(1)}
                    value={str(`social.${network}`)}
                    placeholder="https://"
                    onChange={(e) => set(`social.${network}`, e.target.value || null)}
                  />
                ))}
              </div>
            </AdminCard>
          ) : null}

          {/* ---- Announcement ---- */}
          {group === 'announcement' ? (
            <AdminCard title="Announcement bar">
              <Checkbox
                label="Show the announcement bar"
                checked={bool('announcement.enabled')}
                onChange={(v) => set('announcement.enabled', v)}
              />
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Input
                  label="Text" value={str('announcement.text')} wrapClassName="sm:col-span-2"
                  onChange={(e) => set('announcement.text', e.target.value)}
                />
                <Input
                  label="Link (optional)" value={str('announcement.link')} placeholder="/shop"
                  onChange={(e) => set('announcement.link', e.target.value || null)}
                />
              </div>
            </AdminCard>
          ) : null}

          {/* ---- Payments ---- */}
          {group === 'payment' ? (
            <>
              <AdminCard title="Razorpay" description="UPI, cards, net banking and wallets.">
                <div className="mb-5 flex flex-wrap items-center gap-3 border border-stone-line bg-paper-off p-4">
                  <span className="text-xs text-ink-500">Server keys:</span>
                  {paymentConfig?.razorpay.configured ? (
                    <Badge tone="success">Configured</Badge>
                  ) : (
                    <Badge tone="danger">Not configured</Badge>
                  )}
                  <span className="text-2xs text-ink-400">
                    Keys live in the server <code className="font-mono">.env</code> file
                    (<code className="font-mono">RAZORPAY_KEY_ID</code> and{' '}
                    <code className="font-mono">RAZORPAY_KEY_SECRET</code>). They are never editable here,
                    and the secret key is never sent to the browser.
                  </span>
                </div>

                <Checkbox
                  label="Accept online payments"
                  hint={
                    paymentConfig?.razorpay.configured
                      ? 'Customers can pay by UPI, card, net banking or wallet.'
                      : 'Add your Razorpay keys to the server .env file first.'
                  }
                  checked={bool('payment.razorpayEnabled')}
                  onChange={(v) => set('payment.razorpayEnabled', v)}
                />
              </AdminCard>

              <AdminCard title="Cash on delivery">
                <Checkbox
                  label="Offer cash on delivery"
                  checked={bool('payment.codEnabled')}
                  onChange={(v) => set('payment.codEnabled', v)}
                />
                <div className={clsx('mt-5 grid gap-5 sm:grid-cols-2', !bool('payment.codEnabled') && 'opacity-50')}>
                  <Input
                    type="number" label="Handling fee (₹)" value={num('payment.codFee')}
                    disabled={!bool('payment.codEnabled')}
                    onChange={(e) => set('payment.codFee', Number(e.target.value) || 0)}
                  />
                  <Input
                    type="number" label="Minimum order (₹)" value={num('payment.codMinOrder')}
                    disabled={!bool('payment.codEnabled')}
                    onChange={(e) => set('payment.codMinOrder', Number(e.target.value) || 0)}
                  />
                  <Input
                    type="number" label="Maximum order (₹)" value={num('payment.codMaxOrder')}
                    hint="0 means no limit."
                    disabled={!bool('payment.codEnabled')}
                    onChange={(e) => set('payment.codMaxOrder', Number(e.target.value) || 0)}
                  />
                  <Input
                    label="Note shown at checkout" value={str('payment.codNote')}
                    disabled={!bool('payment.codEnabled')}
                    onChange={(e) => set('payment.codNote', e.target.value)}
                  />
                </div>

                {!bool('payment.razorpayEnabled') && !bool('payment.codEnabled') ? (
                  <p className="mt-5 flex items-start gap-2 border border-state-warning/40 bg-[#F8F3E6] p-3 text-xs text-state-warning">
                    <AlertIcon size={15} className="mt-0.5 shrink-0" />
                    Both payment methods are off, so customers cannot complete an order.
                  </p>
                ) : null}
              </AdminCard>
            </>
          ) : null}

          {/* ---- Shipping & tax ---- */}
          {group === 'shipping' ? (
            <>
              <AdminCard title="Shipping">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    type="number" label="Flat rate (₹)" value={num('shipping.flatRate')}
                    hint="0 means shipping is free."
                    onChange={(e) => set('shipping.flatRate', Number(e.target.value) || 0)}
                  />
                  <Input
                    type="number" label="Free shipping above (₹)" value={num('shipping.freeAbove')}
                    hint="0 disables the threshold."
                    onChange={(e) => set('shipping.freeAbove', Number(e.target.value) || 0)}
                  />
                  <Textarea
                    label="Note shown at checkout" value={str('shipping.note')} rows={2}
                    wrapClassName="sm:col-span-2"
                    onChange={(e) => set('shipping.note', e.target.value)}
                  />
                </div>
              </AdminCard>

              <AdminCard title="Tax">
                <Checkbox
                  label="Product prices already include GST"
                  hint="When off, GST is added at checkout using each product's rate."
                  checked={bool('tax.pricesIncludeTax')}
                  onChange={(v) => set('tax.pricesIncludeTax', v)}
                />
                <Input
                  label="Your GSTIN" value={str('tax.gstin')} wrapClassName="mt-5 max-w-sm"
                  onChange={(e) => set('tax.gstin', e.target.value)}
                />
              </AdminCard>
            </>
          ) : null}

          {/* ---- Store ---- */}
          {group === 'store' ? (
            <>
              <AdminCard title="Store behaviour">
                <div className="space-y-4">
                  <Checkbox label="Enable the wishlist" checked={bool('store.enableWishlist')} onChange={(v) => set('store.enableWishlist', v)} />
                  <Checkbox
                    label="Show product reviews"
                    hint="Only reviews you have published in Admin → Reviews are shown."
                    checked={bool('store.enableReviews')}
                    onChange={(v) => set('store.enableReviews', v)}
                  />
                  <Checkbox
                    label="Enable checkout"
                    hint="Turn off to browse-only mode, e.g. while you set prices."
                    checked={bool('store.enableCheckout')}
                    onChange={(v) => set('store.enableCheckout', v)}
                  />
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <Input
                    label='Label for products without a price'
                    value={str('store.priceOnRequestLabel')}
                    onChange={(e) => set('store.priceOnRequestLabel', e.target.value)}
                  />
                  <Textarea
                    label="Custom order page intro" value={str('store.customOrderIntro')} rows={2}
                    onChange={(e) => set('store.customOrderIntro', e.target.value)}
                  />
                </div>
              </AdminCard>

              <AdminCard title="Budget filter bands" description="The price brackets shown in the shop filters.">
                <BudgetBands
                  bands={(values['store.budgetBands'] as { slug: string; label: string; min: number | null; max: number | null }[] | undefined) ?? []}
                  onChange={(bands) => set('store.budgetBands', bands)}
                />
              </AdminCard>
            </>
          ) : null}

          {/* ---- Footer ---- */}
          {group === 'footer' ? (
            <AdminCard title="Footer">
              <div className="space-y-5">
                <Textarea
                  label="About text" value={str('footer.about')} rows={3}
                  hint="A short paragraph under the logo. Leave blank to hide it."
                  onChange={(e) => set('footer.about', e.target.value)}
                />
                <Input
                  label="Copyright line" value={str('footer.copyright')}
                  hint="{year} is replaced with the current year."
                  onChange={(e) => set('footer.copyright', e.target.value)}
                />
              </div>
            </AdminCard>
          ) : null}

          {/* ---- SEO ---- */}
          {group === 'seo' ? (
            <AdminCard title="SEO defaults" description="Used wherever a page does not set its own.">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label="Canonical site URL" value={str('seo.siteUrl')}
                    hint="Used for canonical tags, the sitemap and share links. Include https://"
                    onChange={(e) => set('seo.siteUrl', e.target.value)}
                  />
                  {!values['seo.domainConfirmed'] ? (
                    <div className="mt-3 border border-state-warning/40 bg-[#F8F3E6] p-4">
                      <p className="text-xs font-medium text-ink">This domain has not been confirmed</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                        It was taken from the business email address, not supplied by you. Every
                        canonical tag, sitemap entry and share link is built from it, so check it is
                        the address the live site will use before launch.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={Boolean(values['seo.domainConfirmed'])}
                          onChange={(e) => set('seo.domainConfirmed', e.target.checked)}
                          className="h-4 w-4 shrink-0 cursor-pointer appearance-none border border-ink-300 bg-paper checked:border-ink checked:bg-ink"
                        />
                        <span className="text-xs text-ink-700">
                          This is the correct live domain
                        </span>
                      </label>
                    </div>
                  ) : null}
                </div>
                <Input
                  label="Default page title" value={str('seo.defaultTitle')} wrapClassName="sm:col-span-2"
                  onChange={(e) => set('seo.defaultTitle', e.target.value)}
                />
                <Input
                  label="Title template" value={str('seo.titleTemplate')}
                  hint="{page} is replaced with the page name."
                  wrapClassName="sm:col-span-2"
                  onChange={(e) => set('seo.titleTemplate', e.target.value)}
                />
                <Textarea
                  label="Default meta description" value={str('seo.defaultDescription')} rows={3}
                  wrapClassName="sm:col-span-2"
                  onChange={(e) => set('seo.defaultDescription', e.target.value)}
                />
                <Input
                  label="Default keywords" value={str('seo.defaultKeywords')} wrapClassName="sm:col-span-2"
                  onChange={(e) => set('seo.defaultKeywords', e.target.value)}
                />
                <ImageField
                  label="Default social share image"
                  value={values['seo.defaultOgImage'] as string | null}
                  folder="general"
                  hint="1200 × 630 works best."
                  onChange={(url) => set('seo.defaultOgImage', url)}
                />
                <div className="space-y-5">
                  <Input
                    label="Google site verification" value={str('seo.googleSiteVerification')}
                    onChange={(e) => set('seo.googleSiteVerification', e.target.value)}
                  />
                  <Select
                    label="Search engine indexing" value={str('seo.robots')}
                    onChange={(e) => set('seo.robots', e.target.value)}
                    options={[
                      { value: 'index, follow', label: 'Allow indexing (live site)' },
                      { value: 'noindex, nofollow', label: 'Block indexing (staging)' },
                    ]}
                  />
                </div>
              </div>

              <SearchPreview
                siteUrl={str('seo.siteUrl')}
                title={str('seo.defaultTitle')}
                template={str('seo.titleTemplate')}
                description={str('seo.defaultDescription')}
              />

              <div className="mt-6 border-t border-stone-line pt-5 text-xs leading-relaxed text-ink-500">
                <p className="mb-2 font-medium text-ink">Generated automatically</p>
                <p>
                  <code className="font-mono">/sitemap.xml</code> and{' '}
                  <code className="font-mono">/robots.txt</code> are produced live from your published
                  categories, products and pages. Product, breadcrumb, FAQ and LocalBusiness schema are
                  emitted on the matching pages.
                </p>
              </div>
            </AdminCard>
          ) : null}

          {/* Sticky save */}
          {dirty ? (
            <div className="sticky bottom-4 flex items-center justify-between gap-4 border border-ink bg-ink px-5 py-3 text-paper shadow-lift">
              <span className="text-xs">You have unsaved changes.</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setValues(data?.values ?? {}); setDirty(false); }}
                  className="text-2xs uppercase tracking-architect text-paper/70 hover:text-paper"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="border border-paper bg-paper px-4 py-2 text-2xs uppercase tracking-architect text-ink transition-colors hover:bg-transparent hover:text-paper disabled:opacity-60"
                >
                  {save.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * How a page is likely to appear in search results, with the limits Google
 * actually truncates at. The homepage uses the default title as-is; every
 * other page goes through the template, so both are shown.
 */
function SearchPreview({
  siteUrl, title, template, description,
}: {
  siteUrl: string;
  title: string;
  template: string;
  description: string;
}) {
  const host = (() => {
    try { return new URL(siteUrl).host; } catch { return siteUrl.replace(/^https?:\/\//, ''); }
  })();

  const innerTitle = template.includes('{page}')
    ? template.replace('{page}', 'Nameplates')
    : title;

  const rows: { label: string; path: string; text: string }[] = [
    { label: 'Homepage', path: '', text: title },
    { label: 'A category page', path: '/shop/nameplates', text: innerTitle },
  ];

  return (
    <div className="mt-6 border-t border-stone-line pt-5">
      <p className="mb-1 text-xs font-medium text-ink">Search result preview</p>
      <p className="mb-4 text-xs text-ink-400">
        Google rewrites titles when it wants to — treat this as a guide, not a guarantee.
      </p>

      <div className="space-y-5">
        {rows.map((row) => (
          <div key={row.label} className="border border-stone-line bg-paper-off p-4">
            <p className="mb-2 text-[0.6rem] uppercase tracking-architect text-ink-400">{row.label}</p>
            <p className="font-mono text-xs text-ink-500">
              {host || 'your-domain.com'}
              <span className="text-ink-300">
                {row.path ? ` › ${row.path.replace(/^\//, '').replace(/\//g, ' › ')}` : ''}
              </span>
            </p>
            <p className="mt-1 text-base leading-snug text-[#1a0dab]">
              {row.text || 'No title set'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {description || 'No description set — search engines will pick their own text.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-[0.6rem] uppercase tracking-architect">
              <LengthHint label="Title" length={row.text.length} max={60} />
              <LengthHint label="Description" length={description.length} max={160} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LengthHint({ label, length, max }: { label: string; length: number; max: number }) {
  const over = length > max;
  return (
    <span className={over ? 'text-state-warning' : 'text-ink-400'}>
      {label} {length}/{max}
      {over ? ' — likely truncated' : ''}
    </span>
  );
}

function BudgetBands({
  bands, onChange,
}: {
  bands: { slug: string; label: string; min: number | null; max: number | null }[];
  onChange: (bands: { slug: string; label: string; min: number | null; max: number | null }[]) => void;
}) {
  const update = (index: number, patch: Partial<(typeof bands)[number]>) => {
    const next = [...bands];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {bands.map((band, index) => (
        <div key={band.slug || index} className="grid items-end gap-3 border border-stone-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input
            label="Label" value={band.label}
            onChange={(e) =>
              update(index, {
                label: e.target.value,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
              })
            }
          />
          <Input
            type="number" label="Min (₹)" value={band.min ?? ''}
            onChange={(e) => update(index, { min: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <Input
            type="number" label="Max (₹)" value={band.max ?? ''}
            onChange={(e) => update(index, { max: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <button
            type="button"
            onClick={() => onChange(bands.filter((_, i) => i !== index))}
            className="mb-2 px-2 text-ink-400 hover:text-state-danger"
            aria-label="Remove band"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      ))}

      <Button
        type="button" size="sm" variant="ghost"
        onClick={() => onChange([...bands, { slug: '', label: '', min: null, max: null }])}
      >
        + Add band
      </Button>
    </div>
  );
}

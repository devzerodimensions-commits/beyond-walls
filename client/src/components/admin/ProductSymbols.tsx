import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import type { PersonalizationField } from '../../lib/types';
import type { PlateSymbol } from '../../lib/plateSymbols';
import { Button, Spinner, UploadIcon } from '../ui';

/**
 * Choosing which symbols this plate offers, on the product itself.
 *
 * The symbols live in one shared library, because the same Om is wanted on
 * every plate that has a symbol and nobody should upload it again per product
 * -- that is exactly what made the old per-product options unusable. But
 * needing the symbol HERE and having to go to Settings to add it is two
 * places for one job, so the library is managed from here as well: upload a
 * symbol while setting a product up and it is added for every plate at once,
 * already ticked on this one.
 *
 * Three things are set here, and nothing else:
 *   - which symbols this plate offers (all of them, or a chosen few)
 *   - which one the plate starts on
 *   - a new symbol, uploaded into the library
 */
export function ProductSymbols({
  productId, fields, hasSymbolBox,
}: {
  productId: string;
  fields: PersonalizationField[];
  /** Whether the plate has a place for a symbol — a box read or drawn on it. */
  hasSymbolBox: boolean;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  /** The symbol being renamed or removed; only one at a time. */
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const field = fields.find((f) => f.previewSlot === 'logo') ?? null;
  const library = useQuery({
    queryKey: ['admin-symbols'],
    queryFn: () => api.get<PlateSymbol[]>('/admin/symbols'),
  });
  const symbols = library.data ?? [];

  /** No list of its own means every symbol in the library, now and later. */
  const chosen = (field?.options ?? []).map((o) => o.value);
  const offersAll = chosen.length === 0;
  const offered = offersAll ? symbols.map((s) => s.url) : chosen;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
    void queryClient.invalidateQueries({ queryKey: ['site-settings'] });
  };
  const fail = (error: unknown) =>
    push(error instanceof ApiError ? error.message : 'That did not work — try again.', 'error');

  const saveField = useMutation({
    mutationFn: (patch: { options?: { label: string; value: string }[]; defaultValue?: string | null }) =>
      field
        ? api.patch(`/admin/products/${productId}/personalization/${field.id}`, patch)
        : api.post(`/admin/products/${productId}/personalization`, {
          key: 'symbol',
          label: 'Symbol',
          type: 'RADIO',
          helpText: 'Choose the symbol for your plate — or none.',
          required: false,
          previewSlot: 'logo',
          status: 'PUBLISHED',
          options: [],
          ...patch,
        }),
    onSuccess: refresh,
    onError: fail,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (name.trim()) form.append('label', name.trim());
      form.append('tint', 'true');
      return api.upload<PlateSymbol[]>('/admin/symbols', form);
    },
    onSuccess: async (list) => {
      queryClient.setQueryData(['admin-symbols'], list);
      setName('');
      /*
       * A plate offering a chosen few would not show the new symbol, which is
       * never what somebody uploading it from this page meant. It is added to
       * this plate's list as well.
       */
      if (field && !offersAll) {
        const added = list[list.length - 1];
        if (added) {
          await saveField.mutateAsync({
            options: [...(field.options ?? []).map((o) => ({ label: o.label, value: o.value })), { label: added.label, value: added.url }],
          });
        }
      }
      await refresh();
      push('Symbol added — it is offered on every plate with a symbol.', 'success');
    },
    onError: fail,
    onSettled: () => { if (fileRef.current) fileRef.current.value = ''; },
  });

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.patch<PlateSymbol[]>(`/admin/symbols/${id}`, { label }),
    onSuccess: async (list) => {
      queryClient.setQueryData(['admin-symbols'], list);
      /*
       * A plate offering a chosen few names each one in its own list, so a
       * rename has to reach that list too -- otherwise the customer still
       * sees the old name on this product while every other plate shows the
       * new one.
       */
      if (field && !offersAll) {
        const options = (field.options ?? [])
          .map((o) => ({ value: o.value, label: list.find((sym) => sym.url === o.value)?.label ?? o.label }));
        await saveField.mutateAsync({ options });
      }
      setEditing(null);
      await refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<PlateSymbol[]>(`/admin/symbols/${id}`),
    onSuccess: async (list, id) => {
      queryClient.setQueryData(['admin-symbols'], list);
      const gone = symbols.find((sym) => sym.id === id);
      /*
       * The plate must not be left pointing at a symbol that no longer
       * exists: it would draw nothing where the symbol was, and the question
       * would offer a choice the shop cannot serve.
       */
      if (gone && field) {
        const patch: { options?: { label: string; value: string }[]; defaultValue?: string | null } = {};
        if (!offersAll) patch.options = (field.options ?? []).filter((o) => o.value !== gone.url).map((o) => ({ label: o.label, value: o.value }));
        if (field.defaultValue === gone.url) patch.defaultValue = list[0]?.url ?? null;
        if (Object.keys(patch).length) await saveField.mutateAsync(patch);
      }
      setRemoving(null);
      await refresh();
      push('Symbol removed from every plate.', 'success');
    },
    onError: fail,
  });

  const toggle = (symbol: PlateSymbol) => {
    const next = offered.includes(symbol.url)
      ? offered.filter((url) => url !== symbol.url)
      : [...offered, symbol.url];
    // Everything ticked is "all of them", so a symbol added later is offered too.
    const options = next.length === symbols.length
      ? []
      : symbols.filter((s) => next.includes(s.url)).map((s) => ({ label: s.label, value: s.url }));
    saveField.mutate({ options });
  };

  if (!hasSymbolBox && !field) {
    return (
      <div className="mt-4 border-t border-stone-line pt-3">
        <p className="text-2xs leading-relaxed text-ink-400">
          This plate has no place for a symbol yet. To add one, use “Set it up by hand” above: box the
          symbol on the plate and mark it as a symbol.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-stone-line pt-3">
      <p className="text-2xs uppercase tracking-architect text-ink">Symbols customers can choose</p>
      <p className="mb-2 mt-1 text-2xs leading-relaxed text-ink-400">
        Shared across every plate that has a symbol, so a symbol added here is offered on all of them —
        and on products you add later.
      </p>

      {symbols.length ? (
        <div className="flex flex-wrap gap-2">
          {symbols.map((symbol) => {
            const on = offered.includes(symbol.url);
            const starts = field?.defaultValue === symbol.url;
            return (
              <div key={symbol.id} className="w-20">
                <button
                  type="button"
                  aria-pressed={on}
                  title={on ? `${symbol.label} — offered` : `${symbol.label} — not offered`}
                  onClick={() => toggle(symbol)}
                  className={clsx(
                    'flex h-16 w-20 items-center justify-center border bg-paper-off p-1.5 transition-colors',
                    on ? 'border-ink' : 'border-stone-line opacity-40 hover:opacity-70',
                  )}
                >
                  <img src={assetUrl(symbol.url)} alt={symbol.label} className="max-h-full max-w-full object-contain" />
                </button>
                {editing === symbol.id ? (
                  <input
                    autoFocus
                    defaultValue={symbol.label}
                    aria-label={`Name of ${symbol.label}`}
                    className="field mt-1 w-full px-1 py-0.5 text-center text-2xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== symbol.label) rename.mutate({ id: symbol.id, label: next });
                      else setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(symbol.id)}
                    title="Rename"
                    className="mt-1 block w-full truncate text-center text-2xs text-ink-500 hover:text-ink hover:underline"
                  >
                    {symbol.label}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!on}
                  onClick={() => saveField.mutate({ defaultValue: starts ? null : symbol.url })}
                  className={clsx(
                    'mt-0.5 block w-full text-center text-2xs underline underline-offset-2',
                    starts ? 'text-ink' : 'text-ink-300 hover:text-ink',
                    !on && 'invisible',
                  )}
                >
                  {starts ? 'starts on this' : 'start on this'}
                </button>
                {removing === symbol.id ? (
                  <div className="mt-0.5 text-center text-2xs leading-tight">
                    <button
                      type="button"
                      className="text-red-700 underline underline-offset-2"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(symbol.id)}
                    >
                      delete?
                    </button>
                    {' '}
                    <button type="button" className="text-ink-400 underline underline-offset-2" onClick={() => setRemoving(null)}>
                      keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    title="Remove from every plate"
                    className="mt-0.5 block w-full text-center text-2xs text-ink-300 underline underline-offset-2 hover:text-red-700"
                    onClick={() => setRemoving(symbol.id)}
                  >
                    remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : library.isLoading ? null : (
        <p className="text-2xs text-ink-400">No symbols yet — upload the first one below.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="field min-w-0 flex-1 py-1.5 text-xs"
          value={name}
          placeholder="Name it — e.g. Om, Swastik"
          aria-label="Name of the symbol being uploaded"
          onChange={(e) => setName(e.target.value)}
        />
        <label
          className={clsx(
            'inline-flex cursor-pointer items-center gap-2 bg-ink px-3.5 py-2 text-2xs font-medium uppercase',
            'tracking-architect text-paper transition-opacity hover:opacity-90',
            upload.isPending && 'pointer-events-none opacity-60',
          )}
        >
          {upload.isPending ? <Spinner size={13} /> : <UploadIcon size={13} />}
          {upload.isPending ? 'Uploading…' : 'Upload a symbol'}
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
      </div>
      <p className="mt-1 text-2xs leading-relaxed text-ink-400">
        The symbol on a plain background, or a transparent PNG. The background is removed for you.
        {symbols.length ? ' Click a symbol to offer it on this plate or take it off; click its name to rename it.' : ''}
      </p>

      {!field ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          loading={saveField.isPending}
          onClick={() => saveField.mutate({})}
        >
          Let customers choose the symbol
        </Button>
      ) : null}
    </div>
  );
}

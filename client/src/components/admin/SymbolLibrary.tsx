import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, assetUrl } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import type { PlateSymbol } from '../../lib/plateSymbols';
import { AdminCard } from './AdminKit';

/**
 * The symbols customers can choose for a plate.
 *
 * Upload a symbol once -- Om, Swastik, Ganesha, a cross, a khanda -- and every
 * plate that has a symbol offers it, including plates added later. A black
 * symbol on a plain background, or a transparent PNG, works best. A symbol
 * taken off a plate's own photograph lands here too.
 */
export function SymbolLibrary() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [tint, setTint] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);

  const symbols = useQuery({
    queryKey: ['admin-symbols'],
    queryFn: () => api.get<PlateSymbol[]>('/admin/symbols'),
  });

  const settle = (list: PlateSymbol[]) => {
    queryClient.setQueryData(['admin-symbols'], list);
    void queryClient.invalidateQueries({ queryKey: ['site-settings'] });
  };
  const fail = (error: unknown) =>
    push(error instanceof ApiError ? error.message : 'That did not work — try again.', 'error');

  const add = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (label.trim()) form.append('label', label.trim());
      form.append('tint', String(tint));
      return api.upload<PlateSymbol[]>('/admin/symbols', form);
    },
    onSuccess: (list) => {
      settle(list);
      setLabel('');
      push('Symbol added. Every plate with a symbol now offers it.', 'success');
    },
    onError: fail,
    onSettled: () => { if (fileRef.current) fileRef.current.value = ''; },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string; tint?: boolean } }) =>
      api.patch<PlateSymbol[]>(`/admin/symbols/${id}`, patch),
    onSuccess: settle,
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<PlateSymbol[]>(`/admin/symbols/${id}`),
    onSuccess: (list) => { settle(list); push('Symbol removed.', 'success'); },
    onError: fail,
  });

  const list = symbols.data ?? [];

  return (
    <AdminCard
      title="Symbols"
      description="Om, Swastik, Ganesha and any other symbol a customer may want on their plate. Upload each once; every plate with a symbol offers them."
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className="field-label">Name</span>
            <input
              className="field mt-1 w-full"
              value={label}
              placeholder="e.g. Om — read from the file name if left empty"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="inline-flex cursor-pointer items-center justify-center bg-ink px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-paper hover:bg-ink-700">
            {add.isPending ? 'Uploading…' : 'Upload symbol'}
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              className="sr-only"
              disabled={add.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) add.mutate(file);
              }}
            />
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs text-ink-600">
          <input type="checkbox" className="mt-0.5" checked={tint} onChange={(e) => setTint(e.target.checked)} />
          <span>
            Cut in the lettering colour — the usual case. Untick for a symbol printed in its own colours.
          </span>
        </label>
        <p className="text-2xs leading-relaxed text-ink-400">
          PNG, JPG or WebP: the symbol on a plain background, or a transparent PNG. The background is
          removed and the symbol trimmed, so it fills its place on the plate.
        </p>

        {list.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((symbol) => (
              <li key={symbol.id} className="border border-stone-line p-3">
                {/* Shown on a light and a dark plate, the way it will be cut. */}
                <div className="grid grid-cols-2 gap-1">
                  {['#D9D7D2', '#111111'].map((ground) => (
                    <div key={ground} className="flex h-20 items-center justify-center p-2" style={{ backgroundColor: ground }}>
                      {symbol.tint ? (
                        <span
                          className="block h-full w-full"
                          style={{
                            backgroundColor: ground === '#111111' ? '#F5F5F3' : '#111111',
                            WebkitMaskImage: `url("${assetUrl(symbol.url)}")`,
                            maskImage: `url("${assetUrl(symbol.url)}")`,
                            WebkitMaskRepeat: 'no-repeat',
                            maskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'center',
                            maskPosition: 'center',
                            WebkitMaskSize: 'contain',
                            maskSize: 'contain',
                          }}
                        />
                      ) : (
                        <img src={assetUrl(symbol.colour)} alt="" className="max-h-full max-w-full object-contain" />
                      )}
                    </div>
                  ))}
                </div>
                <input
                  className="field mt-2 w-full text-xs"
                  defaultValue={symbol.label}
                  aria-label="Symbol name"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== symbol.label) update.mutate({ id: symbol.id, patch: { label: next } });
                  }}
                />
                <label className="mt-2 flex items-center gap-2 text-2xs text-ink-500">
                  <input
                    type="checkbox"
                    checked={symbol.tint}
                    onChange={(e) => update.mutate({ id: symbol.id, patch: { tint: e.target.checked } })}
                  />
                  In the lettering colour
                </label>
                {confirming === symbol.id ? (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-red-700 underline underline-offset-2"
                      disabled={remove.isPending}
                      onClick={() => { remove.mutate(symbol.id); setConfirming(null); }}
                    >
                      Yes, remove
                    </button>
                    <button type="button" className="underline underline-offset-2" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-2 text-xs text-red-700 underline underline-offset-2"
                    onClick={() => setConfirming(symbol.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : symbols.isLoading ? null : (
          <p className="border border-dashed border-stone-line p-4 text-xs text-ink-400">
            No symbols yet. Upload an Om, a Swastik or a Ganesha to offer them on your plates — or mark
            a plate’s own symbol when you set its preview up from a photo.
          </p>
        )}
      </div>
    </AdminCard>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import type { ChoiceSwatches, ProductVariant } from '../../lib/types';
import { AdminCard } from './AdminKit';
import { Button, CloseIcon, ConfirmDialog, PlusIcon } from '../ui';

/**
 * The colours, sizes and finishes one product is sold in.
 *
 * Each combination of choices is a variant, and the editor used to ask for
 * them one at a time: a name to invent, a price, a stock figure, and a
 * free-text list of "extra details" nobody could guess the use of. Three
 * sizes in two colours is six of those, typed by hand, each one a chance to
 * name it differently from the last -- which is why a shopkeeper looking for
 * where to add a colour could not find it.
 *
 * So the choices are set out instead of the combinations: a row per thing the
 * customer picks ("Size", then its sizes), and the combinations are worked out
 * from them. A price is only typed where it differs from the product's own.
 */

interface Choice {
  /** What the customer is choosing: Size, Colour, Finish. */
  name: string;
  values: string[];
}

interface Combination {
  id?: string;
  /** One value per choice, in the choices' own order. */
  values: string[];
  price: number | null;
  stock: number;
  sku: string | null;
}

/** "Size" and "size" are the same choice; this is what two spellings are matched on. */
const key = (name: string) => name.trim().toLowerCase();

/** Whether this choice is about colour, and so worth showing as a swatch. */
export const isColourChoice = (name: string) => /colou?r|shade|finish/.test(key(name));

/** A starting colour for a value, so the picker does not open on black for every one. */
const GUESSES: [RegExp, string][] = [
  [/silver|steel|chrome|grey|gray/, '#C9CCD1'],
  [/gold/, '#C8A961'],
  [/black|matt/, '#111111'],
  [/white|ivory|cream/, '#F5F3EF'],
  [/copper|bronze|rose/, '#B87333'],
  [/wood|teak|oak|brown/, '#8B5A2B'],
  [/green|forest/, '#1F3B2E'],
  [/blue|navy/, '#1F3A5F'],
  [/red|maroon/, '#8C1C2B'],
];
function guessHex(value: string): string {
  const found = GUESSES.find(([pattern]) => pattern.test(value.toLowerCase()));
  return found ? found[1] : '#C9CCD1';
}

/**
 * What to type next, in the words of the choice being filled in.
 *
 * The box suggested a size whatever the choice was called, so somebody who
 * had just written "colour" was being shown "Add 12 x 6 in" and had to guess
 * whether a colour meant its name or a paint code. It is the name the
 * customer reads on the button, so the example says one.
 */
function exampleFor(name: string): string {
  const what = name.trim().toLowerCase();
  if (!what) return 'Add a choice, then Enter';
  if (/colou?r|shade|finish/.test(what)) return 'Add Silver, then Enter';
  if (/size|dimension/.test(what)) return 'Add 12 x 6 in, then Enter';
  if (/material|metal/.test(what)) return 'Add Acrylic, then Enter';
  if (/mount|fix/.test(what)) return 'Add Wall mounted, then Enter';
  return `Add a ${what}, then Enter`;
}

/** The label a customer sees: "12 x 6 in · Black". */
export function combinationLabel(values: string[]): string {
  return values.filter(Boolean).join(' · ');
}

/** Every combination of the choices' values, in order. */
function expand(choices: Choice[]): string[][] {
  return choices.reduce<string[][]>(
    (rows, choice) => rows.flatMap((row) => choice.values.map((value) => [...row, value])),
    [[]],
  );
}

/** The choices a product's existing variants describe, in the order they first appear. */
function choicesOf(variants: ProductVariant[]): Choice[] {
  const found: Choice[] = [];
  for (const variant of variants) {
    for (const [name, value] of Object.entries((variant.options ?? {}) as Record<string, string>)) {
      if (!value) continue;
      const existing = found.find((c) => key(c.name) === key(name));
      if (!existing) found.push({ name, values: [value] });
      else if (!existing.values.includes(value)) existing.values.push(value);
    }
  }
  return found;
}

export function ProductChoices({
  productId, variants, productPrice, countsStock, savedSwatches,
}: {
  productId: string;
  variants: ProductVariant[];
  /** Shown as the price a combination falls back to. */
  productPrice: number | null;
  countsStock: boolean;
  /** The colours already saved for this product's choice values. */
  savedSwatches?: ChoiceSwatches | null;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const saved = useMemo(() => choicesOf(variants), [variants]);
  const [choices, setChoices] = useState<Choice[]>(saved);
  const [prices, setPrices] = useState<Record<string, { price: number | null; stock: number; sku: string | null; id?: string }>>({});
  const [confirming, setConfirming] = useState<Combination[] | null>(null);
  /** The colour each value is, kept as the studio sets it: { Colour: { Silver: '#C9CCD1' } }. */
  const [swatches, setSwatches] = useState<ChoiceSwatches>(savedSwatches ?? {});

  /*
   * What is already saved, held against the combinations about to be written,
   * so a price and a stock figure survive adding a colour -- and a variant
   * keeps its id, and with it its place in anyone's cart.
   */
  useEffect(() => {
    const byValues: Record<string, { price: number | null; stock: number; sku: string | null; id?: string }> = {};
    for (const variant of variants) {
      const options = (variant.options ?? {}) as Record<string, string>;
      const values = saved.map((c) => options[c.name] ?? Object.entries(options).find(([n]) => key(n) === key(c.name))?.[1] ?? '');
      byValues[combinationLabel(values) || variant.label] = {
        id: variant.id,
        price: variant.price === null || variant.price === undefined ? null : Number(variant.price),
        stock: variant.stock ?? 0,
        sku: variant.sku ?? null,
      };
    }
    setPrices(byValues);
    setChoices(saved);
    setSwatches(savedSwatches ?? {});
  }, [variants, saved, savedSwatches]);

  const rows: Combination[] = useMemo(() => {
    const usable = choices.filter((c) => c.name.trim() && c.values.length);
    if (!usable.length) return [];
    return expand(usable).map((values) => {
      const held = prices[combinationLabel(values)];
      return {
        id: held?.id,
        values,
        price: held?.price ?? null,
        stock: held?.stock ?? 0,
        sku: held?.sku ?? null,
      };
    });
  }, [choices, prices]);

  const save = useMutation({
    mutationFn: (combinations: Combination[]) => {
      const usable = choices.filter((c) => c.name.trim() && c.values.length);
      /* Only the colours still offered; a value removed takes its swatch with it. */
      const keptSwatches: ChoiceSwatches = {};
      for (const choice of usable) {
        if (!isColourChoice(choice.name)) continue;
        const forChoice: Record<string, string> = {};
        for (const value of choice.values) {
          const hex = swatches[choice.name.trim()]?.[value];
          if (hex) forChoice[value] = hex;
        }
        if (Object.keys(forChoice).length) keptSwatches[choice.name.trim()] = forChoice;
      }
      return api.post<ProductVariant[]>(`/admin/products/${productId}/variants/bulk`, {
        swatches: keptSwatches,
        variants: combinations.map((row) => ({
          id: row.id,
          label: combinationLabel(row.values),
          price: row.price,
          stock: row.stock,
          sku: row.sku,
          options: Object.fromEntries(usable.map((choice, i) => [choice.name.trim(), row.values[i]])),
        })),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      setConfirming(null);
      push('Choices saved — customers pick from these.', 'success');
    },
    onError: (error) => {
      setConfirming(null);
      push(error instanceof ApiError ? error.message : 'Those choices could not be saved', 'error');
    },
  });

  const setRow = (label: string, patch: Partial<{ price: number | null; stock: number; sku: string | null }>) =>
    setPrices((current) => ({
      ...current,
      [label]: { ...(current[label] ?? { price: null, stock: 0, sku: null }), ...patch },
    }));

  const setChoice = (index: number, patch: Partial<Choice>) =>
    setChoices((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  /** Combinations that exist today and would go if this were saved. */
  const losing = variants.filter((v) => !rows.some((row) => row.id === v.id));
  /** Made by hand, belonging to no choice: see the warning on the card below. */
  const loose = variants.filter((v) => !Object.keys((v.options ?? {}) as Record<string, string>).length);
  const submit = () => (losing.length ? setConfirming(rows) : save.mutate(rows));

  return (
    <AdminCard
      title="Colours, sizes and other choices"
      description="One row per thing the customer picks. Every combination becomes something they can buy."
    >
      <div className="space-y-5">
        {choices.map((choice, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="border border-stone-line p-4">
            <div className="flex items-center gap-2">
              <input
                className="field flex-1"
                value={choice.name}
                placeholder="Name it first — Size, Colour or Finish"
                aria-label={`Name of choice ${index + 1}`}
                onChange={(e) => setChoice(index, { name: e.target.value })}
              />
              <button
                type="button"
                className="p-1.5 text-ink-400 hover:text-state-danger"
                aria-label={`Remove the ${choice.name || 'unnamed'} choice`}
                onClick={() => setChoices((current) => current.filter((_, i) => i !== index))}
              >
                <CloseIcon size={15} />
              </button>
            </div>

            {isColourChoice(choice.name) ? (
              <p className="mt-2 text-2xs leading-relaxed text-ink-400">
                Type each colour&apos;s name below and press Enter — “Silver”, “Golden”. Each one gets a
                square beside it: click that to set its exact shade, which is what customers see on
                the product page.
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {choice.values.map((value, vi) => (
                <span
                  // eslint-disable-next-line react/no-array-index-key
                  key={vi}
                  className="inline-flex items-center gap-1.5 border border-stone-line bg-paper-off px-2.5 py-1 text-xs"
                >
                  {/*
                    * The colour this value actually is.
                    *
                    * "Silver" and "Golden" are two words to a customer until
                    * one of them is silver, so a colour choice carries the
                    * colour itself and the product page shows it.
                    */}
                  {isColourChoice(choice.name) ? (
                    <input
                      type="color"
                      aria-label={`Colour of ${value}`}
                      title={`Colour of ${value}`}
                      value={swatches[choice.name.trim()]?.[value] ?? guessHex(value)}
                      className="h-6 w-6 cursor-pointer rounded-sm border border-stone-line bg-paper p-0 hover:border-ink"
                      onChange={(e) => setSwatches((current) => ({
                        ...current,
                        [choice.name.trim()]: { ...(current[choice.name.trim()] ?? {}), [value]: e.target.value },
                      }))}
                    />
                  ) : null}
                  {value}
                  <button
                    type="button"
                    aria-label={`Remove ${value}`}
                    className="text-ink-400 hover:text-state-danger"
                    onClick={() => setChoice(index, { values: choice.values.filter((_, i) => i !== vi) })}
                  >
                    <CloseIcon size={12} />
                  </button>
                </span>
              ))}
              <input
                className="field w-56 py-1 text-xs"
                placeholder={exampleFor(choice.name)}
                aria-label={`Add a value to ${choice.name || 'this choice'}`}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const value = e.currentTarget.value.trim();
                  if (!value || choice.values.includes(value)) return;
                  setChoice(index, { values: [...choice.values, value] });
                  e.currentTarget.value = '';
                }}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (!value || choice.values.includes(value)) return;
                  setChoice(index, { values: [...choice.values, value] });
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<PlusIcon size={14} />}
          onClick={() => setChoices((current) => [...current, { name: '', values: [] }])}
        >
          {choices.length ? 'Add another choice' : 'Add a choice — size, colour, finish'}
        </Button>

        {rows.length ? (
          <div>
            <p className="field-label">What customers can buy</p>
            <p className="mb-2 mt-1 text-2xs leading-relaxed text-ink-400">
              {rows.length} combination{rows.length === 1 ? '' : 's'}. Leave a price empty to use the
              product&apos;s own{productPrice === null ? '' : ` (₹${productPrice})`}.
              {countsStock ? '' : ' Stock is not counted on this product, so every combination is made to order.'}
            </p>
            <div className="overflow-x-auto border border-stone-line">
              <table className="w-full text-xs">
                <thead className="bg-paper-off text-left text-2xs uppercase tracking-architect text-ink-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Combination</th>
                    <th className="w-28 px-3 py-2 font-medium">Price (₹)</th>
                    {countsStock ? <th className="w-24 px-3 py-2 font-medium">In stock</th> : null}
                    <th className="w-32 px-3 py-2 font-medium">Your code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-line">
                  {rows.map((row) => {
                    const label = combinationLabel(row.values);
                    return (
                      <tr key={label}>
                        <td className="px-3 py-2">
                          {label}
                          {row.id ? null : <span className="ml-2 text-2xs text-state-info">new</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            className="field w-full py-1 text-xs"
                            value={row.price ?? ''}
                            placeholder={productPrice === null ? 'same' : String(productPrice)}
                            aria-label={`Price for ${label}`}
                            onChange={(e) => setRow(label, { price: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        </td>
                        {countsStock ? (
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              className="field w-full py-1 text-xs"
                              value={row.stock}
                              aria-label={`Stock for ${label}`}
                              onChange={(e) => setRow(label, { stock: Number(e.target.value) || 0 })}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-1.5">
                          <input
                            className="field w-full py-1 text-xs"
                            value={row.sku ?? ''}
                            aria-label={`Your code for ${label}`}
                            onChange={(e) => setRow(label, { sku: e.target.value || null })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" loading={save.isPending} onClick={submit}>
                Save choices
              </Button>
              {losing.length ? (
                <span className="text-2xs text-state-warning">
                  {losing.length} existing combination{losing.length === 1 ? '' : 's'} would be removed.
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-stone-line p-4 text-xs leading-relaxed text-ink-400">
            <p>
              No choices yet, so this product is sold as one thing. Add “Size” with its sizes, or
              “Colour” with its colours, and customers pick on the product page.
            </p>
            {loose.length ? (
              <p className="mt-2 text-state-warning">
                {loose.map((v) => `“${v.label}”`).join(', ')} {loose.length === 1 ? 'is' : 'are'} listed
                below as {loose.length === 1 ? 'a thing' : 'things'} to buy, not as a choice. Adding the
                choices here replaces {loose.length === 1 ? 'it' : 'them'}.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Remove combinations no longer offered?"
        message={`${losing.map((v) => `“${v.label}”`).join(', ')} will be removed. Orders already placed keep their own copy.`}
        loading={save.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && save.mutate(confirming)}
      />
    </AdminCard>
  );
}

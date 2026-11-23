import { useMemo } from 'react';
import clsx from 'clsx';
import { formatPrice, toNumber } from '../../lib/format';
import type { ProductVariant } from '../../lib/types';

/**
 * Choosing a size and a colour, rather than reading a list of every pairing.
 *
 * Every combination a product is sold in is one variant, so a plate in three
 * sizes and two colours is six of them. Listed flat, the customer reads
 * "12 x 6 in · Black", "12 x 6 in · White", "15 x 7 in · Black" ... and has
 * to work out for themselves which part is the size and which the colour.
 * Set out as the choices they actually make -- a row of sizes, a row of
 * colours -- six buttons become five, and each one says what it is.
 *
 * The rows come from the variants themselves, so nothing has to be configured
 * twice: a product whose variants carry no choices falls back to the plain
 * list, which is what a product with one row of sizes had all along.
 */

export interface ChoiceRow {
  name: string;
  values: string[];
}

const key = (name: string) => name.trim().toLowerCase();
const optionsOf = (variant: ProductVariant) => (variant.options ?? {}) as Record<string, string>;

/** The value a variant has for a choice, whatever case the name was saved in. */
export function valueOf(variant: ProductVariant, name: string): string {
  const options = optionsOf(variant);
  const found = Object.entries(options).find(([n]) => key(n) === key(name));
  return found ? found[1] : '';
}

/**
 * The choices these variants describe, in the order they first appear.
 *
 * Only choices every sellable variant answers are offered: a half-filled one
 * cannot be picked from without leaving the customer on a combination that
 * does not exist.
 */
export function choiceRows(variants: ProductVariant[]): ChoiceRow[] {
  if (variants.length < 2) return [];
  const rows: ChoiceRow[] = [];
  for (const variant of variants) {
    for (const [name, value] of Object.entries(optionsOf(variant))) {
      if (!value) continue;
      const row = rows.find((r) => key(r.name) === key(name));
      if (!row) rows.push({ name, values: [value] });
      else if (!row.values.includes(value)) row.values.push(value);
    }
  }
  const complete = rows.filter((row) => variants.every((v) => valueOf(v, row.name)));
  // One row whose every variant has its own value adds nothing over the labels.
  if (!complete.length) return [];
  const combinations = complete.reduce((n, row) => n * row.values.length, 1);
  return combinations >= variants.length ? complete : [];
}

/** The variant matching one value from each row, or null when that pairing is not sold. */
export function variantFor(variants: ProductVariant[], rows: ChoiceRow[], picked: Record<string, string>) {
  return variants.find((v) => rows.every((row) => valueOf(v, row.name) === picked[row.name])) ?? null;
}

export function VariantChoices({
  variants, rows, picked, basePrice, trackInventory, onPick, startStep = 1,
}: {
  variants: ProductVariant[];
  rows: ChoiceRow[];
  /** The value chosen in each row, by the row's name. */
  picked: Record<string, string>;
  /** What the product costs without a variant price; null when it has none. */
  basePrice: number | null;
  trackInventory: boolean;
  onPick: (name: string, value: string) => void;
  /** Numbers the rows in with the rest of the buying steps. */
  startStep?: number;
}) {
  /*
   * What each value would cost, and whether it can be had at all.
   *
   * A colour is shown struck through when every size it comes in is out of
   * stock, and the price beside a value is what picking it would cost given
   * everything else chosen -- so a customer sees the price move as they
   * choose, rather than only at the end.
   */
  const detail = useMemo(() => {
    const out: Record<string, Record<string, { price: number | null; sold: boolean }>> = {};
    for (const row of rows) {
      out[row.name] = {};
      for (const value of row.values) {
        const matches = variants.filter((v) => valueOf(v, row.name) === value
          && rows.every((other) => other.name === row.name || !picked[other.name] || valueOf(v, other.name) === picked[other.name]));
        const inStock = matches.filter((v) => !trackInventory || v.stock > 0);
        const exact = inStock.find((v) => rows.every((other) => other.name === row.name || valueOf(v, other.name) === picked[other.name]));
        const price = exact?.price ?? null;
        out[row.name][value] = {
          price: price === null || price === undefined ? null : toNumber(price),
          sold: inStock.length > 0,
        };
      }
    }
    return out;
  }, [variants, rows, picked, trackInventory]);

  return (
    <>
      {rows.map((row, index) => (
        <div key={row.name} className="mb-6">
          <p className="field-label flex items-center" id={`choice-${index}`}>
            <span
              className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[0.6rem] text-paper"
              aria-hidden="true"
            >
              {startStep + index}
            </span>
            Choose a {row.name.toLowerCase()}
          </p>
          <div role="radiogroup" aria-labelledby={`choice-${index}`} className="flex flex-wrap gap-2">
            {row.values.map((value) => {
              const info = detail[row.name]?.[value];
              const selected = picked[row.name] === value;
              const disabled = !info?.sold;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={disabled || undefined}
                  disabled={disabled}
                  onClick={() => onPick(row.name, value)}
                  className={clsx(
                    'border px-4 py-2.5 text-xs transition-colors duration-200',
                    selected ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink',
                    disabled && 'cursor-not-allowed line-through opacity-40',
                  )}
                >
                  {value}
                  {selected && info?.price !== null && info?.price !== undefined && info.price !== basePrice ? (
                    <span className="ml-2 opacity-70">{formatPrice(info.price)}</span>
                  ) : null}
                  {disabled ? <span className="sr-only"> — not available</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

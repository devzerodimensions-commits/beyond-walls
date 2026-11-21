/**
 * The shop's symbol library -- Ganesha, Om, Swastik and whatever else the
 * studio uploads -- as it arrives with the settings.
 *
 * Each symbol is stored twice: as a shape (black, with its coverage as
 * transparency) that the preview fills with the plate's lettering colour, and
 * as supplied, for a symbol that keeps colours of its own. Customers choose by
 * the shape's address, which is what goes on the order.
 */
export interface PlateSymbol {
  id: string;
  label: string;
  url: string;
  colour: string;
  tint: boolean;
}

/** Read defensively: it comes from a free-form setting. */
export function parsePlateSymbols(raw: unknown): PlateSymbol[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is PlateSymbol => !!s && typeof s.url === 'string' && typeof s.label === 'string' && !!s.url,
  );
}

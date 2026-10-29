/**
 * Translating a courier's vocabulary into ours.
 *
 * Kept apart from shiprocket.service.ts, which needs credentials and the
 * network. This file needs neither: give it a label, it gives back a status.
 * That makes it the one part of the integration that can be checked exhaustively
 * without an account, and it is also the part most likely to need a new line
 * when a courier invents another way to say "in transit".
 */

/**
 * Shiprocket reports dozens of statuses across every courier it carries. Ours
 * are the handful a customer cares about, so most of theirs map onto nothing
 * and are ignored rather than forced into a status that would send a
 * misleading email.
 *
 * Matched on the words rather than the numeric id: the labels are stable and
 * readable, the ids are neither documented exhaustively nor consistent between
 * couriers.
 *
 * Order matters. The first match wins, so the specific sit above the general.
 */
const STATUS_MAP: { match: RegExp; status: string }[] = [
  /*
   * "Out for pickup" is the courier coming to the studio; "out for delivery"
   * is the courier reaching the customer. One word apart, and telling a
   * customer their parcel is arriving today when it has not yet been collected
   * is the worst mistake this file could make -- so it is caught first, by
   * name, before anything looks for "out for".
   */
  { match: /out for pickup|pickup scheduled/i, status: 'SHIPPED_PICKUP' },

  { match: /^out for delivery/i, status: 'OUT_FOR_DELIVERY' },
  { match: /^delivered/i, status: 'DELIVERED' },

  // A return to origin is the parcel coming back. The order is not fulfilled,
  // and the studio needs to see that rather than a cheerful "delivered".
  { match: /^(rto|returned|return)/i, status: 'CANCELLED' },
  { match: /^cancell?ed/i, status: 'CANCELLED' },

  // Anything else that is moving reads as "shipped" to a customer. Last, so
  // everything above it takes precedence.
  { match: /picked up|in transit|shipped|dispatched|reached/i, status: 'SHIPPED' },
];

/**
 * The order status a tracking event implies, or null when it implies none.
 *
 * Null is a real answer, not a failure: "manifest generated" and "AWB
 * assigned" are housekeeping, and an order should not move -- nor a customer
 * be emailed -- because a label was printed.
 */
export function mapCourierStatus(label: string | undefined | null): string | null {
  const text = String(label ?? '').trim();
  if (!text) return null;

  const matched = STATUS_MAP.find((entry) => entry.match.test(text))?.status ?? null;

  // The pickup rules exist only to stop "out for pickup" being read as a
  // delivery. Having done that, they mean the same thing as shipped.
  return matched === 'SHIPPED_PICKUP' ? 'SHIPPED' : matched;
}

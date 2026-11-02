import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';
import { getAllSettings, boolSetting, type SettingsMap } from './settings.service';

/**
 * The two pieces of paper an order needs: an invoice and a receipt.
 *
 * Rendered as a self-contained printable page rather than generated as a PDF.
 * A PDF would mean a layout engine in the container — a headless browser, or
 * hand-placed text boxes in a drawing library — and the browser already has
 * one. Print to PDF from this page and the result is a PDF; print it to paper
 * and it goes in the box. No dependency, and the person at the packing desk
 * gets a preview before they commit a sheet of paper to it.
 *
 * An invoice itemises what was bought. A receipt confirms what was paid. They
 * share a layout because they describe the same order, and differ in what
 * they emphasise — which is the difference between the two documents in the
 * first place, not a shortcut.
 */

export type DocumentKind = 'invoice' | 'receipt';

const ORDER_INCLUDE = {
  items: true,
  // Newest first: a retried payment leaves more than one row, and the
  // reference worth printing is the one that actually went through.
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.OrderInclude;

/** settings.service exports number and bool readers but not a string one. */
function str(map: SettingsMap, key: string, fallback = ''): string {
  const value = map[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** HTML-escape. Everything below is studio or customer text and goes through here. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: Prisma.Decimal | number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(value);
}

/** The shipping address is JSON; render whichever of the usual parts are present. */
function addressLines(raw: Prisma.JsonValue | null): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const a = raw as Record<string, unknown>;
  const parts = [
    [a.name, a.fullName].find(Boolean),
    [a.line1, a.addressLine1, a.address].find(Boolean),
    [a.line2, a.addressLine2].find(Boolean),
    [a.landmark].find(Boolean),
    [a.city, a.state, a.postalCode ?? a.pincode ?? a.zip].filter(Boolean).join(', '),
    [a.country].find(Boolean),
    [a.phone].find(Boolean),
  ];
  return parts.map((p) => String(p ?? '').trim()).filter(Boolean);
}

export async function renderOrderDocument(orderId: string, kind: DocumentKind): Promise<string> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) throw ApiError.notFound('Order not found');

  const settings = await getAllSettings();
  const studio = {
    name: str(settings, 'brand.siteName', 'Beyond Walls'),
    email: str(settings, 'contact.email'),
    phone: str(settings, 'contact.phone'),
    address: str(settings, 'contact.address'),
    gstin: str(settings, 'tax.gstin'),
  };
  const pricesIncludeTax = boolSetting(settings, 'tax.pricesIncludeTax', true);

  return page(order, kind, studio, pricesIncludeTax);
}

function page(
  order: OrderWithItems,
  kind: DocumentKind,
  studio: { name: string; email: string; phone: string; address: string; gstin: string },
  pricesIncludeTax: boolean,
): string {
  const isReceipt = kind === 'receipt';
  const payment = order.payments[0];
  const paid = order.paymentStatus === 'PAID';
  const title = isReceipt ? 'Receipt' : 'Invoice';

  const rows = order.items.map((item) => {
    /*
     * Personalisation belongs on the invoice, not just in the admin. It is
     * what the piece was made to say, and the packing desk checks the parcel
     * against this line before it is sealed.
     */
    const personalisation = Array.isArray(item.personalization)
      ? (item.personalization as unknown as { label?: string; displayValue?: string; value?: string }[])
        .map((p) => `${esc(p.label ?? '')}: ${esc(p.displayValue ?? p.value ?? '')}`)
        .filter((line) => line.length > 2)
      : [];

    return `
      <tr>
        <td>
          <strong>${esc(item.productName)}</strong>
          ${item.variantLabel ? `<div class="muted">${esc(item.variantLabel)}</div>` : ''}
          ${item.sku ? `<div class="muted">SKU ${esc(item.sku)}</div>` : ''}
          ${personalisation.length ? `<div class="personalisation">${personalisation.join('<br>')}</div>` : ''}
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPrice)}</td>
        <td class="num">${money(item.lineTotal)}</td>
      </tr>`;
  }).join('');

  const totalRow = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="total"' : ''}><th colspan="3">${esc(label)}</th><td class="num">${value}</td></tr>`;

  const discount = Number(order.discountAmount ?? 0);
  const shipping = Number(order.shippingAmount ?? 0);
  const tax = Number(order.taxAmount ?? 0);

  const totals = [
    totalRow('Subtotal', money(order.subtotal)),
    discount > 0
      ? totalRow(order.couponCode ? `Discount (${order.couponCode})` : 'Discount', `− ${money(discount)}`)
      : '',
    totalRow(shipping > 0 ? 'Delivery' : 'Delivery (free)', shipping > 0 ? money(shipping) : '₹0.00'),
    tax > 0 ? totalRow(pricesIncludeTax ? 'GST (included)' : 'GST', money(tax)) : '',
    totalRow(isReceipt ? 'Amount paid' : 'Total', money(order.total), true),
  ].filter(Boolean).join('');

  const shippingTo = addressLines(order.shippingAddress);
  const billingTo = addressLines(order.billingAddress);
  const sameAddress = shippingTo.join('|') === billingTo.join('|');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} ${esc(order.orderNumber)} — ${esc(studio.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    font: 13px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #111; background: #f4f3ef;
  }
  .sheet { max-width: 760px; margin: 0 auto; background: #fff; padding: 40px; }
  header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start;
           border-bottom: 2px solid #111; padding-bottom: 18px; }
  h1 { margin: 0 0 2px; font-size: 22px; letter-spacing: .02em; }
  h2 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #666; }
  .doc { text-align: right; }
  .doc .kind { font-size: 19px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
  .muted { color: #666; font-size: 11.5px; }
  .personalisation { margin-top: 5px; font-size: 11.5px; color: #333;
                     border-left: 2px solid #ddd; padding-left: 8px; }
  .grid { display: flex; gap: 40px; flex-wrap: wrap; margin: 22px 0 26px; }
  .grid section { min-width: 190px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 8px; vertical-align: top; }
  thead th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em;
             color: #666; border-bottom: 1px solid #ccc; }
  tbody td { border-bottom: 1px solid #eee; }
  .num { text-align: right; white-space: nowrap; }
  tfoot th { font-weight: 400; text-align: right; color: #555; border: 0; }
  tfoot .total th, tfoot .total td { font-size: 15px; font-weight: 700; color: #111;
                                     border-top: 2px solid #111; padding-top: 12px; }
  .stamp { display: inline-block; margin-top: 4px; padding: 3px 9px; font-size: 11px;
           font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
  .paid { background: #e7f3ec; color: #1d6b3d; }
  .due  { background: #fdeceb; color: #a32b22; }
  footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #eee;
           font-size: 11.5px; color: #666; }
  .actions { max-width: 760px; margin: 0 auto 14px; text-align: right; }
  .actions button { font: inherit; padding: 8px 16px; border: 1px solid #111;
                    background: #111; color: #fff; cursor: pointer; }
  @media print {
    body { padding: 0; background: #fff; }
    .sheet { padding: 0; max-width: none; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print or save as PDF</button></div>
  <div class="sheet">
    <header>
      <div>
        <h1>${esc(studio.name)}</h1>
        ${studio.address ? `<div class="muted">${esc(studio.address)}</div>` : ''}
        ${studio.phone ? `<div class="muted">${esc(studio.phone)}</div>` : ''}
        ${studio.email ? `<div class="muted">${esc(studio.email)}</div>` : ''}
        ${studio.gstin ? `<div class="muted">GSTIN ${esc(studio.gstin)}</div>` : ''}
      </div>
      <div class="doc">
        <div class="kind">${esc(title)}</div>
        <div class="muted">${esc(order.orderNumber)}</div>
        <div class="muted">${esc(formatDate(order.placedAt))}</div>
        <div class="stamp ${paid ? 'paid' : 'due'}">${paid ? 'Paid' : esc(order.paymentStatus)}</div>
      </div>
    </header>

    <div class="grid">
      <section>
        <h2>Billed to</h2>
        <div>${esc(order.customerName)}</div>
        <div class="muted">${esc(order.customerEmail)}</div>
        <div class="muted">${esc(order.customerPhone)}</div>
        ${order.companyName ? `<div class="muted">${esc(order.companyName)}</div>` : ''}
        ${order.gstin ? `<div class="muted">GSTIN ${esc(order.gstin)}</div>` : ''}
        ${!sameAddress && billingTo.length ? `<div class="muted">${billingTo.map(esc).join('<br>')}</div>` : ''}
      </section>
      <section>
        <h2>Delivering to</h2>
        <div class="muted">${shippingTo.length ? shippingTo.map(esc).join('<br>') : '—'}</div>
      </section>
      <section>
        <h2>${isReceipt ? 'Payment' : 'Order'}</h2>
        <div class="muted">Method: ${esc(order.paymentMethod)}</div>
        <div class="muted">Status: ${esc(order.paymentStatus)}</div>
        ${payment?.razorpayPaymentId ? `<div class="muted">Ref: ${esc(payment.razorpayPaymentId)}</div>` : ''}
        ${payment?.instrument ? `<div class="muted">${esc(payment.instrument)}${payment.cardLast4 ? ` ••${esc(payment.cardLast4)}` : ''}</div>` : ''}
        ${!isReceipt ? `<div class="muted">Order status: ${esc(order.status)}</div>` : ''}
        ${order.trackingNumber ? `<div class="muted">AWB ${esc(order.trackingNumber)}</div>` : ''}
        ${order.courierName ? `<div class="muted">${esc(order.courierName)}</div>` : ''}
      </section>
    </div>

    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>${totals}</tfoot>
    </table>

    ${order.customerNote ? `<footer><strong>Customer note</strong><br>${esc(order.customerNote)}</footer>` : ''}

    <footer>
      ${isReceipt
    ? (paid
      ? 'Payment received with thanks. This receipt confirms the amount above has been paid in full.'
      : 'This order has not been paid in full. Issued for reference only.')
    : (pricesIncludeTax
      ? 'All prices are inclusive of GST where applicable.'
      : 'GST is shown separately above.')}
      ${studio.email ? `<br>Questions about this ${esc(title.toLowerCase())}? Write to ${esc(studio.email)}.` : ''}
    </footer>
  </div>
</body>
</html>`;
}

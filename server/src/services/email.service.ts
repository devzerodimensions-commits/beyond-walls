import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { getAllSettings } from './settings.service';

/**
 * Transactional email.
 *
 * Degrades safely: when SMTP is not configured the message is logged instead of
 * sent, and the caller still succeeds. A checkout must never fail because the
 * mail server is down, so every send is fire-and-forget and errors are swallowed
 * after being logged.
 */

let transporter: Transporter | null = null;
let verified = false;

export const emailConfigured = Boolean(env.smtpHost && env.smtpUser);

function getTransport(): Transporter | null {
  if (!emailConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPassword },
    });
  }
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/** Strips tags for the plain-text alternative. */
function toText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-4])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function sendMail(input: MailInput): Promise<{ sent: boolean; reason?: string }> {
  const transport = getTransport();

  if (!transport) {
    // eslint-disable-next-line no-console
    console.log(`[email:skipped] no SMTP configured — "${input.subject}" to ${input.to}`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    if (!verified) {
      await transport.verify();
      verified = true;
    }
    await transport.sendMail({
      from: env.smtpFrom || `Beyond Walls <${env.smtpUser}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? toText(input.html),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    return { sent: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email:failed]', input.subject, '->', input.to, err instanceof Error ? err.message : err);
    return { sent: false, reason: err instanceof Error ? err.message : 'send failed' };
  }
}

/** Never let an email failure break the request that triggered it. */
export function sendMailAsync(input: MailInput): void {
  void sendMail(input).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Templates — plain, brand-consistent, no invented claims
// ---------------------------------------------------------------------------

async function shell(title: string, body: string): Promise<string> {
  const settings = await getAllSettings();
  const brand = String(settings['brand.name'] ?? 'Beyond Walls');
  const phone = String(settings['contact.phone'] ?? '');
  const mail = String(settings['contact.email'] ?? '');
  const address = (settings['contact.addressLines'] as string[] | undefined) ?? [];

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#FAF9F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E4E1DB;">
        <tr><td style="padding:28px 32px;border-bottom:1px solid #E4E1DB;">
          <div style="font-size:15px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;">${escapeHtml(brand)}</div>
        </td></tr>
        <tr><td style="padding:32px;">${body}</td></tr>
        <tr><td style="padding:22px 32px;border-top:1px solid #E4E1DB;background:#FAF9F7;font-size:12px;color:#6B6B6B;line-height:1.7;">
          ${address.map((l) => escapeHtml(l)).join('<br>')}
          ${phone ? `<br>${escapeHtml(phone)}` : ''}
          ${mail ? ` · <a href="mailto:${escapeHtml(mail)}" style="color:#6B6B6B;">${escapeHtml(mail)}</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const btn = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;">${escapeHtml(label)}</a>`;

const money = (n: number | string) => `₹${Number(n).toLocaleString('en-IN')}`;

interface OrderForEmail {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number | string;
  paymentMethod: string;
  paymentStatus: string;
  items: {
    productName: string;
    variantLabel: string | null;
    quantity: number;
    lineTotal: number | string;
    personalization?: { label: string; value: string; displayValue?: string }[];
  }[];
  shippingAddress: Record<string, unknown>;
}

export async function sendOrderConfirmation(order: OrderForEmail, siteUrl: string): Promise<void> {
  const rows = order.items
    .map((item) => {
      const custom = (item.personalization ?? [])
        .filter((p) => p.value)
        .map((p) => `${escapeHtml(p.label)}: ${escapeHtml(p.displayValue ?? p.value)}`)
        .join('<br>');
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #EDEAE4;font-size:14px;">
          <strong>${escapeHtml(item.productName)}</strong>${item.variantLabel ? `<br><span style="color:#6B6B6B;font-size:12px;">${escapeHtml(item.variantLabel)}</span>` : ''}
          ${custom ? `<div style="margin-top:6px;padding-left:10px;border-left:2px solid #E4E1DB;color:#4A4A4A;font-size:12px;line-height:1.7;">${custom}</div>` : ''}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #EDEAE4;text-align:right;font-size:14px;white-space:nowrap;">
          ${item.quantity} × ${money(item.lineTotal)}
        </td>
      </tr>`;
    })
    .join('');

  const address = order.shippingAddress as Record<string, string>;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:500;">Thank you, ${escapeHtml(order.customerName.split(' ')[0])}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#4A4A4A;line-height:1.7;">
      We have your order <strong>${escapeHtml(order.orderNumber)}</strong>.
      ${order.paymentMethod === 'COD' ? 'You will pay on delivery.' : 'Your payment has been received.'}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      <tr><td style="padding:14px 0;font-size:15px;font-weight:600;">Total</td>
          <td style="padding:14px 0;text-align:right;font-size:15px;font-weight:600;">${money(order.total)}</td></tr>
    </table>
    <div style="margin:28px 0;">${btn(`${siteUrl}/order/${order.orderNumber}?email=${encodeURIComponent(order.customerEmail)}`, 'View your order')}</div>
    <p style="margin:0;font-size:12px;color:#6B6B6B;line-height:1.8;">
      <strong style="color:#111;">Delivering to</strong><br>
      ${escapeHtml(address.fullName ?? '')}<br>
      ${escapeHtml(address.line1 ?? '')}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ''}<br>
      ${escapeHtml(address.city ?? '')}, ${escapeHtml(address.state ?? '')} ${escapeHtml(address.pincode ?? '')}
    </p>`;

  sendMailAsync({
    to: order.customerEmail,
    subject: `Order ${order.orderNumber} confirmed`,
    html: await shell(`Order ${order.orderNumber}`, body),
  });
}

export async function sendOrderStatusUpdate(
  order: { orderNumber: string; customerName: string; customerEmail: string; status: string; trackingNumber?: string | null; courierName?: string | null; trackingUrl?: string | null },
  siteUrl: string,
): Promise<void> {
  const readable: Record<string, string> = {
    CONFIRMED: 'is confirmed',
    IN_PRODUCTION: 'is now in production',
    READY_TO_SHIP: 'is ready to ship',
    SHIPPED: 'has shipped',
    DELIVERED: 'has been delivered',
    CANCELLED: 'has been cancelled',
    REFUNDED: 'has been refunded',
  };
  const phrase = readable[order.status];
  if (!phrase) return; // nothing worth emailing about

  const tracking =
    order.status === 'SHIPPED' && order.trackingNumber
      ? `<p style="margin:0 0 24px;font-size:14px;color:#4A4A4A;">
           ${order.courierName ? `${escapeHtml(order.courierName)} · ` : ''}<strong>${escapeHtml(order.trackingNumber)}</strong>
           ${order.trackingUrl ? `<br><a href="${escapeHtml(order.trackingUrl)}" style="color:#111;">Track your shipment</a>` : ''}
         </p>`
      : '';

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:500;">Your order ${phrase}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#4A4A4A;line-height:1.7;">
      Order <strong>${escapeHtml(order.orderNumber)}</strong>.
    </p>
    ${tracking}
    <div>${btn(`${siteUrl}/order/${order.orderNumber}?email=${encodeURIComponent(order.customerEmail)}`, 'View your order')}</div>`;

  sendMailAsync({
    to: order.customerEmail,
    subject: `Order ${order.orderNumber} — ${order.status.replace(/_/g, ' ').toLowerCase()}`,
    html: await shell('Order update', body),
  });
}

export async function sendPasswordReset(
  user: { name: string; email: string },
  resetUrl: string,
  expiryMinutes: number,
): Promise<void> {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:500;">Reset your password</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#4A4A4A;line-height:1.7;">
      Hello ${escapeHtml(user.name.split(' ')[0])}, use the button below to choose a new password.
      This link works once and expires in ${expiryMinutes} minutes.
    </p>
    <div style="margin-bottom:24px;">${btn(resetUrl, 'Choose a new password')}</div>
    <p style="margin:0;font-size:12px;color:#6B6B6B;line-height:1.7;">
      If you did not ask for this, you can ignore this email — your password will not change.
    </p>`;

  // Awaited, so the caller can honestly report whether it went out.
  await sendMail({
    to: user.email,
    subject: 'Reset your Beyond Walls password',
    html: await shell('Reset your password', body),
  });
}

export async function sendEnquiryNotification(
  enquiry: { type: string; name: string; email: string; phone?: string | null; subject?: string | null; message: string },
  adminEmail: string,
): Promise<void> {
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:500;">New ${escapeHtml(enquiry.type.replace(/_/g, ' ').toLowerCase())}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#6B6B6B;line-height:1.8;">
      <strong style="color:#111;">${escapeHtml(enquiry.name)}</strong><br>
      ${escapeHtml(enquiry.email)}${enquiry.phone ? ` · ${escapeHtml(enquiry.phone)}` : ''}
    </p>
    ${enquiry.subject ? `<p style="margin:0 0 10px;font-size:14px;font-weight:600;">${escapeHtml(enquiry.subject)}</p>` : ''}
    <div style="padding:16px;background:#FAF9F7;border:1px solid #E4E1DB;font-size:14px;line-height:1.7;white-space:pre-line;">${escapeHtml(enquiry.message)}</div>`;

  sendMailAsync({
    to: adminEmail,
    replyTo: enquiry.email,
    subject: `New enquiry from ${enquiry.name}`,
    html: await shell('New enquiry', body),
  });
}

export async function sendEnquiryAcknowledgement(
  enquiry: { name: string; email: string },
): Promise<void> {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:500;">Thank you for getting in touch</h1>
    <p style="margin:0;font-size:14px;color:#4A4A4A;line-height:1.7;">
      Hello ${escapeHtml(enquiry.name.split(' ')[0])}, we have received your message and will reply as soon as we can.
    </p>`;

  sendMailAsync({
    to: enquiry.email,
    subject: 'We have received your enquiry',
    html: await shell('Enquiry received', body),
  });
}

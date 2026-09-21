import { useState, type FormEvent } from 'react';
import { ApiError, request } from '../lib/api';
import { Seo, localBusinessSchema } from '../lib/seo';
import { useAuth, useSettings, useToast } from '../context/StoreProvider';
import { isOpenNow, summariseHours } from '../lib/format';
import type { BusinessHour } from '../lib/types';
import { Badge, Button, CheckIcon, ClockIcon, Input, MailIcon, PhoneIcon, PinIcon, Textarea } from '../components/ui';

export default function ContactPage() {
  const { settings, get } = useSettings();
  const { user } = useAuth();
  const { push } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const phone = get<string>('contact.phone', '');
  const whatsapp = get<string>('contact.whatsapp', '');
  const email = get<string>('contact.email', '');
  const addressLines = get<string[]>('contact.addressLines', []);
  const mapUrl = get<string | null>('contact.mapEmbedUrl', null);
  const hours = get<BusinessHour[]>('hours.schedule', []);
  const hoursRows = summariseHours(hours);
  const openNow = isOpenNow(hours);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('type', 'CONTACT');

    setSubmitting(true);
    setErrors({});
    try {
      await request('/enquiries', { method: 'POST', body: form });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        push(err.message, 'error');
      } else {
        push('Could not send your message. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo
        settings={settings}
        title="Contact"
        description={`Visit Beyond Walls at ${addressLines.join(', ')}. Call ${phone} or email ${email}.`}
        canonical="/contact"
        schema={[localBusinessSchema(settings)]}
      />

      <section className="border-b border-stone-line bg-paper">
        <div className="container-site py-12 lg:py-16">
          <p className="eyebrow mb-4">Get in touch</p>
          <h1 className="text-3xl lg:text-4xl">Contact</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-500">
            Visit the studio, call us, or send a message and we will get back to you.
          </p>
        </div>
      </section>

      <div className="container-site py-12 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Details */}
          <div className="space-y-8 lg:col-span-5">
            {addressLines.length ? (
              <ContactBlock icon={<PinIcon size={17} />} title="Studio">
                <address className="not-italic leading-relaxed">
                  {addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </ContactBlock>
            ) : null}

            <ContactBlock icon={<PhoneIcon size={17} />} title="Phone">
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="link-underline">
                {phone}
              </a>
              {whatsapp ? (
                <a
                  href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link-underline mt-1 block text-ink-500"
                >
                  Message on WhatsApp
                </a>
              ) : null}
            </ContactBlock>

            <ContactBlock icon={<MailIcon size={17} />} title="Email">
              <a href={`mailto:${email}`} className="link-underline">
                {email}
              </a>
            </ContactBlock>

            {hoursRows.length ? (
              <ContactBlock
                icon={<ClockIcon size={17} />}
                title="Opening hours"
                badge={
                  openNow === null ? null : openNow ? (
                    <Badge tone="success">Open now</Badge>
                  ) : (
                    <Badge tone="neutral">Closed now</Badge>
                  )
                }
              >
                <dl className="space-y-1">
                  {hoursRows.map((row) => (
                    <div key={row.days} className="flex justify-between gap-6">
                      <dt className="text-ink-500">{row.days}</dt>
                      <dd>{row.hours}</dd>
                    </div>
                  ))}
                </dl>
              </ContactBlock>
            ) : null}

            {mapUrl ? (
              <div className="aspect-[4/3] w-full border border-stone-line">
                <iframe
                  src={mapUrl}
                  title="Beyond Walls on the map"
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : null}
          </div>

          {/* Form */}
          <div className="lg:col-span-7">
            {done ? (
              <div className="border border-state-success/30 bg-[#EDF5F1] p-10 text-center">
                <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-state-success text-paper">
                  <CheckIcon size={22} />
                </span>
                <h2 className="text-xl">Message sent</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-600">
                  Thank you for getting in touch. We will reply as soon as we can.
                </p>
                <Button className="mt-7" size="sm" variant="secondary" onClick={() => setDone(false)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="border border-stone-line bg-paper p-7 lg:p-9">
                <h2 className="text-xs font-semibold uppercase tracking-architect">Send a message</h2>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Input
                    name="name" label="Your name" required defaultValue={user?.name ?? ''}
                    error={errors.name} autoComplete="name"
                  />
                  <Input
                    name="phone" label="Phone" type="tel" defaultValue={user?.phone ?? ''}
                    error={errors.phone} autoComplete="tel"
                  />
                  <Input
                    name="email" label="Email" type="email" required defaultValue={user?.email ?? ''}
                    error={errors.email} autoComplete="email" wrapClassName="sm:col-span-2"
                  />
                  <Input
                    name="subject" label="Subject" error={errors.subject} wrapClassName="sm:col-span-2"
                  />
                </div>

                <Textarea
                  name="message" label="Message" required rows={6} className="mt-5"
                  wrapClassName="mt-5" error={errors.message}
                  placeholder="How can we help?"
                />

                <Button type="submit" size="lg" className="mt-6" loading={submitting}>
                  Send message
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ContactBlock({
  icon, title, children, badge,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 text-ink-300">{icon}</span>
      <div className="flex-1 text-sm">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-architect">{title}</h2>
          {badge}
        </div>
        <div className="text-ink-600">{children}</div>
      </div>
    </div>
  );
}

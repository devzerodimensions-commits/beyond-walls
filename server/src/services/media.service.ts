import prisma from '../lib/prisma';
import { deleteUploadedFile } from '../middleware/upload';

/**
 * The same uploaded file can legitimately be used in several places — a product
 * image that is also a gallery tile, a category tile that is also a banner.
 *
 * Deleting one of those records must NOT remove the file from disk while
 * another record still points at it, so every delete path goes through here.
 */

/** Every column across the schema that can hold an upload URL. */
async function countReferences(url: string, ignore?: { model: string; id: string }): Promise<number> {
  const skip = (model: string, id: string) =>
    ignore && ignore.model === model && ignore.id === id;

  const [
    productImages,
    variants,
    galleryItems,
    banners,
    bannersMobile,
    categories,
    categoryBanners,
    pages,
    testimonials,
  ] = await Promise.all([
    prisma.productImage.findMany({ where: { url }, select: { id: true } }),
    prisma.productVariant.findMany({ where: { image: url }, select: { id: true } }),
    prisma.galleryItem.findMany({ where: { image: url }, select: { id: true } }),
    prisma.banner.findMany({ where: { image: url }, select: { id: true } }),
    prisma.banner.findMany({ where: { mobileImage: url }, select: { id: true } }),
    prisma.category.findMany({ where: { image: url }, select: { id: true } }),
    prisma.category.findMany({ where: { bannerImage: url }, select: { id: true } }),
    prisma.page.findMany({ where: { heroImage: url }, select: { id: true } }),
    prisma.testimonial.findMany({ where: { image: url }, select: { id: true } }),
  ]);

  const groups: [string, { id: string }[]][] = [
    ['productImage', productImages],
    ['productVariant', variants],
    ['galleryItem', galleryItems],
    ['banner', banners],
    ['banner', bannersMobile],
    ['category', categories],
    ['category', categoryBanners],
    ['page', pages],
    ['testimonial', testimonials],
  ];

  let count = 0;
  for (const [model, rows] of groups) {
    for (const row of rows) if (!skip(model, row.id)) count += 1;
  }

  // Settings (logo, favicon, default OG image) hold URLs as JSON values.
  const settings = await prisma.setting.findMany({
    where: { group: { in: ['brand', 'seo'] } },
    select: { value: true },
  });
  for (const setting of settings) {
    if (typeof setting.value === 'string' && setting.value === url) count += 1;
  }

  // Enquiry attachments are customer uploads and must never be swept away.
  const enquiries = await prisma.enquiry.count({
    where: { attachments: { array_contains: [{ url }] } as never },
  });
  count += enquiries;

  return count;
}

/**
 * Removes the file from disk and the media library ONLY when nothing else
 * references it. `ignore` lets the caller exclude the record currently being
 * deleted, since it may not be gone from the database yet.
 */
export async function deleteFileIfUnreferenced(
  url: string | null | undefined,
  ignore?: { model: string; id: string },
): Promise<boolean> {
  if (!url || !url.startsWith('/uploads/')) return false;

  const references = await countReferences(url, ignore);
  if (references > 0) return false;

  deleteUploadedFile(url);
  await prisma.mediaAsset.deleteMany({ where: { url } });
  return true;
}

/** How many records currently point at a file — used by the media library UI. */
export async function fileReferenceCount(url: string): Promise<number> {
  return countReferences(url);
}

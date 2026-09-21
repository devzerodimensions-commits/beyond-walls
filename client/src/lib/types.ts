export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type PersonalizationType =
  | 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'COLOR' | 'FONT'
  | 'IMAGE_UPLOAD' | 'FILE_UPLOAD' | 'URL' | 'GSTIN' | 'PHONE' | 'EMAIL' | 'DATE';

export type OrderStatus =
  | 'PENDING' | 'CONFIRMED' | 'IN_PRODUCTION' | 'READY_TO_SHIP'
  | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

export type PaymentStatus =
  | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED'
  | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';

export type PaymentMethod = 'RAZORPAY' | 'COD';

export type SectionType =
  | 'HERO' | 'USP_STRIP' | 'CATEGORY_GRID' | 'FEATURED_PRODUCTS' | 'BANNER_SPLIT'
  | 'BANNER_WIDE' | 'GALLERY' | 'TESTIMONIALS' | 'FAQ' | 'RICH_TEXT' | 'CTA' | 'CUSTOM_ORDER_CTA'
  | 'SHOP_BY_ATTRIBUTE' | 'PERSONALISATION_DEMO';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  createdAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  shortText?: string | null;
  image?: string | null;
  bannerImage?: string | null;
  parentId?: string | null;
  parent?: Pick<Category, 'id' | 'name' | 'slug'> | null;
  children?: Category[];
  sortOrder: number;
  status: ContentStatus;
  featured: boolean;
  showInMenu: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  _count?: { products: number; children?: number };
}

export interface ProductImage {
  id?: string;
  url: string;
  alt?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface ProductVariant {
  id: string;
  label: string;
  sku?: string | null;
  price: string | number | null;
  compareAtPrice?: string | number | null;
  stock: number;
  image?: string | null;
  options?: Record<string, string>;
  sortOrder?: number;
  isDefault?: boolean;
  status?: ContentStatus;
}

export interface PersonalizationOption {
  label: string;
  value: string;
  hex?: string;
  priceDelta?: number | string;
}

export interface PersonalizationField {
  id: string;
  key: string;
  label: string;
  type: PersonalizationType;
  placeholder?: string | null;
  helpText?: string | null;
  required: boolean;
  maxLength?: number | null;
  minLength?: number | null;
  pattern?: string | null;
  options: PersonalizationOption[];
  defaultValue?: string | null;
  priceDelta: string | number;
  sortOrder: number;
  status: ContentStatus;
  previewSlot?: string | null;
}

export interface AttributeValueRef {
  value: {
    id: string;
    name: string;
    slug: string;
    hexColor?: string | null;
    group: { id: string; name: string; slug: string; kind: string };
  };
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  designNote?: string | null;
  materialNote?: string | null;
  careInstructions?: string | null;
  installationNote?: string | null;
  shippingNote?: string | null;
  includedItems?: string[];
  features?: string[];
  applications?: string[];
  price: string | number | null;
  compareAtPrice?: string | number | null;
  priceConfirmed?: boolean;
  taxRatePercent?: string | number;
  stock: number;
  trackInventory: boolean;
  minOrderQty?: number;
  maxOrderQty?: number | null;
  widthInches?: string | number | null;
  heightInches?: string | number | null;
  depthMm?: string | number | null;
  weightGrams?: number | null;
  status: ContentStatus;
  featured: boolean;
  isNew: boolean;
  badge?: string | null;
  sortOrder?: number;
  livePreviewEnabled: boolean;
  livePreviewTemplate?: string | null;
  livePreviewConfig?: Record<string, unknown>;
  productionDays?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogImage?: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  personalization?: PersonalizationField[];
  attributes?: AttributeValueRef[];
  category?: Pick<Category, 'id' | 'name' | 'slug'> & { parent?: { name: string; slug: string } | null };
  subcategory?: Pick<Category, 'id' | 'name' | 'slug'> | null;
  reviews?: Review[];
  related?: Product[];
  createdAt?: string;
  publishedAt?: string | null;
}

export interface Review {
  id: string;
  authorName: string;
  rating: number;
  title?: string | null;
  content: string;
  createdAt: string;
}

export interface FilterValue {
  id: string;
  name: string;
  slug: string;
  hexColor?: string | null;
  count: number;
}

export interface FilterGroup {
  id: string;
  name: string;
  slug: string;
  kind: string;
  multiSelect: boolean;
  helpText?: string | null;
  values: FilterValue[];
}

export interface BudgetBand {
  slug: string;
  label: string;
  min: number | null;
  max: number | null;
}

export interface CatalogFilters {
  attributes: FilterGroup[];
  budgetBands: BudgetBand[];
  priceRange: { min: number; max: number };
  sortOptions: { value: string; label: string }[];
}

export interface PersonalizationEntry {
  key: string;
  label: string;
  type: string;
  value: string;
  displayValue?: string;
  priceDelta: number;
  previewSlot?: string | null;
}

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  sku: string | null;
  variantLabel: string | null;
  image: string | null;
  quantity: number;
  unitPrice: number;
  personalizationCost: number;
  lineTotal: number;
  personalization: PersonalizationEntry[];
  unavailable: boolean;
  inStock: boolean;
  availableStock: number | null;
  maxOrderQty: number | null;
  categorySlug: string | null;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  total: number;
  itemCount: number;
  currency: string;
  couponCode: string | null;
  couponMessage: string | null;
  freeShippingThreshold: number;
  hasUnavailableItems: boolean;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  totals: CartTotals;
}

export interface Address {
  id?: string;
  type?: 'SHIPPING' | 'BILLING';
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  isDefault?: boolean;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  variantLabel: string | null;
  sku: string | null;
  imageUrl: string | null;
  slug: string | null;
  unitPrice: string | number;
  personalizationCost: string | number;
  quantity: number;
  lineTotal: string | number;
  personalization: PersonalizationEntry[];
}

export interface PaymentEvent {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface Payment {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  amount: string | number;
  currency: string;
  instrument: string | null;
  bank: string | null;
  wallet: string | null;
  cardLast4: string | null;
  vpa: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  refundedAmount: string | number;
  createdAt: string;
  events?: PaymentEvent[];
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: string | number;
  discountAmount: string | number;
  shippingAmount: string | number;
  taxAmount: string | number;
  total: string | number;
  currency: string;
  couponCode: string | null;
  shippingAddress: Address;
  billingAddress: Address;
  customerNote: string | null;
  gstInvoice?: boolean;
  companyName?: string | null;
  gstin?: string | null;
  adminNote?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courierName?: string | null;
  items: OrderItem[];
  payments?: Payment[];
  placedAt: string;
  confirmedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  total: number;
  currency: string;
  placedAt: string;
  itemCount: number;
  preview: { id: string; name: string; quantity: number; image: string | null }[];
}

export interface Banner {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  eyebrow?: string | null;
  image?: string | null;
  mobileImage?: string | null;
  link?: string | null;
  ctaLabel?: string | null;
  placement: string;
  sortOrder: number;
  status: ContentStatus;
}

export interface GalleryItem {
  id: string;
  title?: string | null;
  caption?: string | null;
  image: string;
  tag?: string | null;
  link?: string | null;
  sortOrder: number;
  status: ContentStatus;
}

export interface Testimonial {
  id: string;
  name: string;
  role?: string | null;
  location?: string | null;
  content: string;
  rating?: number | null;
  image?: string | null;
  sortOrder: number;
  status: ContentStatus;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  group?: string | null;
  sortOrder: number;
  status: ContentStatus;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  content: string;
  heroImage?: string | null;
  status: ContentStatus;
  showInFooter: boolean;
  sortOrder: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogImage?: string | null;
}

export interface HomeSection {
  id: string;
  key: string;
  type: SectionType;
  title?: string | null;
  subtitle?: string | null;
  bodyText?: string | null;
  ctaLabel?: string | null;
  ctaLink?: string | null;
  config: Record<string, unknown>;
  sortOrder: number;
  status: ContentStatus;
  items: unknown[];
}

export interface NavLink {
  id: string;
  label: string;
  href: string;
  group: string;
  openInNewTab?: boolean;
  sortOrder?: number;
  status?: ContentStatus;
}

export type SettingsMap = Record<string, unknown>;

export interface SiteSettings {
  settings: SettingsMap;
  navLinks: NavLink[];
  footerPages: { slug: string; title: string }[];
}

export interface BusinessHour {
  day: string;
  open: string | null;
  close: string | null;
  closed: boolean;
}

export interface CheckoutConfig {
  razorpay: {
    enabled: boolean;
    configured: boolean;
    keyId: string | null;
    methods: string[];
  };
  cod: {
    enabled: boolean;
    fee: number;
    minOrder: number;
    maxOrder: number;
    note: string;
  };
  checkoutEnabled: boolean;
  currency: string;
  shippingNote: string;
}

export interface Enquiry {
  id: string;
  type: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string;
  quantity: number | null;
  budget: string | null;
  productId: string | null;
  product?: { id: string; name: string; slug: string } | null;
  attachments: { url: string; filename: string; size: number; mime: string }[];
  status: 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'CLOSED' | 'SPAM';
  adminNote: string | null;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: string | number;
  minOrderValue: string | number | null;
  maxDiscount: string | number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: ContentStatus;
}

export interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  folder: string;
  alt: string | null;
  createdAt: string;
}

export interface AttributeGroup {
  id: string;
  name: string;
  slug: string;
  kind: string;
  helpText: string | null;
  sortOrder: number;
  status: ContentStatus;
  showInFilter: boolean;
  multiSelect: boolean;
  values?: AttributeValue[];
  _count?: { values: number };
}

export interface AttributeValue {
  id: string;
  groupId: string;
  name: string;
  slug: string;
  hexColor: string | null;
  image: string | null;
  sortOrder: number;
  status: ContentStatus;
  group?: { id: string; name: string; slug: string };
  _count?: { products: number };
}

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  _count?: { orders: number };
  addresses?: Address[];
  orders?: OrderSummary[];
  lifetimeValue?: number;
  paidOrders?: number;
}

export interface DashboardData {
  counts: {
    orders: number;
    pendingOrders: number;
    products: number;
    draftProducts: number;
    customers: number;
    newEnquiries: number;
  };
  revenue: { allTime: number; thisMonth: number };
  revenueSeries: { date: string; value: number }[];
  statusBreakdown: { status: string; count: number }[];
  lowStock: { id: string; name: string; slug: string; stock: number; lowStockAlert: number }[];
  recentOrders: {
    id: string; orderNumber: string; customerName: string; total: string | number;
    status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod: PaymentMethod; placedAt: string;
  }[];
  recentEnquiries: { id: string; name: string; type: string; subject: string | null; status: string; createdAt: string }[];
  /** Things that must be settled before the store is opened to customers. */
  launchChecks: {
    unconfirmedPrices: { id: string; name: string; slug: string; price: number }[];
    domainConfirmed: boolean;
    siteUrl: string;
    razorpayConfigured: boolean;
    emailConfigured: boolean;
  };
}

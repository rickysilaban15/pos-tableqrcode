import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const role = pgEnum('role', ['SUPER_ADMIN', 'MERCHANT_OWNER', 'CASHIER']);

export const merchants = pgTable('merchants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ...timestamps,
});

export const outlets = pgTable(
  'outlets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('outlets_merchant_slug_uq').on(t.merchantId, t.slug)],
);

export const outletSettings = pgTable('outlet_settings', {
  outletId: uuid('outlet_id').primaryKey().references(() => outlets.id),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  description: text('description').notNull().default(''),
  address: text('address').notNull().default(''),
  whatsapp: text('whatsapp').notNull().default(''),
  logoUrl: text('logo_url').notNull().default(''),
  operatingHours: text('operating_hours').notNull().default(''),
  isOpen: boolean('is_open').notNull().default(true),
  enableDineIn: boolean('enable_dine_in').notNull().default(true),
  enableTakeaway: boolean('enable_takeaway').notNull().default(true),
  enableTableService: boolean('enable_table_service').notNull().default(true),
  enablePickupCounter: boolean('enable_pickup_counter').notNull().default(true),
  enableDynamicQris: boolean('enable_dynamic_qris').notNull().default(true),
  qrisImageUrl: text('qris_image_url').notNull().default(''),
  qrBaseUrl: text('qr_base_url').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
  ...timestamps,
});

export const memberships = pgTable(
  'merchant_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: role('role').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('memberships_user_merchant_uq').on(t.userId, t.merchantId)],
);

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  categoryId: uuid('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  imageUrl: text('image_url').notNull().default(''),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
});

export const productVariants = pgTable('product_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id),
  groupName: text('group_name').notNull(),
  optionName: text('option_name').notNull(),
  priceDelta: integer('price_delta').notNull().default(0),
  required: boolean('required').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const productAddons = pgTable('product_addons', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const diningTables = pgTable(
  'dining_tables',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    outletId: uuid('outlet_id').notNull().references(() => outlets.id),
    name: text('name').notNull(),
    area: text('area').notNull().default(''),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('tables_outlet_name_uq').on(t.outletId, t.name)],
);

export const tableQrCodes = pgTable('table_qr_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tableId: uuid('table_id').notNull().references(() => diningTables.id),
  tokenHash: text('token_hash').notNull().unique(),
  publicToken: text('public_token'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

export const legacyQrMappings = pgTable('legacy_qr_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  merchantSlug: text('merchant_slug').notNull(),
  tableName: text('table_name').notNull(),
  legacyToken: text('legacy_token').notNull(),
  tableId: uuid('table_id').notNull().references(() => diningTables.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
    outletId: uuid('outlet_id').notNull().references(() => outlets.id),
    tableId: uuid('table_id').references(() => diningTables.id),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull().default(''),
    trackingTokenHash: text('tracking_token_hash'),
    customerName: text('customer_name').notNull().default('Customer'),
    orderType: text('order_type').notNull().default('DINE_IN'),
    fulfillmentMethod: text('fulfillment_method').notNull().default('TABLE_SERVICE'),
    orderSource: text('order_source').notNull().default('QR'),
    orderStatus: text('order_status').notNull(),
    paymentStatus: text('payment_status').notNull(),
    totalAmount: integer('total_amount').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason').notNull().default(''),
    ...timestamps,
  },
  (t) => [uniqueIndex('orders_outlet_idempotency_uq').on(t.outletId, t.idempotencyKey)],
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  productId: uuid('product_id').references(() => products.id),
  productName: text('product_name').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  selections: jsonb('selections').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  outletId: uuid('outlet_id').references(() => outlets.id),
  method: text('method').notNull(),
  provider: text('provider').notNull().default('INTERNAL'),
  providerOrderId: text('provider_order_id'),
  providerTransactionId: text('provider_transaction_id'),
  providerStatus: text('provider_status'),
  status: text('status').notNull(),
  amount: integer('amount').notNull(),
  expectedGrossAmount: integer('expected_gross_amount').notNull().default(0),
  currency: text('currency').notNull().default('IDR'),
  environment: text('environment').notNull().default('PRODUCTION'),
  qrString: text('qr_string'),
  qrImageUrl: text('qr_image_url'),
  acquirer: text('acquirer'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  reconciliationStatus: text('reconciliation_status').notNull().default('NOT_APPLICABLE'),
  lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
  providerMetadata: jsonb('provider_metadata').notNull().default({}),
  cashReceived: integer('cash_received'),
  changeAmount: integer('change_amount'),
  verifiedBy: uuid('verified_by').references(() => users.id),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  ...timestamps,
});

export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').notNull(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  providerOrderId: text('provider_order_id').notNull(),
  providerTransactionId: text('provider_transaction_id'),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  signatureValid: boolean('signature_valid').notNull(),
  processingStatus: text('processing_status').notNull(),
  rejectionReason: text('rejection_reason').notNull().default(''),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  monthlyPrice: integer('monthly_price').notNull(),
  trialDays: integer('trial_days').notNull().default(14),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id),
  status: text('status').notNull(),
  qrOrderingEnabled: boolean('qr_ordering_enabled').notNull().default(true),
  posEnabled: boolean('pos_enabled').notNull().default(true),
  notes: text('notes').notNull().default(''),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }),
  ...timestamps,
});

export const subscriptionInvoices = pgTable('subscription_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id),
  invoiceNumber: text('invoice_number').notNull().unique(),
  status: text('status').notNull().default('PENDING_PAYMENT'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('IDR'),
  billingPeriodDays: integer('billing_period_days').notNull().default(30),
  provider: text('provider').notNull().default('MANUAL_INVOICE'),
  environment: text('environment').notNull().default('SANDBOX'),
  providerOrderId: text('provider_order_id').unique(),
  providerTransactionId: text('provider_transaction_id'),
  providerStatus: text('provider_status'),
  qrString: text('qr_string'),
  qrImageUrl: text('qr_image_url'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  activatedPeriodStart: timestamp('activated_period_start', { withTimezone: true }),
  activatedPeriodEnd: timestamp('activated_period_end', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  metadata: jsonb('metadata').notNull().default({}),
  ...timestamps,
});

export const planFeatures = pgTable('plan_features', {
  id: uuid('id').defaultRandom().primaryKey(),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id),
  featureKey: text('feature_key').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  merchantId: uuid('merchant_id').references(() => merchants.id),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

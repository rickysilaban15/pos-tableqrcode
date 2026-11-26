export type OrderType = 'DINE_IN' | 'TAKEAWAY';

export type FulfillmentMethod = 'TABLE_SERVICE' | 'PICKUP_COUNTER';

export type PaymentMethod = 'QRIS' | 'E_WALLET' | 'BANK_TRANSFER' | 'CASHIER';

export type PaymentStatus = 'BELUM_DIBAYAR' | 'LUNAS' | 'GAGAL';

export type OrderStatus = 'ORDER_BARU' | 'MEMASAK' | 'DISAJIKAN';

export type CashierStatus = 'AKTIF' | 'SELESAI';

export interface CafeSettings {
  name: string;
  slug: string;
  logoUrl: string;
  description: string;
  address: string;
  whatsapp: string;
  operatingHours: string;
  isOpen: boolean;
  qrBaseUrl: string;
  enableDineIn: boolean;
  enableTakeaway: boolean;
  enableTableService: boolean;
  enablePickupCounter: boolean;
  qrisImageUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface VariantOption {
  id: string;
  label: string;
  priceDelta: number;
}

export interface VariantGroup {
  id: string;
  name: string;
  required: boolean;
  options: VariantOption[];
}

export interface ToppingOption {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  isActive: boolean;
  variantGroups: VariantGroup[];
  toppings: ToppingOption[];
}

export interface CafeTable {
  id: string;
  name: string;
  area: string;
  token: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SelectedVariant {
  groupId: string;
  groupName: string;
  optionId: string;
  optionLabel: string;
  priceDelta: number;
}

export interface SelectedTopping {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  productName: string;
  productImage: string;
  basePrice: number;
  selectedVariants: SelectedVariant[];
  selectedToppings: SelectedTopping[];
  quantity: number;
  notes: string;
  unitPrice: number;
  subtotal: number;
}

export interface OrderItemSnapshot {
  productId: string;
  productName: string;
  productImage: string;
  basePrice: number;
  selectedVariants: SelectedVariant[];
  selectedToppings: SelectedTopping[];
  quantity: number;
  notes: string;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerWhatsapp?: string;
  orderNote?: string;
  orderType: OrderType;
  fulfillmentMethod: FulfillmentMethod;
  tableId?: string;
  tableName?: string;
  items: OrderItemSnapshot[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentSubMethod?: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  cashierStatus: CashierStatus;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  message: string;
  orderId?: string;
}

export interface PosDataState {
  version: number;
  cafeSettings: CafeSettings;
  categories: Category[];
  products: Product[];
  tables: CafeTable[];
  orders: Order[];
  activities: ActivityLog[];
  lastOrderSequence: number;
}

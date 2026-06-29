import type { OrderStatus } from '../types/database.js';

export const ORDER_STATUSES: Record<OrderStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  completed: { label: 'Completed', color: 'green' },
  refunded: { label: 'Refunded', color: 'yellow' },
  voided: { label: 'Voided', color: 'red' },
};

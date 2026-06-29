import type { UserRole } from '../types/database.js';

export const ROLES: Record<UserRole, { label: string; level: number }> = {
  owner: { label: 'Owner', level: 4 },
  admin: { label: 'Admin', level: 3 },
  manager: { label: 'Manager', level: 2 },
  cashier: { label: 'Cashier', level: 1 },
};

export const MANAGEMENT_ROLES: UserRole[] = ['owner', 'admin', 'manager'];
export const ADMIN_ROLES: UserRole[] = ['owner', 'admin'];

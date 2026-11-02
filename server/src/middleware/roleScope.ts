import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/http';

/**
 * What each staff role is allowed to reach inside /api/admin.
 *
 * An admin panel that hides the menu items a role should not have is not a
 * permission system — the URLs are still there and the API still answers. So
 * the rule is enforced here, on the way in, and the menu merely agrees with it.
 *
 * The list is an allowlist and the default is refusal. That ordering is the
 * point: an endpoint added next month is closed to a parcel manager until
 * somebody decides otherwise, rather than open until somebody notices.
 */

export const STAFF_ROLES = ['ADMIN', 'PARCEL_MANAGER'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: unknown): role is StaffRole {
  return (STAFF_ROLES as readonly unknown[]).includes(role);
}

/**
 * The packing desk: see the day's orders, open one, print its paperwork.
 *
 * Paths are matched against the path *within* the admin router, so they start
 * after /api/admin. Anchored at both ends so a longer path cannot slip in
 * underneath one of these.
 */
const PARCEL_MANAGER_ALLOW: { method: string; path: RegExp }[] = [
  // The order list, including its filters and its pagination.
  { method: 'GET', path: /^\/orders\/?$/ },
  // One order, to check what goes in the box.
  { method: 'GET', path: /^\/orders\/[^/]+$/ },
  // The two documents that go in it, or on it.
  { method: 'GET', path: /^\/orders\/[^/]+\/(invoice|receipt)$/ },
];

/** True when this role may call this method and path. */
export function mayAccess(role: string, method: string, path: string): boolean {
  if (role === 'ADMIN') return true;
  if (role !== 'PARCEL_MANAGER') return false;

  // Query strings never reach here — Express strips them from req.path — but
  // a trailing slash does, and so does a double slash.
  const clean = path.replace(/\/{2,}/g, '/');
  return PARCEL_MANAGER_ALLOW.some(
    (rule) => rule.method === method.toUpperCase() && rule.path.test(clean),
  );
}

/**
 * Applied after the staff check, so by here the caller is known to be one of
 * the staff roles and the only question left is what they may touch.
 */
export function enforceRoleScope(req: Request, _res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (!role) return next(ApiError.unauthorized());
  if (mayAccess(role, req.method, req.path)) return next();

  return next(
    ApiError.forbidden(
      'Your account can see orders and print their paperwork. Ask an administrator for anything else.',
    ),
  );
}

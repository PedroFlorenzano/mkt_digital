/**
 * plan-guard.ts
 *
 * Internal platform — no subscription tiers.
 * All authenticated users have full access to all features.
 * This file is retained only for import compatibility with existing callers.
 */

// No-op: internal platform has no plan restrictions.
export async function requireTrafficAccess(_userId: string): Promise<void> {
  // All users have access — no subscription check needed.
}

// No-op: all users can create unlimited companies.
export async function assertCompanyLimit(
  _userId: string,
  _currentCount: number,
): Promise<void> {
  // No limit enforced.
}

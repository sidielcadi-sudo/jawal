/**
 * Catalogue des permissions Jawal.
 * Format : "<module>.<action>" — ex: "notes.write", "bulletins.publish".
 * Le wildcard "*" matche toutes les actions d'un module ("notes.*").
 */
export const PERMISSIONS = {
  // Core
  TENANTS_MANAGE: 'tenants.manage',
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',

  // Scolarité
  STUDENTS_READ: 'students.read',
  STUDENTS_WRITE: 'students.write',
  CLASSES_READ: 'classes.read',
  CLASSES_WRITE: 'classes.write',

  // Présences
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_WRITE: 'attendance.write',

  // Notes/Bulletins
  GRADES_READ: 'grades.read',
  GRADES_WRITE: 'grades.write',
  BULLETINS_PUBLISH: 'bulletins.publish',

  // Finance
  FINANCE_READ: 'finance.read',
  FINANCE_WRITE: 'finance.write',
  PAYMENTS_RECORD: 'payments.record',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Vérifie si un ensemble de permissions accordées couvre une permission requise,
 * en gérant les wildcards ("*" global, "module.*" par module).
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [mod] = required.split('.');
  return granted.includes(`${mod}.*`);
}

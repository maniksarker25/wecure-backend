export const DOCTOR_VERIFICATION_STATUSES = [
  'INCOMPLETE',
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
] as const;

export type DoctorVerificationStatus =
  (typeof DOCTOR_VERIFICATION_STATUSES)[number];

export type DoctorOnboardingFields = {
  currentOrganization?: string | null;
  specialtyId?: unknown;
  mdcnRegistrationNumber?: string | null;
  mdcnPracticingLicenseDocument?: string | null;
  mdcnPracticingLicenseExpiryDate?: Date | string | null;
};

export function isDoctorProfileComplete(
  doctor: DoctorOnboardingFields,
  now = new Date(),
): boolean {
  if (!doctor.currentOrganization?.trim()) return false;
  if (!doctor.specialtyId) return false;
  if (!doctor.mdcnRegistrationNumber?.trim()) return false;
  if (!doctor.mdcnPracticingLicenseDocument?.trim()) return false;
  if (!doctor.mdcnPracticingLicenseExpiryDate) return false;

  const expiry = new Date(doctor.mdcnPracticingLicenseExpiryDate);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() > now.getTime();
}

/**
 * Status used when a doctor signs in or opens the profile.
 * A rejected doctor stays rejected until a completed profile is submitted.
 */
export function resolveVerificationStatus(
  current: string | undefined,
  complete: boolean,
): DoctorVerificationStatus {
  if (current === 'SUSPENDED' || current === 'REJECTED') return current;
  if (current === 'VERIFIED' && complete) return 'VERIFIED';
  if (!complete) return 'INCOMPLETE';
  return 'PENDING';
}

/**
 * Status used after the doctor saves profile details or verification files.
 */
export function statusAfterProfileSave(
  current: string | undefined,
  complete: boolean,
  detailsChanged: boolean,
): DoctorVerificationStatus {
  if (current === 'SUSPENDED') return 'SUSPENDED';
  if (current === 'VERIFIED' && complete && !detailsChanged) return 'VERIFIED';
  if (!complete) return current === 'REJECTED' ? 'REJECTED' : 'INCOMPLETE';
  if (current === 'VERIFIED' && detailsChanged) return 'PENDING';
  return 'PENDING';
}

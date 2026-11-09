import {
  isDoctorProfileComplete,
  resolveVerificationStatus,
  statusAfterProfileSave,
} from './doctor-onboarding';

const completeDoctor = {
  currentOrganization: 'Lagos Clinic',
  specialtyId: 'specialty-1',
  mdcnRegistrationNumber: 'MDCN-123',
  mdcnPracticingLicenseDocument: 'licence-key',
  mdcnPracticingLicenseExpiryDate: '2099-01-01T00:00:00.000Z',
};

describe('doctor onboarding', () => {
  const now = new Date('2026-11-09T00:00:00.000Z');

  it('requires organization, specialty, MDCN number, licence file, and a future expiry', () => {
    expect(isDoctorProfileComplete(completeDoctor, now)).toBe(true);
    expect(
      isDoctorProfileComplete(
        { ...completeDoctor, currentOrganization: '  ' },
        now,
      ),
    ).toBe(false);
    expect(
      isDoctorProfileComplete(
        {
          ...completeDoctor,
          mdcnPracticingLicenseExpiryDate: '2020-01-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('keeps a verified doctor verified only while the profile stays complete', () => {
    expect(resolveVerificationStatus('VERIFIED', true)).toBe('VERIFIED');
    expect(resolveVerificationStatus('VERIFIED', false)).toBe('INCOMPLETE');
    expect(resolveVerificationStatus('INCOMPLETE', true)).toBe('PENDING');
    expect(resolveVerificationStatus('PENDING', false)).toBe('INCOMPLETE');
    expect(resolveVerificationStatus('REJECTED', false)).toBe('REJECTED');
    expect(resolveVerificationStatus('SUSPENDED', true)).toBe('SUSPENDED');
  });

  it('sends a completed resubmission back to admin review', () => {
    expect(statusAfterProfileSave('REJECTED', true, true)).toBe('PENDING');
    expect(statusAfterProfileSave('INCOMPLETE', true, false)).toBe('PENDING');
    expect(statusAfterProfileSave('VERIFIED', true, true)).toBe('PENDING');
    expect(statusAfterProfileSave('VERIFIED', true, false)).toBe('VERIFIED');
    expect(statusAfterProfileSave('SUSPENDED', true, true)).toBe('SUSPENDED');
    expect(statusAfterProfileSave('REJECTED', false, true)).toBe('REJECTED');
  });
});

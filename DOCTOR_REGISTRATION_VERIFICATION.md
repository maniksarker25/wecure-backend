# Doctor Registration, Profile & Verification API

This guide describes the mobile-app flow for doctor registration, profile setup,
verification document uploads, admin review, and booking availability.

## Conventions

- Replace `{{baseUrl}}` with the deployed API base URL.
- For protected endpoints, send `Authorization: Bearer <accessToken>`.
- Use `application/json` for JSON requests.
- Use `multipart/form-data` for document uploads. Let the HTTP client set the
  multipart content-type boundary.
- Dates should be sent in ISO 8601 format.

## 1. Register a doctor account

### `POST {{baseUrl}}/auth/register`

Request body:

```json
{
  "name": "Dr. Ada Okafor",
  "email": "ada@example.com",
  "password": "SecurePassword123",
  "role": "DOCTOR",
  "doctorId": "doctor-id-required-by-current-api"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `name` | Yes | Doctor's account name |
| `email` | Yes | Valid email address |
| `password` | Yes | Minimum 8 characters |
| `role` | Yes | Use `DOCTOR` |
| `doctorId` | Yes for doctor role | Required by the current registration DTO. This is **not** the MDCN registration number. Confirm with the backend owner what value the app should send here. |

Example response:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP sent to your email",
  "data": null
}
```

The OTP is sent by email. In development, the response may also include the OTP
in `data.otp`.

## 2. Verify the registration email

### `POST {{baseUrl}}/auth/verify-reg-otp`

Request body:

```json
{
  "email": "ada@example.com",
  "otp": "123456"
}
```

Example success response:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Email verified successfully",
  "data": {
    "name": "Dr. Ada Okafor",
    "email": "ada@example.com",
    "role": "DOCTOR",
    "accessToken": "<access-token>",
    "refreshToken": "<refresh-token>"
  }
}
```

The exact success message may vary. Use the returned `accessToken` for
subsequent protected requests.

## 3. Create the doctor profile

### `POST {{baseUrl}}/doctors/me/profile`

Headers:

```text
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Request body:

```json
{
  "currentOrganization": "Lagos General Hospital",
  "specialtyId": "66d3f820c741e95642a8b201",
  "about": "Consultant physician with clinical experience.",
  "phone": "+2348012345678",
  "dateOfBirth": "1990-03-14",
  "name": "Dr. Ada Okafor",
  "timezone": "Africa/Lagos",
  "mdcnRegistrationNumber": "MDCN-123456",
  "mdcnPracticingLicenseExpiryDate": "2027-12-31"
}
```

Fields:

| Field | Required | Notes |
|---|---:|---|
| `currentOrganization` | Yes | Current clinic or organization |
| `specialtyId` | Yes | Existing MongoDB specialist ID |
| `about` | No | Profile biography |
| `phone` | No | Updates the user's phone |
| `dateOfBirth` | No | Doctor's date of birth |
| `name` | No | Updates the user's name |
| `timezone` | No | For example, `Africa/Lagos` |
| `mdcnRegistrationNumber` | No at profile creation | Required before admin can set status to `VERIFIED` |
| `mdcnPracticingLicenseExpiryDate` | No at profile creation | ISO 8601 date; must be in the future for approval |

Example response (representative profile fields):

```json
{
  "_id": "66d482bf4f1a2345bc789050",
  "userId": "66d3f820c741e95642a8b112",
  "currentOrganization": "Lagos General Hospital",
  "specialtyId": "66d3f820c741e95642a8b201",
  "mdcnRegistrationNumber": "MDCN-123456",
  "mdcnPracticingLicenseExpiryDate": "2027-12-31T00:00:00.000Z",
  "verificationStatus": "PENDING",
  "isVerified": false
}
```

The create-profile endpoint returns the created doctor profile directly rather
than the standard `{ success, statusCode, message, data }` envelope.

## 4. Upload verification documents

### `POST {{baseUrl}}/doctors/me/documents`

Headers:

```text
Authorization: Bearer <accessToken>
```

Send a `multipart/form-data` request. The multipart field names must match the
names below exactly:

| Multipart field | Required before approval? | Document |
|---|---:|---|
| `mdcnPracticingLicenseDocument` | Yes | Current MDCN practising licence |
| `governmentIdDocument` | No | Government-issued ID |
| `medicalDegreeDocument` | No | Medical degree certificate |
| `specialtyCertificateDocument` | No | Specialist certificate, when applicable |

Upload limits:

- Send one file per field; multiple document types can be uploaded in one
  request.
- At least one document file must be included in each request.
- Accepted file types: PDF, JPG, JPEG, PNG.
- Maximum size: 20 MB per file.

Example multipart form:

```text
mdcnPracticingLicenseDocument: <file>
governmentIdDocument: <file>
medicalDegreeDocument: <file>
specialtyCertificateDocument: <file>
```

Example response (representative profile fields; the API returns the doctor
profile):

```json
{
  "_id": "66d482bf4f1a2345bc789050",
  "mdcnPracticingLicenseDocument": "uploads/verifications/license-file-key",
  "governmentIdDocument": "uploads/verifications/id-file-key",
  "verificationStatus": "PENDING",
  "isVerified": false
}
```

The upload response contains stored file references. Call
`GET {{baseUrl}}/doctors/me/profile` to retrieve the current profile and
viewable document URLs.

Uploading a verification document resets the doctor to `PENDING` and sets
`isVerified` to `false`.

## 5. Fetch the doctor's profile and review status

### `GET {{baseUrl}}/doctors/me/profile`

Headers:

```text
Authorization: Bearer <accessToken>
```

Use the returned `verificationStatus` to show the doctor their review progress.
The response includes the doctor's profile and may include viewable URLs for
their verification documents.

Status values:

| Status | Meaning |
|---|---|
| `PENDING` | Waiting for admin review |
| `VERIFIED` | Approved by an admin |
| `REJECTED` | Rejected by an admin |
| `SUSPENDED` | Suspended by an admin |

Show `verificationNote`, when present, so the doctor can see the admin's
feedback. Doctors should not be given controls to set their own status.

## 6. Admin review and status update

Admins can review doctors using:

- `GET {{baseUrl}}/doctors/admin/all?status=PENDING` — list pending doctor
  profiles.
- `GET {{baseUrl}}/doctors/admin/:id` — retrieve an individual doctor's
  profile and document links.

To approve or reject a doctor:

### `PATCH {{baseUrl}}/doctors/:id/status`

Admin authorization is required.

Approve request:

```json
{
  "status": "VERIFIED",
  "note": "MDCN details and current practising licence reviewed."
}
```

Reject request:

```json
{
  "status": "REJECTED",
  "note": "Please upload a valid current practising licence."
}
```

Allowed `status` values: `PENDING`, `VERIFIED`, `REJECTED`, `SUSPENDED`.
`note` is optional.

The backend permits `VERIFIED` only when all of the following are true:

1. `mdcnRegistrationNumber` is present.
2. `mdcnPracticingLicenseDocument` has been uploaded.
3. `mdcnPracticingLicenseExpiryDate` is later than the current date.

Example response fields:

```json
{
  "_id": "66d482bf4f1a2345bc789050",
  "verificationStatus": "VERIFIED",
  "verificationNote": "MDCN details and current practising licence reviewed.",
  "isVerified": true
}
```

The status endpoint returns the updated doctor record directly. Refresh the
doctor's profile after a status change to display the latest result.

## 7. Booking availability

Only allow appointment booking when both conditions are true:

```text
verificationStatus === "VERIFIED"
isVerified === true
```

For `PENDING`, `REJECTED`, or `SUSPENDED` doctors, hide or disable the booking
action and show the relevant status to the doctor. The backend also rejects
appointment creation for doctors who are not verified.

## Important re-review behavior

If a doctor changes their MDCN registration number, licence expiry date, or
uploads/replaces a verification document, the backend resets the status to
`PENDING` and `isVerified` to `false`. The doctor must be reviewed again before
they can accept bookings.

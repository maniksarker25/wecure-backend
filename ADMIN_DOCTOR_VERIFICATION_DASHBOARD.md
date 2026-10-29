# Admin Dashboard: Doctor Verification

This handoff describes the admin dashboard screens and API calls for reviewing
doctor profiles and their uploaded verification documents.

## Access and API conventions

- Replace `{{baseUrl}}` with the deployed API base URL.
- All endpoints below require an authenticated admin account.
- Send `Authorization: Bearer <adminAccessToken>` with every request.
- JSON request bodies use `Content-Type: application/json`.
- Use the doctor's profile `_id` in `:id` route parameters, not the user's `_id`.

## 1. Doctor review queue

### Pending doctors

```http
GET {{baseUrl}}/doctors/admin/new-doctors?page=1&limit=10
```

This endpoint returns only doctors whose `verificationStatus` is `PENDING`.

### All doctors and status filters

```http
GET {{baseUrl}}/doctors/admin/all?page=1&limit=10&status=REJECTED
```

Supported `status` filters:

- `PENDING`
- `VERIFIED`
- `REJECTED`
- `SUSPENDED`

Omit `status` to list all doctors.

Example response shape:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Doctors fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789050",
      "currentOrganization": "Lagos General Hospital",
      "specialtyId": {
        "_id": "66d3f820c741e95642a8b201",
        "name": "Cardiology"
      },
      "userId": {
        "_id": "66d3f820c741e95642a8b112",
        "name": "Dr. Ada Okafor",
        "email": "ada@example.com",
        "phone": "+2348012345678"
      },
      "mdcnRegistrationNumber": "MDCN-123456",
      "mdcnPracticingLicenseExpiryDate": "2027-12-31T00:00:00.000Z",
      "verificationStatus": "PENDING",
      "isVerified": false
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

The list also contains doctor services and experience data. The dashboard can
show a compact table with:

- Doctor name and email
- Phone number
- Specialty and current organization
- MDCN registration number
- Licence expiry date
- Verification status
- Profile creation date, if available
- A button to open the full review page

Use the `meta` values for pagination. The default page size is 10.

## 2. Doctor review details

### `GET {{baseUrl}}/doctors/admin/:id`

Example:

```http
GET {{baseUrl}}/doctors/admin/66d482bf4f1a2345bc789050
```

Example response shape:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Doctor details fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789050",
    "currentOrganization": "Lagos General Hospital",
    "specialtyId": {
      "_id": "66d3f820c741e95642a8b201",
      "name": "Cardiology"
    },
    "userId": {
      "_id": "66d3f820c741e95642a8b112",
      "name": "Dr. Ada Okafor",
      "email": "ada@example.com",
      "phone": "+2348012345678"
    },
    "mdcnRegistrationNumber": "MDCN-123456",
    "mdcnPracticingLicenseExpiryDate": "2027-12-31T00:00:00.000Z",
    "mdcnPracticingLicenseDocument": "<viewable-document-url>",
    "governmentIdDocument": "<viewable-document-url>",
    "medicalDegreeDocument": "<viewable-document-url>",
    "specialtyCertificateDocument": "<viewable-document-url>",
    "verificationStatus": "PENDING",
    "verificationNote": "",
    "isVerified": false,
    "services": [],
    "experiences": []
  }
}
```

Some optional fields can be absent or empty when the doctor has not provided
them. The document fields returned by this admin endpoint are viewable URLs;
use them to open or preview the uploaded files. Handle expired or inaccessible
URLs by requesting the doctor details endpoint again.

### Recommended review page

Group the information clearly:

1. **Doctor profile:** name, email, phone, specialty, organization, bio, and
   experience.
2. **MDCN licence:** registration number, expiry date, and a link/preview for
   `mdcnPracticingLicenseDocument`.
3. **Additional documents:** Government ID, degree, and specialty certificate
   links when present.
4. **Review status:** current `verificationStatus` and `verificationNote`.
5. **Admin decision:** status action and an optional note/reason.

Show a clear missing-document state when an optional document URL is absent.
For approval, the MDCN registration number, practising licence file, and a
future licence expiry are mandatory.

## 3. Approve, reject, or suspend

### `PATCH {{baseUrl}}/doctors/:id/status`

Approve:

```json
{
  "status": "VERIFIED",
  "note": "MDCN registration and current practising licence reviewed."
}
```

Reject:

```json
{
  "status": "REJECTED",
  "note": "Please provide a current practising licence."
}
```

Suspend:

```json
{
  "status": "SUSPENDED",
  "note": "Verification requires further review."
}
```

Return to pending:

```json
{
  "status": "PENDING",
  "note": "Awaiting updated licence documents."
}
```

Allowed `status` values are `PENDING`, `VERIFIED`, `REJECTED`, and `SUSPENDED`.
The `note` field is optional. Ask the admin to enter a meaningful note when
rejecting or suspending so the doctor can understand what needs attention.

The backend rejects a `VERIFIED` update unless:

- `mdcnRegistrationNumber` is present.
- `mdcnPracticingLicenseDocument` has been uploaded.
- `mdcnPracticingLicenseExpiryDate` is later than the current date.

Example success response fields:

```json
{
  "_id": "66d482bf4f1a2345bc789050",
  "verificationStatus": "VERIFIED",
  "verificationNote": "MDCN registration and current practising licence reviewed.",
  "isVerified": true
}
```

The status update endpoint returns the updated doctor record directly. After a
successful update, refresh the review details or queue so the status shown is
current. If approval fails, show the API error message and keep the doctor
pending; do not show a success state.

## 4. UI states and actions

| Current status | Suggested dashboard treatment |
|---|---|
| `PENDING` | Show in the review queue; allow admin to open and review |
| `VERIFIED` | Show approved badge; doctor can be bookable |
| `REJECTED` | Show rejected badge and review note |
| `SUSPENDED` | Show suspended badge and review note |

On the review page, provide explicit confirmation before applying a decision.
Disable the submit action while the request is in progress, prevent duplicate
submissions, and display server validation errors next to the relevant
verification information.

After changing a doctor to `VERIFIED`, `REJECTED`, or `SUSPENDED`, refresh the
queue. Rejected or suspended doctors have availability deactivated and upcoming
appointments cancelled by the backend; show a confirmation in the UI before
submitting these decisions so the admin understands the impact.

## 5. Data handling notes

- Do not display verification documents on public doctor profiles.
- Do not show bank account details on the verification review screen. The
  admin detail/list endpoints may include payout-related fields; only display
  the fields required for the review task.
- Document links are intended for authorized admin review. Avoid persisting
  signed URLs longer than needed; request fresh details when a link expires.
- The current API does not provide a verification-history/audit-trail endpoint
  or a dedicated `verifiedBy`/`verifiedAt` response field. Do not present those
  as available until the backend adds them.

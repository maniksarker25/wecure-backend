# WeCure Backend — Complete API Reference Guide

> **Route Prefix Note**: This backend is built with **NestJS**. A global prefix `api` is set in `src/main.ts` (`app.setGlobalPrefix('api')`), so every route below is mounted under `/api`. There is **no version segment** (e.g. no `/v1`).
>
> **Base URL Variable**:
> - **Local Development**: `http://localhost:3010/api` (port from `.env` → `PORT`, default `3010`)
> - **Postman Environment Variable**: `{{baseUrl}}` = `http://localhost:3010/api`
>
> **Response Envelope**: Almost every endpoint returns:
> ```json
> { "success": true, "statusCode": 200, "message": "...", "data": { } }
> ```
> Paginated list endpoints add a `meta` object: `{ "total": 0, "page": 1, "limit": 20, "totalPages": 0 }`.
> A few endpoints (`GET /refunds/:id`, all `/payouts/admin/*` routes, `GET /uploads/stream/*key`) return the raw service result or a piped file **without** this envelope — noted individually below.
>
> **Auth Header**: `Authorization: Bearer <ACCESS_TOKEN>` unless marked `Public`.
>
> **Roles**: `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `USER`. `SUPER_ADMIN` implicitly passes every `@Roles(...)` check in the app.
>
> **Rate Limiting**: A global `ThrottlerGuard` is active. `POST /auth/register`, `/auth/login`, `/auth/verify-reg-otp`, `/auth/verify-reset-otp`, `/auth/reset-password` are throttled to 5 requests/minute; `/auth/resend-otp` and `/auth/send-reset-otp` to 3 requests/minute.

---

## Table of Contents
1. [Authentication (`/auth`)](#1-authentication)
2. [Users (`/users`)](#2-users)
3. [Doctors (`/doctors`)](#3-doctors)
4. [Doctor Availability (`/doctors/me/availability`)](#4-doctor-availability)
5. [Appointments (`/appointments`)](#5-appointments)
6. [Chat (`/chat`)](#6-chat)
7. [Reviews (`/reviews`)](#7-reviews)
8. [Payments (`/payments`)](#8-payments)
9. [Donations (`/donations`)](#9-donations)
10. [Specialists (`/specialist`)](#10-specialists)
11. [Wellness Tips (`/wellness-tips`)](#11-wellness-tips)
12. [Contact Support (`/contact`)](#12-contact-support)
13. [Legal Content (`/legal-content`)](#13-legal-content)
14. [Refunds (`/refunds`)](#14-refunds)
15. [Payouts (`/payouts`)](#15-payouts)
16. [Notifications (`/notifications`)](#16-notifications)
17. [Uploads (`/uploads`)](#17-uploads)
18. [Admin Dashboard (`/admin/dashboard`)](#18-admin-dashboard)
19. [Admin Audit Logs (`/admin/audit-logs`)](#19-admin-audit-logs)

---

## 1. Authentication

### 1.1 Register
- **Route**: `POST {{baseUrl}}/auth/register`
- **Auth**: Public (5 req/min)
- **Body**:
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "Password123!",
  "role": "USER"
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Registration successful, OTP sent to email",
  "data": {
    "email": "john.doe@example.com"
  }
}
```
> Registration creates an account with `isEmailVerified: false` and sends an OTP. Complete signup with **1.6 Verify Registration OTP**. `role` accepts `USER` or `DOCTOR` (admin accounts are created via `POST /users/admin` by a Super Admin, not through this endpoint).

---

### 1.2 Login
- **Route**: `POST {{baseUrl}}/auth/login`
- **Auth**: Public (5 req/min)
- **Body**:
```json
{
  "email": "john.doe@example.com",
  "password": "Password123!"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Login successful",
  "data": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "USER",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```
> Access token expires per `JWT_ACC_EXPIRATION` (default `5d`); refresh token per `JWT_REF_EXPIRATION` (default `7d`). JWT payload: `{ userId, role, email, doctorId? }`.

---

### 1.3 Refresh Access Token
- **Route**: `POST {{baseUrl}}/auth/refresh`
- **Auth**: `Bearer <REFRESH_TOKEN>` (validated by a dedicated refresh-token strategy)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 1.4 Logout
- **Route**: `POST {{baseUrl}}/auth/logout`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body** *(optional — removes an FCM token registered on this device)*:
```json
{
  "fcmToken": "device-fcm-token-string"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 1.5 Resend OTP
- **Route**: `POST {{baseUrl}}/auth/resend-otp`
- **Auth**: Public (3 req/min)
- **Body**:
```json
{
  "email": "john.doe@example.com"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "OTP resent successfully"
}
```

---

### 1.6 Verify Registration OTP
- **Route**: `POST {{baseUrl}}/auth/verify-reg-otp`
- **Auth**: Public (5 req/min)
- **Body**:
```json
{
  "email": "john.doe@example.com",
  "otp": "123456"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "USER",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 1.7 Send Password-Reset OTP
- **Route**: `POST {{baseUrl}}/auth/send-reset-otp`
- **Auth**: Public (3 req/min)
- **Body**:
```json
{
  "email": "john.doe@example.com"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Password reset OTP sent to email"
}
```

---

### 1.8 Verify Password-Reset OTP
- **Route**: `POST {{baseUrl}}/auth/verify-reset-otp`
- **Auth**: Public (5 req/min)
- **Body**:
```json
{
  "email": "john.doe@example.com",
  "otp": "123456"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 1.9 Reset Password
- **Route**: `POST {{baseUrl}}/auth/reset-password`
- **Auth**: Public (5 req/min)
- **Body**:
```json
{
  "email": "john.doe@example.com",
  "otp": "123456",
  "newPassword": "NewSecurePassword123!"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Password reset successfully"
}
```

---

## 2. Users

### 2.1 Get My Profile
- **Route**: `GET {{baseUrl}}/users/me`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (any role)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Profile fetched successfully",
  "data": {
    "_id": "66d3f820c741e95642a8b111",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+2348012345678",
    "role": "USER",
    "status": "ACTIVE",
    "isEmailVerified": true,
    "dateOfBirth": "1998-05-12",
    "profileImage": "https://your-public-bucket.s3.region.amazonaws.com/user-profiles/john-1725192800.jpg",
    "allergies": ["Peanuts", "Penicillin"],
    "bloodGroup": "O+",
    "timezone": "Africa/Lagos"
  }
}
```

---

### 2.2 Update My Profile (With Avatar Upload)
- **Route**: `PATCH {{baseUrl}}/users/profile`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body Format**: `multipart/form-data`
- **Form Data Fields**:
  - `image` *(File, optional)*: Profile picture — uploaded to the public S3 bucket, `user-profiles` folder
  - `name` *(Text, optional)*
  - `phone` *(Text, optional)*
  - `dateOfBirth` *(Text, optional)*: ISO 8601 date
  - `allergies` *(Text[], optional)*
  - `bloodGroup` *(Text, optional)*: `"A+"` | `"A-"` | `"B+"` | `"B-"` | `"AB+"` | `"AB-"` | `"O+"` | `"O-"`
  - `timezone` *(Text, optional)*: IANA timezone string, e.g. `"Africa/Lagos"`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "_id": "66d3f820c741e95642a8b111",
    "name": "John Doe",
    "profileImage": "https://your-public-bucket.s3.region.amazonaws.com/user-profiles/john-1725193000.jpg"
  }
}
```

---

### 2.3 Change Password
- **Route**: `POST {{baseUrl}}/users/change-password`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body**:
```json
{
  "oldPassword": "Password123!",
  "newPassword": "NewPassword456!"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 2.4 Add / Update My Bank Details
- **Route**: `PATCH {{baseUrl}}/users/me/bank-details`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body**:
```json
{
  "bankName": "Access Bank",
  "accountName": "John Doe",
  "accountNumber": "0123456789"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Bank details saved successfully"
}
```

---

### 2.5 Get My Bank Details
- **Route**: `GET {{baseUrl}}/users/me/bank-details`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Bank details fetched successfully",
  "data": {
    "bankName": "Access Bank",
    "accountName": "John Doe",
    "accountNumber": "0123456789"
  }
}
```

---

### 2.6 Delete My Account
- **Route**: `DELETE {{baseUrl}}/users/profile`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Account deleted successfully"
}
```

---

### 2.7 Create Admin (Super Admin Only)
- **Route**: `POST {{baseUrl}}/users/admin`
- **Auth**: `Bearer <SUPER_ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "name": "Alex Smith",
  "email": "alex.admin@wecure.com",
  "password": "SecurePassword123!"
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Admin created successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789601",
    "name": "Alex Smith",
    "email": "alex.admin@wecure.com",
    "role": "ADMIN"
  }
}
```

---

### 2.8 Get All Users (Admin)
- **Route**: `GET {{baseUrl}}/users`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `role` *(optional, `USER`|`DOCTOR`|`ADMIN`)*, `search` *(optional, name/email)*, `page` *(default 1)*, `limit` *(default 20)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Users fetched successfully",
  "data": [
    {
      "_id": "66d3f820c741e95642a8b111",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "USER",
      "status": "ACTIVE",
      "createdAt": "2026-08-20T10:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 2.9 Get Single User (Admin)
- **Route**: `GET {{baseUrl}}/users/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "User fetched successfully",
  "data": {
    "_id": "66d3f820c741e95642a8b111",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

---

### 2.10 Toggle User Status (Admin)
- **Route**: `PATCH {{baseUrl}}/users/:id/toggle-status`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "User status updated successfully",
  "data": {
    "_id": "66d3f820c741e95642a8b111",
    "status": "BLOCKED"
  }
}
```
*(`status` enum: `PENDING`, `ACTIVE`, `REJECTED`, `BLOCKED`, `INACTIVE`)*

---

### 2.11 Change User Role (Admin)
- **Route**: `PATCH {{baseUrl}}/users/:id/role`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "role": "DOCTOR"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Role updated successfully",
  "data": {
    "_id": "66d3f820c741e95642a8b111",
    "role": "DOCTOR"
  }
}
```

---

### 2.12 Register FCM Token
- **Route**: `PATCH {{baseUrl}}/users/fcm-token`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body**:
```json
{
  "token": "device-fcm-token-string"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "FCM token registered successfully"
}
```

---

### 2.13 Remove FCM Token
- **Route**: `DELETE {{baseUrl}}/users/fcm-token`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body**:
```json
{
  "token": "device-fcm-token-string"
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "FCM token removed successfully"
}
```

---

## 3. Doctors

### 3.1 Create My Doctor Profile
- **Route**: `POST {{baseUrl}}/doctors/me/profile`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Body**:
```json
{
  "currentOrganization": "Lagos General Hospital",
  "specialtyId": "66d3f820c741e95642a8b201",
  "experienceYears": 6,
  "about": "Board-certified cardiologist with 6 years of clinical experience.",
  "phone": "+2348012345678",
  "dateOfBirth": "1990-03-14",
  "mdcnRegistrationNumber": "MDCN-123456",
  "mdcnPracticingLicenseExpiryDate": "2027-12-31",
  "timezone": "Africa/Lagos"
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Doctor profile created successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789050",
    "userId": "66d3f820c741e95642a8b112",
    "currentOrganization": "Lagos General Hospital",
    "specialtyId": "66d3f820c741e95642a8b201",
    "verificationStatus": "PENDING",
    "isVerified": false
  }
}
```

---

### 3.2 Update My Doctor Profile (With Image)
- **Route**: `PATCH {{baseUrl}}/doctors/me/profile`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Body Format**: `multipart/form-data`
- **Form Data Fields**:
  - `image` *(File, optional)*: `.jpg`, `.jpeg`, `.png`, `.webp`, max 5MB
  - `currentOrganization`, `about`, `phone`, `experienceYears`, `specialtyId` *(all optional Text)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Doctor profile updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789050",
    "about": "Updated bio text"
  }
}
```

---

### 3.3 Get My Doctor Profile
- **Route**: `GET {{baseUrl}}/doctors/me/profile`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Doctor profile fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789050",
    "userId": "66d3f820c741e95642a8b112",
    "currentOrganization": "Lagos General Hospital",
    "specialtyId": "66d3f820c741e95642a8b201",
    "verificationStatus": "VERIFIED",
    "isVerified": true,
    "totalEarnings": 450000,
    "totalPayouts": 400000,
    "pendingPayouts": 50000
  }
}
```

---

### 3.4 Add a Service
- **Route**: `POST {{baseUrl}}/doctors/me/services`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (Doctor)
- **Body**:
```json
{
  "name": "Cardiac Consultation"
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Service added successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789060",
    "doctorId": "66d482bf4f1a2345bc789050",
    "name": "Cardiac Consultation"
  }
}
```

---

### 3.5 Remove a Service
- **Route**: `DELETE {{baseUrl}}/doctors/me/services/:id`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (Doctor)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Service removed successfully"
}
```

---

### 3.6 Upload Verification Documents
- **Route**: `POST {{baseUrl}}/doctors/me/documents`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Body Format**: `multipart/form-data`
- **Form Data Fields**:
  - `mdcnPracticingLicenseDocument` *(File, required before admin approval)*: current MDCN Annual Practising Licence
  - `governmentIdDocument` *(File, optional)*: government-issued ID
  - `medicalDegreeDocument` *(File, optional)*: medical degree certificate
  - `specialtyCertificateDocument` *(File, optional)*: specialty certificate, if applicable
  - Each field accepts one `.pdf`, `.jpg`, `.jpeg`, or `.png` file, up to 20MB
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Documents uploaded successfully",
  "data": {
    "mdcnPracticingLicenseDocument": "uploads/verifications/license-1725193400.pdf",
    "governmentIdDocument": "uploads/verifications/id-1725193400.jpg"
  }
}
```

`mdcnRegistrationNumber` and `mdcnPracticingLicenseExpiryDate` are submitted as doctor profile fields. Admins can only set the verification status to `VERIFIED` when the registration number, licence document, and an unexpired licence are present.

---

### 3.7 List My Experiences
- **Route**: `GET {{baseUrl}}/doctors/me/experiences`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (Doctor)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Experiences fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789070",
      "organizationName": "Lagos General Hospital",
      "designation": "Resident Cardiologist",
      "startDate": "2020-01-01T00:00:00.000Z",
      "isCurrent": true
    }
  ]
}
```

---

### 3.8 Add Experience
- **Route**: `POST {{baseUrl}}/doctors/me/experiences`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (Doctor)
- **Body**:
```json
{
  "organizationName": "St. Nicholas Hospital",
  "designation": "Senior Cardiologist",
  "startDate": "2023-02-01",
  "isCurrent": true
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Experience added successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789071",
    "organizationName": "St. Nicholas Hospital",
    "designation": "Senior Cardiologist",
    "startDate": "2023-02-01T00:00:00.000Z",
    "isCurrent": true
  }
}
```

---

### 3.9 Update Experience
- **Route**: `PATCH {{baseUrl}}/doctors/me/experiences/:id`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (Doctor)
- **Body**:
```json
{
  "endDate": "2026-01-01",
  "isCurrent": false
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Experience updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789071",
    "isCurrent": false
  }
}
```

---

### 3.10 Delete Experience
- **Route**: `DELETE {{baseUrl}}/doctors/me/experiences/:id`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (Doctor)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Experience deleted successfully"
}
```

---

### 3.11 Add My Bank Details (Doctor)
- **Route**: `POST {{baseUrl}}/doctors/me/bank-details`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Body**:
```json
{
  "bankName": "Access Bank",
  "accountName": "Dr. Jane Smith",
  "accountNumber": "0123456789",
  "bankCode": "044"
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Bank details added successfully",
  "data": {
    "bankName": "Access Bank",
    "accountNumber": "0123456789",
    "paystackRecipientCode": "RCP_xxxxxxxxxxxx"
  }
}
```
> `accountNumber` must be exactly 10 digits. Saving bank details triggers Paystack transfer-recipient creation (`paystackRecipientCode`).

---

### 3.12 Get My Bank Details (Doctor)
- **Route**: `GET {{baseUrl}}/doctors/me/bank-details`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Bank details fetched successfully",
  "data": {
    "bankName": "Access Bank",
    "accountName": "Dr. Jane Smith",
    "accountNumber": "0123456789"
  }
}
```

---

### 3.13 Get Newly Registered Doctors (Admin)
- **Route**: `GET {{baseUrl}}/doctors/admin/new-doctors`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `page`, `limit` *(optional — `status` is forced to `PENDING` server-side)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "New doctors fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789050",
      "currentOrganization": "Lagos General Hospital",
      "verificationStatus": "PENDING",
      "userId": { "name": "Dr. Jane Smith", "email": "jane@example.com" }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 3.14 Get All Doctors (Admin)
- **Route**: `GET {{baseUrl}}/doctors/admin/all`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `page`, `limit`, `status` *(`PENDING`|`VERIFIED`|`REJECTED`|`SUSPENDED`, optional)*
- **Success Response (200 OK)**: Same shape as 3.13, unfiltered by default.

---

### 3.15 Get Doctor Details (Admin)
- **Route**: `GET {{baseUrl}}/doctors/admin/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Doctor fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789050",
    "currentOrganization": "Lagos General Hospital",
    "verificationStatus": "PENDING",
    "mdcnRegistrationNumber": "MDCN-123456",
    "mdcnPracticingLicenseExpiryDate": "2027-12-31T00:00:00.000Z",
    "mdcnPracticingLicenseDocument": "https://example.com/signed-license-url",
    "governmentIdDocument": "https://example.com/signed-id-url"
  }
}
```

---

### 3.16 Update Doctor Verification Status (Admin)
- **Route**: `PATCH {{baseUrl}}/doctors/:id/status`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "status": "VERIFIED",
  "note": "All documents checked and confirmed."
}
```
*(`status` options: `PENDING`, `VERIFIED`, `REJECTED`, `SUSPENDED`)*
> Setting `VERIFIED` requires an MDCN registration number, a practising licence document, and an expiry date later than today. Changing the registration number, licence expiry, or any verification document returns the doctor to `PENDING`.
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Doctor verification status updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789050",
    "verificationStatus": "VERIFIED",
    "isVerified": true
  }
}
```
> Triggers a `DOCTOR_VERIFIED`, `DOCTOR_REJECTED`, or `DOCTOR_SUSPENDED` notification to the doctor.

---

### 3.17 Get Popular Doctors
- **Route**: `GET {{baseUrl}}/doctors/popular`
- **Auth**: Public
- **Query Parameters**: `q`, `page`, `limit`, `specialtyId` *(all optional)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Popular doctors fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789050",
      "userId": { "name": "Dr. Jane Smith", "profileImage": "..." },
      "currentOrganization": "Lagos General Hospital",
      "rating": 4.8
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 3.18 Get Doctors by Specialty
- **Route**: `GET {{baseUrl}}/doctors/specialty/:specialtyId`
- **Auth**: Public
- **Query Parameters**: `q`, `page`, `limit` *(optional)*
- **Success Response (200 OK)**: Same list shape as 3.17.

---

### 3.19 Get Public Doctor Profile
- **Route**: `GET {{baseUrl}}/doctors/:id/public`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Doctor profile fetched successfully",
  "data": {
    "doctor": {
      "_id": "66d482bf4f1a2345bc789050",
      "currentOrganization": "Lagos General Hospital",
      "about": "Board-certified cardiologist...",
      "userId": {
        "name": "Dr. Jane Smith",
        "email": "jane@example.com",
        "profileImage": "...",
        "timezone": "Africa/Lagos"
      },
      "specialtyId": { "name": "Cardiology" },
      "totalExperienceYears": 6
    },
    "services": [{ "_id": "66d482bf4f1a2345bc789060", "name": "Cardiac Consultation" }],
    "experiences": [{ "organizationName": "Lagos General Hospital", "designation": "Resident Cardiologist" }],
    "rating": { "average": 4.8, "total": 24, "breakdown": { "1": 0, "2": 1, "3": 1, "4": 6, "5": 16 } },
    "reviews": [{ "rating": 5, "reviewText": "Excellent care!" }],
    "availability": [{ "dayOfWeek": "MONDAY", "startTime": "09:00", "endTime": "17:00", "fee": 5000 }]
  }
}
```

---

### 3.20 Search Doctors
- **Route**: `GET {{baseUrl}}/doctors/search`
- **Auth**: Public
- **Query Parameters**: `q`, `page`, `limit`, `specialtyId` *(all optional)*
- **Success Response (200 OK)**: Same list shape as 3.17.

---

## 4. Doctor Availability

All routes below are mounted at `{{baseUrl}}/doctors/me/availability` and require `Bearer <DOCTOR_JWT_TOKEN>`.

### 4.1 Create Availability
- **Route**: `POST {{baseUrl}}/doctors/me/availability`
- **Body**:
```json
{
  "days": ["MONDAY", "WEDNESDAY", "FRIDAY"],
  "slotSizeMinutes": 30,
  "startTime": "09:00",
  "endTime": "17:00",
  "fee": 5000
}
```
*(`days` options: `MONDAY`–`SUNDAY`. One availability document is created per day. `fee` minimum is 50, the Paystack minimum charge.)*
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Availability created successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789080",
      "dayOfWeek": "MONDAY",
      "startTime": "09:00",
      "endTime": "17:00",
      "slotSizeMinutes": 30,
      "fee": 5000,
      "isActive": true
    }
  ]
}
```

---

### 4.2 Get My Availability
- **Route**: `GET {{baseUrl}}/doctors/me/availability`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Availability fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789080",
      "dayOfWeek": "MONDAY",
      "startTime": "09:00",
      "endTime": "17:00",
      "fee": 5000,
      "isActive": true
    }
  ]
}
```

---

### 4.3 Toggle Availability Active State
- **Route**: `PATCH {{baseUrl}}/doctors/me/availability/:id`
- **Body**:
```json
{
  "isActive": false
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Availability toggled successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789080",
    "isActive": false
  }
}
```

---

### 4.4 Edit Availability
- **Route**: `PATCH {{baseUrl}}/doctors/me/availability/:id/edit`
- **Body**:
```json
{
  "startTime": "10:00",
  "endTime": "18:00",
  "fee": 5500
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Availability updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789080",
    "startTime": "10:00",
    "endTime": "18:00",
    "fee": 5500
  }
}
```

---

### 4.5 Delete Availability
- **Route**: `DELETE {{baseUrl}}/doctors/me/availability/:id`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Availability deleted successfully"
}
```

---

## 5. Appointments

### 5.1 Create Appointment
- **Route**: `POST {{baseUrl}}/appointments`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `payNow` *(optional, `true`/`false`)* — when `true`, a Paystack transaction is initialized immediately and returned alongside the appointment.
- **Body Format**: `multipart/form-data` (supports optional file attachments) or `application/json`
- **Form/Body Fields**:
```json
{
  "doctorId": "66d482bf4f1a2345bc789050",
  "specialistId": "66d3f820c741e95642a8b201",
  "appointmentDate": "2026-09-25",
  "appointmentTime": "10:00",
  "reasonTitle": "Follow-up consultation",
  "reasonDetails": "Chest pain follow-up after last visit.",
  "attachmentIds": []
}
```
- `attachment` *(File[], optional, multipart field)*: supporting documents/images
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Appointment created successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789100",
    "userId": "66d3f820c741e95642a8b111",
    "doctorId": "66d482bf4f1a2345bc789050",
    "appointmentDate": "2026-09-25T00:00:00.000Z",
    "appointmentTime": "10:00",
    "appointmentEndTime": "10:30",
    "status": "PENDING",
    "consultationFee": 5000
  },
  "payment": {
    "authorization_url": "https://checkout.paystack.com/xxxxxxxx",
    "reference": "wecure_xxxxxxxxxx"
  }
}
```
> `payment` is only present when `?payNow=true` was passed.

---

### 5.2 Get My Appointments
- **Route**: `GET {{baseUrl}}/appointments/me`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `status`, `page`, `limit` *(optional)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Appointments fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789100",
      "doctorId": { "userId": { "name": "Dr. Jane Smith" }, "currentOrganization": "Lagos General Hospital" },
      "appointmentDate": "2026-09-25T00:00:00.000Z",
      "appointmentTime": "10:00",
      "status": "UPCOMING"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 5.3 Get My Appointment Details
- **Route**: `GET {{baseUrl}}/appointments/me/:id`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Appointment details fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789100",
    "status": "UPCOMING",
    "reasonTitle": "Follow-up consultation",
    "consultationFee": 5000,
    "attachments": []
  }
}
```

---

### 5.4 Cancel My Appointment
- **Route**: `PATCH {{baseUrl}}/appointments/me/:id/cancel`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Appointment cancelled successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789100",
    "status": "CANCELLED"
  }
}
```
> Triggers an automatic refund flow (90% of the fee is refunded per `PATIENT_CANCELLATION_REFUND_PERCENT`, see [Refunds](#14-refunds)).

---

### 5.5 Get Available Dates
- **Route**: `GET {{baseUrl}}/appointments/available-dates`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `doctorId` *(required)*, `days` *(optional, how many days ahead to compute)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Available dates fetched successfully",
  "data": ["2026-09-22", "2026-09-24", "2026-09-25"]
}
```

---

### 5.6 Get Available Slots
- **Route**: `GET {{baseUrl}}/appointments/available-slots`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `doctorId` *(required)*, `date` *(required, `YYYY-MM-DD`)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Available slots fetched successfully",
  "data": ["09:00", "09:30", "10:00", "10:30"]
}
```

---

### 5.7 Get All Appointments (Admin)
- **Route**: `GET {{baseUrl}}/appointments/admin/all`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `status`, `page`, `limit` *(optional)*
- **Success Response (200 OK)**: List shape identical to 5.2, `meta` included.

---

### 5.8 Get Appointment Details (Admin)
- **Route**: `GET {{baseUrl}}/appointments/admin/details/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**: Same shape as 5.3.

---

### 5.9 Get Doctor's Appointments (Admin)
- **Route**: `GET {{baseUrl}}/appointments/admin/doctor/:doctorId`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `status`, `page`, `limit` *(optional)*
- **Success Response (200 OK)**: List shape identical to 5.2.

---

### 5.10 Doctor Dashboard Stats
- **Route**: `GET {{baseUrl}}/appointments/doctor/dashboard`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Dashboard stats fetched successfully",
  "data": {
    "totalAppointments": 42,
    "upcomingAppointments": 5,
    "completedAppointments": 35,
    "cancelledAppointments": 2,
    "totalEarnings": 175000
  }
}
```

---

### 5.11 Get My Appointments (Doctor, Simple)
- **Route**: `GET {{baseUrl}}/appointments/doctor/me`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Query Parameters**: `status`, `page`, `limit` *(optional)*
- **Success Response (200 OK)**: List shape identical to 5.2.

---

### 5.12 Get My Appointments (Doctor, Full)
- **Route**: `GET {{baseUrl}}/appointments/doctor`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Query Parameters**: `status`, `page`, `limit` *(optional)*
- **Success Response (200 OK)**: List shape identical to 5.2, with fuller patient/appointment detail.

---

### 5.13 Get Appointment Details (Doctor)
- **Route**: `GET {{baseUrl}}/appointments/doctor/:id`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Success Response (200 OK)**: Same shape as 5.3.

---

### 5.14 Reject Appointment (Doctor)
- **Route**: `POST {{baseUrl}}/appointments/doctor/:id/reject`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Body**:
```json
{
  "reason": "Not available at the requested time."
}
```
*(`reason` optional, max 500 characters)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Appointment rejected successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789100",
    "status": "CANCELLED"
  }
}
```

---

### 5.15 Update Appointment Status
- **Route**: `PATCH {{baseUrl}}/appointments/:id/status`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (any authenticated role — USER, DOCTOR, or ADMIN)
- **Body**:
```json
{
  "status": "ONGOING"
}
```
*(`status` options: `PENDING`, `UPCOMING`, `ONGOING`, `CANCELLED`, `COMPLETED`)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Appointment status updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789100",
    "status": "ONGOING"
  }
}
```

---

### 5.16 Create Attachment (Standalone)
- **Route**: `POST {{baseUrl}}/appointments/attachments`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (USER or DOCTOR)
- **Body Format**: `multipart/form-data`
- **Form Data Fields**: `attachment` *(File, required)*
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Attachment uploaded successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789110",
    "fileKey": "appointments/attachment-1725193500.pdf",
    "fileType": "application/pdf"
  }
}
```

---

### 5.17 Add Attachment to an Appointment
- **Route**: `POST {{baseUrl}}/appointments/:id/attachments`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (any authenticated role)
- **Body Format**: `multipart/form-data`
- **Form Data Fields**: `attachment` *(File, required)*
- **Success Response (201 Created)**: Same shape as 5.16, with `appointmentId` populated.

---

### 5.18 Get Video Call Token (Agora)
- **Route**: `GET {{baseUrl}}/appointments/:id/video/token`
- **Auth**: `Bearer <USER_JWT_TOKEN>` — enforced by `AppointmentAccessGuard` (must be the patient, the assigned doctor, or an admin; also checks a ±5-minute window around the appointment time)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Video token generated successfully",
  "data": {
    "token": "006wecure...",
    "channelName": "appointment-66d482bf4f1a2345bc789100",
    "uid": 123456,
    "appId": "your-agora-app-id"
  }
}
```

---

### 5.19 Get Chat Token (Agora)
- **Route**: `GET {{baseUrl}}/appointments/:id/chat/token`
- **Auth**: `Bearer <USER_JWT_TOKEN>` — enforced by `AppointmentAccessGuard`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Chat token generated successfully",
  "data": {
    "token": "006wecure...",
    "userAccount": "66d3f820c741e95642a8b111"
  }
}
```

---

## 6. Chat

> **Note**: In addition to the REST endpoints below, real-time messaging is also served over a Socket.IO gateway (`src/modules/chat/chat.gateway.ts`), not documented here.

### 6.1 Upload Chat Image
- **Route**: `POST {{baseUrl}}/chat/upload`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body Format**: `multipart/form-data`
- **Form Data Fields**: `image` *(File, required)* — uploaded to the public bucket, `chat` folder
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "url": "https://your-public-bucket.s3.region.amazonaws.com/chat/img-1725193600.jpg"
  }
}
```

---

### 6.2 Get My Conversations
- **Route**: `GET {{baseUrl}}/chat/conversations`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `appointmentId` *(optional)*, `page` *(default 1)*, `limit` *(default 20)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversations fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789120",
      "participants": [
        { "id": "66d3f820c741e95642a8b111", "role": "USER" },
        { "id": "66d3f820c741e95642a8b112", "role": "DOCTOR" }
      ],
      "appointmentId": "66d482bf4f1a2345bc789100",
      "meta": { "lastActivityAt": "2026-09-01T12:00:00.000Z" }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 6.3 Get Messages in a Conversation
- **Route**: `GET {{baseUrl}}/chat/messages/:conversationId`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `page` *(default 1)*, `limit` *(default 50)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Messages fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789130",
      "sender": { "id": "66d3f820c741e95642a8b111", "role": "USER" },
      "receiver": { "id": "66d3f820c741e95642a8b112", "role": "DOCTOR" },
      "text": "Good morning doctor, I have a question about my prescription.",
      "images": [],
      "seen": false,
      "createdAt": "2026-09-01T08:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 50, "totalPages": 1 }
}
```

---

### 6.4 Get Messages With a Specific User
- **Route**: `GET {{baseUrl}}/chat/messages-by-user/:userId`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `page` *(default 1)*, `limit` *(default 50)*
- **Success Response (200 OK)**: Same shape as 6.3.

---

### 6.5 Mark Conversation as Read
- **Route**: `POST {{baseUrl}}/chat/read/:conversationId`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation marked as read"
}
```

---

## 7. Reviews

### 7.1 Create a Review
- **Route**: `POST {{baseUrl}}/reviews`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Body**:
```json
{
  "appointmentId": "66d482bf4f1a2345bc789100",
  "rating": 5,
  "reviewText": "Excellent bedside manner and very thorough."
}
```
*(`rating` is required, integer 1–5; `appointmentId` must not already have a review — one review per appointment)*
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Review created successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789140",
    "appointmentId": "66d482bf4f1a2345bc789100",
    "userId": "66d3f820c741e95642a8b111",
    "doctorId": "66d482bf4f1a2345bc789050",
    "rating": 5,
    "reviewText": "Excellent bedside manner and very thorough."
  }
}
```

---

### 7.2 Get Reviews for a Doctor
- **Route**: `GET {{baseUrl}}/reviews/doctor/:doctorId`
- **Auth**: Public
- **Query Parameters**: `page`, `limit` *(optional)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Doctor reviews fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789140",
      "rating": 5,
      "reviewText": "Excellent bedside manner and very thorough.",
      "userId": { "name": "John Doe" }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 7.3 Get All Reviews
- **Route**: `GET {{baseUrl}}/reviews`
- **Auth**: Public
- **Query Parameters**: `page`, `limit` *(optional)*
- **Success Response (200 OK)**: Same list shape as 7.2.

---

### 7.4 Get Review by ID
- **Route**: `GET {{baseUrl}}/reviews/:id`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Review fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789140",
    "rating": 5,
    "reviewText": "Excellent bedside manner and very thorough."
  }
}
```

---

### 7.5 Update Review (Admin)
- **Route**: `PATCH {{baseUrl}}/reviews/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "reviewText": "Edited for policy compliance."
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Review updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789140",
    "reviewText": "Edited for policy compliance."
  }
}
```

---

### 7.6 Delete Review (Admin)
- **Route**: `DELETE {{baseUrl}}/reviews/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Review deleted successfully"
}
```

---

## 8. Payments

Payments are processed via **Paystack**.

### 8.1 Initialize Appointment Payment
- **Route**: `POST {{baseUrl}}/payments/appointments/:appointmentId/initialize`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Payment initialized successfully",
  "data": {
    "authorization_url": "https://checkout.paystack.com/xxxxxxxx",
    "access_code": "xxxxxxxx",
    "reference": "wecure_xxxxxxxxxx"
  }
}
```

---

### 8.2 Initialize Donation Payment
- **Route**: `POST {{baseUrl}}/payments/donations/initialize`
- **Auth**: Public
- **Body**:
```json
{
  "email": "donor@example.com",
  "amount": 10000,
  "userId": "66d3f820c741e95642a8b111"
}
```
*(`userId` optional — for anonymous donations, omit it)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Donation payment initialized successfully",
  "data": {
    "authorization_url": "https://checkout.paystack.com/xxxxxxxx",
    "reference": "wecure_donation_xxxxxxxxxx"
  }
}
```

---

### 8.3 Paystack Webhook
- **Route**: `POST {{baseUrl}}/payments/webhook/paystack`
- **Auth**: None (verified via the `x-paystack-signature` header against `PAYSTACK_WEBHOOK_SECRET`, using the raw request body)
- **Body**: Raw Paystack event payload (e.g. `charge.success`)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Webhook processed successfully"
}
```
> This endpoint is called by Paystack directly, never by app clients. On `charge.success` it marks the related `Payment`/`Donation` as `PAID` and updates the linked `Appointment` status.

---

## 9. Donations

> **Note**: `CreateDonationDto` and `UpdateDonationDto` currently define no validated fields. With the app's global `forbidNonWhitelisted: true` validation pipe, extra body fields on `POST`/`PATCH /donations` may be stripped or rejected — verify the current DTOs before relying on this in a client integration.

### 9.1 Create Donation Record
- **Route**: `POST {{baseUrl}}/donations`
- **Auth**: Public
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Donation created successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789150",
    "amount": 10000,
    "currency": "NGN",
    "status": "PENDING"
  }
}
```

---

### 9.2 Get All Donations
- **Route**: `GET {{baseUrl}}/donations`
- **Auth**: Public
- **Query Parameters**: `page`, `limit`, `status` *(optional)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Donations fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789150",
      "amount": 10000,
      "currency": "NGN",
      "status": "PAID"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 9.3 Get Donation by ID
- **Route**: `GET {{baseUrl}}/donations/:id`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Donation fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789150",
    "amount": 10000,
    "status": "PAID"
  }
}
```

---

### 9.4 Update Donation
- **Route**: `PATCH {{baseUrl}}/donations/:id`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Donation updated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789150"
  }
}
```

---

### 9.5 Delete Donation
- **Route**: `DELETE {{baseUrl}}/donations/:id`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Donation deleted successfully"
}
```

---

## 10. Specialists

Specialists represent the medical specialties/categories doctors can be tagged with (e.g. Cardiology, Dermatology).

### 10.1 Create Specialist (Admin)
- **Route**: `POST {{baseUrl}}/specialist`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body Format**: `multipart/form-data`
- **Form Data Fields**:
  - `image` *(File, optional)*: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, max 10MB
  - `name` *(Text, required)*
  - `description` *(Text, optional)*
  - `isActive` *(Text, optional, `"true"`/`"false"`)*
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Specialist created successfully",
  "data": {
    "_id": "66d3f820c741e95642a8b201",
    "name": "Cardiology",
    "description": "Heart and cardiovascular system specialists.",
    "thumbnail": "https://your-public-bucket.s3.region.amazonaws.com/specialists/cardiology.jpg",
    "isActive": true
  }
}
```

---

### 10.2 Get All Specialists
- **Route**: `GET {{baseUrl}}/specialist`
- **Auth**: Public
- **Query Parameters**: `page`, `limit`, `search` *(optional)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Specialists fetched successfully",
  "data": [
    { "_id": "66d3f820c741e95642a8b201", "name": "Cardiology", "isActive": true }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 10.3 Get Specialist by ID
- **Route**: `GET {{baseUrl}}/specialist/:id`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Specialist fetched successfully",
  "data": { "_id": "66d3f820c741e95642a8b201", "name": "Cardiology" }
}
```

---

### 10.4 Update Specialist (Admin)
- **Route**: `PATCH {{baseUrl}}/specialist/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body Format**: `multipart/form-data` (same fields as 10.1, all optional)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Specialist updated successfully",
  "data": { "_id": "66d3f820c741e95642a8b201", "name": "Cardiology & Vascular" }
}
```

---

### 10.5 Delete Specialist (Admin)
- **Route**: `DELETE {{baseUrl}}/specialist/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Specialist deleted successfully"
}
```

---

## 11. Wellness Tips

### 11.1 Like / Unlike a Wellness Tip
- **Route**: `PATCH {{baseUrl}}/wellness-tips/:id/like`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Wellness tip like toggled successfully",
  "data": { "liked": true, "likeCount": 12 }
}
```

---

### 11.2 Create Wellness Tip (Admin)
- **Route**: `POST {{baseUrl}}/wellness-tips`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "content": "Drink at least 8 glasses of water a day to stay properly hydrated.",
  "isActive": true
}
```
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Wellness tip created successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789160",
    "content": "Drink at least 8 glasses of water a day to stay properly hydrated.",
    "isActive": true
  }
}
```

---

### 11.3 Get All Wellness Tips
- **Route**: `GET {{baseUrl}}/wellness-tips`
- **Auth**: Public (optionally authenticated — pass a token to get personalized `liked` state)
- **Query Parameters**: `page`, `limit` *(optional)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Wellness tips fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789160",
      "content": "Drink at least 8 glasses of water a day to stay properly hydrated.",
      "likeCount": 12,
      "liked": false
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 11.4 Get Wellness Tip by ID
- **Route**: `GET {{baseUrl}}/wellness-tips/:id`
- **Auth**: Public (optionally authenticated)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Wellness tip fetched successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789160",
    "content": "Drink at least 8 glasses of water a day to stay properly hydrated.",
    "liked": true
  }
}
```

---

### 11.5 Update Wellness Tip (Admin)
- **Route**: `PATCH {{baseUrl}}/wellness-tips/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "content": "Updated tip content.",
  "isActive": false
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Wellness tip updated successfully",
  "data": { "_id": "66d482bf4f1a2345bc789160", "isActive": false }
}
```

---

### 11.6 Delete Wellness Tip (Admin)
- **Route**: `DELETE {{baseUrl}}/wellness-tips/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Wellness tip deleted successfully"
}
```

---

## 12. Contact Support

### 12.1 Submit a Support Message
- **Route**: `POST {{baseUrl}}/contact`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (USER, DOCTOR, or ADMIN)
- **Body Format**: `multipart/form-data`
- **Form Data Fields**:
  - `name` *(Text, required, min 2 chars)*
  - `email` *(Text, required)*
  - `message` *(Text, required, min 10 chars)*
  - `attachment` *(File, optional)* — uploaded to the private bucket, `support` folder
- **Success Response (201 Created)**:
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Support message submitted successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789170",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "message": "I'm having trouble joining my video call.",
    "status": "PENDING"
  }
}
```

---

### 12.2 Get All Support Messages (Admin)
- **Route**: `GET {{baseUrl}}/contact`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `status`, `page`, `limit` *(optional; `status` enum: `PENDING`, `IN_PROGRESS`, `RESOLVED`)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Support messages fetched successfully",
  "data": [
    { "_id": "66d482bf4f1a2345bc789170", "name": "John Doe", "status": "PENDING" }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### 12.3 Get My Support Messages (Doctor)
- **Route**: `GET {{baseUrl}}/contact/my-messages`
- **Auth**: `Bearer <DOCTOR_JWT_TOKEN>`
- **Success Response (200 OK)**: Same list shape as 12.2, scoped to the requesting doctor.

*(An identical alias, `GET {{baseUrl}}/contact/my-message`, exists for the same purpose.)*

---

### 12.4 Get Support Message by ID
- **Route**: `GET {{baseUrl}}/contact/:id`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (any authenticated role)
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Support message fetched successfully",
  "data": { "_id": "66d482bf4f1a2345bc789170", "status": "PENDING" }
}
```

---

### 12.5 Update / Respond to Support Message (Admin)
- **Route**: `PATCH {{baseUrl}}/contact/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "status": "RESOLVED",
  "adminResponse": "This has been fixed — please try joining the call again."
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Support message updated successfully",
  "data": { "_id": "66d482bf4f1a2345bc789170", "status": "RESOLVED" }
}
```

---

### 12.6 Delete Support Message (Admin)
- **Route**: `DELETE {{baseUrl}}/contact/:id`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Support message deleted successfully"
}
```

---

## 13. Legal Content

### 13.1 Get Terms and Conditions
- **Route**: `GET {{baseUrl}}/legal-content/terms-and-conditions`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Terms and conditions fetched successfully",
  "data": {
    "type": "terms_and_conditions",
    "content": "Welcome to WeCure. By using our telehealth application...",
    "isActive": true
  }
}
```

---

### 13.2 Get Privacy Policy
- **Route**: `GET {{baseUrl}}/legal-content/privacy-policy`
- **Auth**: Public
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Privacy policy fetched successfully",
  "data": {
    "type": "privacy_policy",
    "content": "At WeCure, we are committed to protecting your health data...",
    "isActive": true
  }
}
```

---

### 13.3 Update Legal Content (Admin)
- **Route**: `PATCH {{baseUrl}}/legal-content`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Body**:
```json
{
  "type": "privacy_policy",
  "content": "Updated privacy policy content here..."
}
```
*(`type` options: `terms_and_conditions`, `privacy_policy`)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Legal content updated successfully",
  "data": { "type": "privacy_policy", "content": "Updated privacy policy content here..." }
}
```

---

## 14. Refunds

### 14.1 Get All Refunds (Admin)
- **Route**: `GET {{baseUrl}}/refunds`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `userId`, `doctorId`, `status` *(`PENDING`|`PROCESSING`|`COMPLETED`|`FAILED`)*, `startDate`, `endDate`, `page` *(default 1)*, `limit` *(default 10)* — all optional
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Refunds fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789180",
      "appointmentId": "66d482bf4f1a2345bc789100",
      "userId": "66d3f820c741e95642a8b111",
      "doctorId": "66d482bf4f1a2345bc789050",
      "amount": 4500,
      "originalAmount": 5000,
      "refundPercentage": 90,
      "reason": "PATIENT_CANCELLED",
      "status": "COMPLETED"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10 }
}
```

---

### 14.2 Get My Refunds
- **Route**: `GET {{baseUrl}}/refunds/me`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (any authenticated role)
- **Query Parameters**: Same filters as 14.1 (scoped to the current user automatically).
- **Success Response (200 OK)**: Same shape as 14.1.

---

### 14.3 Initiate Manual Refund (Admin)
- **Route**: `POST {{baseUrl}}/refunds/appointment/:appointmentId`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Refund initiated successfully",
  "data": {
    "_id": "66d482bf4f1a2345bc789180",
    "amount": 5000,
    "reason": "ADMIN_REFUND",
    "status": "PROCESSING"
  }
}
```
- **Failure Response (400)** *(no payment found for the appointment)*:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Refund could not be processed (e.g. no payment found)"
}
```

---

### 14.4 Get Refund by ID
- **Route**: `GET {{baseUrl}}/refunds/:id`
- **Auth**: `Bearer <USER_JWT_TOKEN>` — accessible by the owning patient, the associated doctor, or an Admin (`403 Forbidden` otherwise)
- **Success Response (200 OK)**:
> ⚠️ This endpoint returns the **raw Refund document**, not the standard `{success, statusCode, message, data}` envelope used elsewhere.
```json
{
  "_id": "66d482bf4f1a2345bc789180",
  "paymentId": "66d482bf4f1a2345bc789190",
  "appointmentId": "66d482bf4f1a2345bc789100",
  "userId": "66d3f820c741e95642a8b111",
  "doctorId": "66d482bf4f1a2345bc789050",
  "amount": 4500,
  "originalAmount": 5000,
  "refundPercentage": 90,
  "reason": "PATIENT_CANCELLED",
  "status": "COMPLETED",
  "initiatedBy": "66d3f820c741e95642a8b111",
  "processedAt": "2026-09-01T12:10:00.000Z"
}
```

---

## 15. Payouts

Doctor payouts are batched and processed via Paystack Transfers. All routes require `Bearer <ADMIN_JWT_TOKEN>`.

> ⚠️ Every endpoint in this module returns the **raw service result** directly — not the standard `{success, statusCode, message, data}` envelope used elsewhere in the API.

### 15.1 Get Due Payouts
- **Route**: `GET {{baseUrl}}/payouts/admin/due`
- **Success Response (200 OK)**:
```json
[
  {
    "doctorId": "66d482bf4f1a2345bc789050",
    "totalEarnings": 45000,
    "appointmentIds": ["66d482bf4f1a2345bc789100"]
  }
]
```

---

### 15.2 Get Payout History
- **Route**: `GET {{baseUrl}}/payouts/admin/history`
- **Query Parameters**: `doctorId`, `batchId` *(optional)*
- **Success Response (200 OK)**:
```json
[
  {
    "_id": "66d482bf4f1a2345bc789200",
    "doctorId": "66d482bf4f1a2345bc789050",
    "batchId": "2026-09",
    "totalEarnings": 45000,
    "platformCommission": 4500,
    "payoutAmount": 40500,
    "status": "COMPLETED"
  }
]
```

---

### 15.3 Create Payout Batch
- **Route**: `POST {{baseUrl}}/payouts/admin/batch`
- **Body**:
```json
{
  "batchId": "2026-09"
}
```
*(`batchId` optional — defaults to the current `YYYY-MM`)*
- **Success Response (200 OK)**:
```json
{
  "batchId": "2026-09",
  "created": 3,
  "totalAmount": 121500
}
```

---

### 15.4 Process a Payout
- **Route**: `POST {{baseUrl}}/payouts/admin/:payoutId/process`
- **Success Response (200 OK)**:
```json
{
  "_id": "66d482bf4f1a2345bc789200",
  "status": "PROCESSING",
  "paystackTransferId": "TRF_xxxxxxxxxx"
}
```

---

## 16. Notifications

### 16.1 Send Test Push Notification
- **Route**: `POST {{baseUrl}}/notifications/test-push`
- **Auth**: `Bearer <USER_JWT_TOKEN>` (any authenticated role)
- **Body**:
```json
{
  "title": "Test Notification",
  "body": "This is a test push notification.",
  "data": { "type": "TEST" }
}
```
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Test push notification sent successfully"
}
```

---

### 16.2 Get My Notifications
- **Route**: `GET {{baseUrl}}/notifications`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Query Parameters**: `page` *(default 1)*, `limit` *(default 20)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Notifications fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789210",
      "type": "APPOINTMENT_CONFIRMED",
      "title": "Appointment Confirmed",
      "message": "Your appointment with Dr. Jane Smith on Sep 25 has been confirmed.",
      "isRead": false,
      "createdAt": "2026-09-01T11:30:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```
> `type` is one of 18 values, including: `APPOINTMENT_CREATED`, `APPOINTMENT_UPDATED`, `APPOINTMENT_DELETED`, `APPOINTMENT_PAID`, `APPOINTMENT_STARTED`, `APPOINTMENT_COMPLETED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_NO_SHOW`, `APPOINTMENT_LATE`, `APPOINTMENT_REMINDER_6H`, `APPOINTMENT_REMINDER_1H`, `PAYMENT_SUCCESS`, `DOCTOR_VERIFIED`, `DOCTOR_REJECTED`, `DOCTOR_SUSPENDED`, `DOCTOR_UNSUSPENDED`, `PROFILE_UPDATED`.

---

### 16.3 Mark Notification as Read
- **Route**: `PATCH {{baseUrl}}/notifications/:id/read`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Notification marked as read"
}
```

---

### 16.4 Mark All Notifications as Read
- **Route**: `PATCH {{baseUrl}}/notifications/read-all`
- **Auth**: `Bearer <USER_JWT_TOKEN>`
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "All notifications marked as read"
}
```

---

## 17. Uploads

Presigned-URL flows for the **private** S3 bucket (used for sensitive documents — verification files, appointment attachments, support attachments). All routes require `Bearer <USER_JWT_TOKEN>`.

### 17.1 Create Presigned Upload URL
- **Route**: `POST {{baseUrl}}/uploads/presign`
- **Body**:
```json
{
  "mimeType": "application/pdf",
  "folder": "verifications"
}
```
*(`folder` options: `"appointments"`, `"verifications"`, `"profiles"`, `"support"`)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Presigned upload URL generated successfully",
  "data": {
    "uploadUrl": "https://your-private-bucket.s3.us-east-2.amazonaws.com/verifications/xxxx?X-Amz-...",
    "key": "verifications/xxxx-license.pdf"
  }
}
```

---

### 17.2 Get Presigned View URL
- **Route**: `GET {{baseUrl}}/uploads/view`
- **Query Parameters**: `key` *(required — the S3 object key returned from an upload)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Presigned view URL generated successfully",
  "data": {
    "viewUrl": "https://your-private-bucket.s3.us-east-2.amazonaws.com/verifications/xxxx?X-Amz-..."
  }
}
```
> URL expires after `AWS_SIGNED_URL_EXPIRE` seconds (default `300`).

---

### 17.3 Stream a Private File
- **Route**: `GET {{baseUrl}}/uploads/stream/*key`
- **Success Response (200 OK)**: Streams the raw file bytes directly (sets `Content-Type` from the object metadata) — **not** wrapped in the JSON envelope.

---

## 18. Admin Dashboard

### 18.1 Get Admin Dashboard Stats
- **Route**: `GET {{baseUrl}}/admin/dashboard`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>` (ADMIN or SUPER_ADMIN)
- **Query Parameters**: `year`, `month` *(both optional — filters time-series data)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Admin dashboard stats fetched successfully",
  "data": {
    "totalUsers": 1250,
    "totalDoctors": 84,
    "totalAppointments": 3420,
    "totalRevenue": 8750000,
    "pendingDoctorVerifications": 6,
    "appointmentsByStatus": {
      "PENDING": 12,
      "UPCOMING": 45,
      "ONGOING": 3,
      "COMPLETED": 3200,
      "CANCELLED": 160
    }
  }
}
```
- **Failure Response** *(mirrors the same envelope on error)*:
```json
{
  "success": false,
  "statusCode": 500,
  "message": "Failed to fetch dashboard stats",
  "data": null
}
```

---

## 19. Admin Audit Logs

### 19.1 Get Audit Logs
- **Route**: `GET {{baseUrl}}/admin/audit-logs`
- **Auth**: `Bearer <ADMIN_JWT_TOKEN>`
- **Query Parameters**: `userId`, `action`, `from`, `to` *(optional)*, `page` *(default 1)*, `limit` *(default 20)*
- **Success Response (200 OK)**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Audit logs fetched successfully",
  "data": [
    {
      "_id": "66d482bf4f1a2345bc789220",
      "userId": "66d3f820c741e95642a8b111",
      "action": "UPDATE_DOCTOR_STATUS",
      "resource": "Doctor",
      "resourceId": "66d482bf4f1a2345bc789050",
      "ipAddress": "203.0.113.10",
      "createdAt": "2026-09-01T12:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

## Appendix: Enum Reference

| Enum | Values |
|---|---|
| `Role` | `SUPER_ADMIN`, `ADMIN`, `USER`, `DOCTOR` |
| `UserStatus` | `PENDING`, `ACTIVE`, `REJECTED`, `BLOCKED`, `INACTIVE` |
| `BloodGroup` | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |
| `DoctorVerificationStatus` | `PENDING`, `VERIFIED`, `REJECTED`, `SUSPENDED` |
| `DayOfWeek` | `MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY`, `SUNDAY` |
| `AppointmentStatus` | `PENDING`, `UPCOMING`, `ONGOING`, `COMPLETED`, `CANCELLED` |
| `PaymentStatus` (Payment / Donation) | `PENDING`, `PAID`, `FAILED` |
| `RefundReason` | `DOCTOR_CANCELLED`, `PATIENT_CANCELLED`, `ADMIN_REFUND` |
| `RefundStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `PayoutStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `ContactSupportStatus` | `PENDING`, `IN_PROGRESS`, `RESOLVED` |
| `LegalContentType` | `terms_and_conditions`, `privacy_policy` |
| `NotificationType` | `APPOINTMENT_CREATED`, `APPOINTMENT_UPDATED`, `APPOINTMENT_DELETED`, `APPOINTMENT_PAID`, `APPOINTMENT_STARTED`, `APPOINTMENT_COMPLETED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_NO_SHOW`, `APPOINTMENT_LATE`, `APPOINTMENT_REMINDER_6H`, `APPOINTMENT_REMINDER_1H`, `PAYMENT_SUCCESS`, `DOCTOR_VERIFIED`, `DOCTOR_REJECTED`, `DOCTOR_SUSPENDED`, `DOCTOR_UNSUSPENDED`, `PROFILE_UPDATED` |

# Postman API Guide

This guide documents the API endpoints for the WeCure Backend.

## Base URL

`http://localhost:3000` (or your deployed URL)

## Authentication

Most endpoints require a Bearer Token.

1. Login via `POST /auth/login` to get a token.
2. In Postman, go to the **Authorization** tab.
3. Select **Bearer Token**.
4. Paste the `accessToken`.

---

## Auth Module

### Register

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/register`
- **Description:** Register a new user (USER or DOCTOR).
- **Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "USER", // or "DOCTOR"
  "doctorId": "12345" // Required if role is "doctor"
}
```

### Login

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/login`
- **Description:** Login with email and password.
- **Body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

### Refresh Token

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/refresh`
- **Description:** Refresh access token using refresh token.
- **Headers:**
  - `Authorization`: `Bearer <refreshToken>`

### Logout

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/logout`
- **Description:** Logout the user.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Resend OTP

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/resend-otp`
- **Description:** Resend registration OTP.
- **Body:**

```json
{
  "email": "john@example.com"
}
```

### Verify Registration OTP

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/verify-reg-otp`
- **Description:** Verify the OTP sent during registration.
- **Body:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

### Send Reset Password OTP

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/send-reset-otp`
- **Description:** Send OTP for password reset.
- **Body:**

```json
{
  "email": "john@example.com"
}
```

### Reset Password

- **Method:** `POST`
- **URL:** `{{baseUrl}}/auth/reset-password`
- **Description:** Reset password using OTP.
- **Body:**

```json
{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

## Users Module

### Get Profile

- **Method:** `GET`
- **URL:** `{{baseUrl}}/users/me`
- **Description:** Get current user's profile.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Update Profile

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/users/profile`
- **Description:** Update current user's profile. Supports image upload.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `name`: (text)
  - `phone`: (text)
  - `dateOfBirth`: (text, ISO8601)
  - `image`: (file)
  - `bloodGroup`: (text) - A+, A-, B+, B-, AB+, AB-, O+, O-
  - `allergies[]`: (text) - Multiple fields for array or comma-separated if supported by your parser

### Change Password

- **Method:** `POST`
- **URL:** `{{baseUrl}}/users/change-password`
- **Description:** Change current user's password.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "oldPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

### Delete Account

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/users/profile`
- **Description:** Delete current user's account.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Register FCM Token

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/users/fcm-token`
- **Description:** Register a device token for push notifications.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "token": "fcm_device_token_here"
}
```

### Remove FCM Token

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/users/fcm-token`
- **Description:** Remove a device token (e.g., on logout).
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "token": "fcm_device_token_here"
}
```

- `role`: (string)
- `search`: (string)

### Create Admin (Super Admin)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/users/admin`
- **Description:** Create a new Admin user. Super Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "password": "strongPassword123",
  "phone": "+1234567890" // Optional
}
```

### Toggle User Status (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/users/:id/toggle-status`
- **Description:** Block/Unblock a user. Admin/Super Admin only. **Note:** An admin cannot block themselves.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Change User Role (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/users/:id/role`
- **Description:** Change a user's role. Admin/Super Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "role": "ADMIN" // or "DOCTOR", "USER", "SUPER_ADMIN"
}
```

## Doctors Module

### Create Doctor Profile

- **Method:** `POST`
- **URL:** `{{baseUrl}}/doctors/me/profile`
- **Description:** Create a doctor profile for the current user.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "currentOrganization": "City Hospital",
  "specialtyId": "specialty_id_here",
  "about": "Experienced cardiologist...",
  "phone": "+1234567890" // Optional, updates user phone
}
```

### Update Doctor Profile

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/doctors/me/profile`
- **Description:** Update the doctor's profile.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `currentOrganization`: (text)
  - `about`: (text)
  - `phone`: (text)
  - `image`: (file)

### Get My Doctor Profile

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/me/profile`
- **Description:** Get the current doctor's profile.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Add Service

- **Method:** `POST`
- **URL:** `{{baseUrl}}/doctors/me/services`
- **Description:** Add a service to the doctor's profile.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "name": "General Consultation"
}
```

### Remove Service

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/doctors/me/services/:id`
- **Description:** Remove a service from the doctor's profile.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Upload Doctor Verification Documents

- **Method:** `POST`
- **URL:** `{{baseUrl}}/doctors/me/documents`
- **Description:** Upload separate verification files (PDF, JPG, PNG), up to 20MB each.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `mdcnPracticingLicenseDocument`: (file; required before admin approval)
  - `governmentIdDocument`: (file; optional)
  - `medicalDegreeDocument`: (file; optional)
  - `specialtyCertificateDocument`: (file; optional)

The doctor profile also includes `mdcnRegistrationNumber` and
`mdcnPracticingLicenseExpiryDate`. Admin approval as `VERIFIED` requires a
registration number, licence file, and unexpired licence.

### Add Experience

- **Method:** `POST`
- **URL:** `{{baseUrl}}/doctors/me/experiences`
- **Description:** Add work experience.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "organizationName": "General Hospital",
  "designation": "Senior Resident",
  "startDate": "2020-01-01",
  "endDate": "2023-01-01", // Optional
  "isCurrent": false // Optional
}
```

### Add Bank Details

- **Method:** `POST`
- **URL:** `{{baseUrl}}/doctors/me/bank-details`
- **Description:** Add bank details for payments.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "bankName": "First Bank",
  "accountName": "John Doe",
  "accountNumber": "1234567890"
}
```

### Get New Doctors (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/admin/new-doctors`
- **Description:** Get all doctors with PENDING status. Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)
  - `search`: (string)

### Get All Doctors (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/admin/all`
- **Description:** Get all doctors with pagination and filtering. Admin only. Returns `phone` and `email`.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)
  - `search`: (string)
  - `status`: (string) - PENDING, VERIFIED, REJECTED, SUSPENDED

### Update Verification Status (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/doctors/:id/status`
- **Description:** Update a doctor's verification status. Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "status": "VERIFIED", // PENDING, VERIFIED, REJECTED, SUSPENDED
  "note": "Documents verified." // Optional
}
```

### Get Doctor Details (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/admin/:id`
- **Description:** Get full doctor details including documents for verification. Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Public Doctor Profile

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/:id/public`
- **Description:** Get a doctor's public profile with services, experiences, reviews, and availability. Includes `totalExperienceYears`.
- **Response includes:**
  - Doctor details
  - Services offered
  - Work experiences
  - Reviews and ratings
  - Availability schedule (for calendar highlighting)

### Get Doctors by Specialty

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/specialty/:specialtyId`
- **Description:** Get all verified doctors for a specific specialty. Includes `minFee` and `nextAvailableSlots` for quick booking.
- **Response Example:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Doctors fetched successfully",
  "data": [
    {
      "_id": "6968879f78dbe211a6ba4029",
      "name": "dr Uno",
      "profileImage": "https://...",
      "specialty": "Cardiology",
      "currentOrganization": "City General Hospital",
      "totalExperienceYears": 12,
      "averageRating": 5,
      "totalReviews": 2,
      "minFee": 20,
      "nextAvailableSlots": [
        {
          "date": "2026-01-28",
          "day": "WEDNESDAY",
          "slots": ["09:00", "09:30", "10:00", "10:30", "11:00"],
          "totalSlots": 12
        },
        {
          "date": "2026-01-30",
          "day": "FRIDAY",
          "slots": ["09:00", "09:30", "10:00", "10:30", "11:00"],
          "totalSlots": 12
        }
      ]
    }
  ]
}
```

### Get Popular Doctors

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/popular`
- **Description:** Get doctors with rating >= 4.0, sorted by rating.

---

## 🔄 Complete Booking Flow

### Step 1: Browse Doctors by Specialty

**Endpoint:** `GET /doctors/specialty/:specialtyId`

- Shows list of doctors with `nextAvailableSlots` (next 3 days)
- Patient can book directly from quick slots

### Step 2a: Quick Book (from list view)

**Endpoint:** `POST /appointments`

- Use `doctorId`, `specialtyId`, `date`, and `time` from the list response

### Step 2b: View All Slots (calendar view)

**Endpoint:** `GET /doctors/:id/public`

- Get full availability rules to highlight available days on calendar
- Or use `GET /appointments/available-dates` to get specific dates with open slots

### Step 3: Show All Available Dates (Calendar)

**Endpoint:** `GET /appointments/available-dates?doctorId=...`

- Returns a list of dates (e.g. next 30 days) that have at least one available slot
- Useful for highlighting available dates on a calendar UI

### Step 4: Select Specific Date

**Endpoint:** `GET /appointments/available-slots?doctorId=...&date=2026-01-28`

- Shows all time slots for that specific date
- Marks each slot as `isAvailable: true/false`

### Step 5: Create Appointment

**Endpoint:** `POST /appointments`

- Creates appointment with status `UPCOMING`
- Returns `appointmentId`

### Step 6: Initialize Payment

**Endpoint:** `POST /payments/appointments/:appointmentId/initialize`

- Returns Paystack payment URL
- Patient completes payment
- Webhook updates appointment status to `PAID`

---

## Appointments Module

### Register Attachment (Pre-Appointment)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments/attachments`
- **Description:** Register an attachment. Use `multipart/form-data`.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `file`: (file)
  - `fileType`: (string) // Optional, inferred from file
  - `fileKey`: (string) // Optional, if already uploaded

- **Response:** Returns the created attachment object. Use `_id` for appointment creation.

### Create Appointment (Patient)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments`
- **Description:** Create a new appointment. Supports inline file upload.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `doctorId`: (string)
  - `specialistId`: (string) // Optional
  - `appointmentDate`: (string, YYYY-MM-DD)
  - `appointmentTime`: (string, HH:mm)
  - `reasonTitle`: (string)
  - `reasonDetails`: (string)
  - `attachment`: (file) // Optional, inline upload
  - `attachmentIds[]`: (string) // Optional, existing attachment IDs

### Get Available Dates

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/available-dates`
- **Description:** Get a list of dates that have available slots for a doctor.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `doctorId`: (string)
  - `days`: (number) - Optional, defaults to 30

### Get My Appointments (Patient)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/me`
- **Description:** Get all appointments for the current patient.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Available Slots

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/available-slots`
- **Description:** Get available time slots for a doctor on a specific date.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `doctorId`: (string)
  - `date`: (string, YYYY-MM-DD)

### Get Doctor Appointments (Doctor)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/doctor`
- **Description:** Get all appointments for the current doctor.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Update Appointment Status

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/appointments/:id/status`
- **Description:** Update appointment status (CANCELLED, COMPLETED).
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Note:** Can be done by USER or DOCTOR.
- **Body:**

```json
{
  "status": "CANCELLED"
}
```

### Add Attachment

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments/:id/attachments`
- **Description:** Add an attachment to an appointment. Use `multipart/form-data`.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `file`: (file)
  - `fileType`: (string) // Optional
  - `fileKey`: (string) // Optional

### Get Appointment Details (Patient)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/me/:id`
- **Description:** Get full details of a specific appointment for the patient.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Cancel Appointment (Patient)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/appointments/me/:id/cancel`
- **Description:** Cancel an appointment. Patient only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Doctor Appointments (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/admin/doctor/:doctorId`
- **Description:** Get all appointments for a specific doctor. Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)

### Get Appointment Details (Doctor)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/appointments/doctor/:id`
- **Description:** Get full details of a specific appointment for the doctor.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Accept Appointment (Doctor)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments/doctor/:id/accept`
- **Description:** Accept a pending appointment. Doctor only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Reject Appointment (Doctor)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments/doctor/:id/reject`
- **Description:** Reject a pending appointment with a reason. Doctor only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "reason": "Doctor unavailable on this day"
}
```

### Get Video Token

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments/:id/video/token`
- **Description:** Get an Agora video token for the appointment. Requires appointment to be ONGOING and within time window.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Chat Token

- **Method:** `POST`
- **URL:** `{{baseUrl}}/appointments/:id/chat/token`
- **Description:** Get an Agora chat token for the appointment. Requires appointment to be ONGOING and within time window.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Availability Module

### Create Availability

- **Method:** `POST`
- **URL:** `{{baseUrl}}/doctors/me/availability`
- **Description:** Create availability slots for specific days.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "days": ["MONDAY", "WEDNESDAY"],
  "slotSizeMinutes": 30,
  "startTime": "09:00",
  "endTime": "17:00",
  "fee": 500
}
```

### Get My Availability

- **Method:** `GET`
- **URL:** `{{baseUrl}}/doctors/me/availability`
- **Description:** Get the current doctor's availability.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Toggle Availability

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/doctors/me/availability/:id`
- **Description:** Enable or disable an availability slot.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "isActive": false
}
```

### Remove Availability

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/doctors/me/availability/:id`
- **Description:** Delete an availability slot.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Reviews Module

### Create Review

- **Method:** `POST`
- **URL:** `{{baseUrl}}/reviews`
- **Description:** Create a new review.
- **Body:**

```json
{
  "appointmentId": "appointment_id_here",
  "userId": "user_id_here",
  "doctorId": "doctor_id_here",
  "rating": 5,
  "reviewText": "Great experience!"
}
```

### Get All Reviews

- **Method:** `GET`
- **URL:** `{{baseUrl}}/reviews`
- **Description:** Get all reviews.
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)

### Get Review by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/reviews/:id`
- **Description:** Get a single review by ID.

### Update Review

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/reviews/:id`
- **Description:** Update a review.
- **Body:**

```json
{
  "rating": 4,
  "reviewText": "Updated review text"
}
```

### Delete Review

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/reviews/:id`
- **Description:** Delete a review.

## Uploads Module

### Presign Upload URL

- **Method:** `POST`
- **URL:** `{{baseUrl}}/uploads/presign`
- **Description:** Get a presigned URL for uploading a file to S3.
- **Body:**

```json
{
  "mimeType": "image/jpeg",
  "folder": "profiles" // appointments, verifications, profiles
}
```

### Get View URL

- **Method:** `GET`
- **URL:** `{{baseUrl}}/uploads/view`
- **Description:** Get a presigned URL for viewing a private file.
- **Query Params:**
  - `key`: (string) S3 file key

### Stream Private File

- **Method:** `GET`
- **URL:** `{{baseUrl}}/uploads/stream/:key`
- **Description:** Stream a file directly from the private bucket. Useful for displaying images or downloading files in a single request.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Specialist Module

### Create Specialist (Admin)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/specialist`
- **Description:** Create a new specialist category.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `name`: (text)
  - `description`: (text)
  - `image`: (file)
  - `isActive`: (text, boolean)

### Get All Specialists

- **Method:** `GET`
- **URL:** `{{baseUrl}}/specialist`
- **Description:** Get all specialist categories. Public endpoint.
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)
  - `search`: (string)

### Get Specialist by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/specialist/:id`
- **Description:** Get a single specialist category by ID. Public endpoint.

### Update Specialist (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/specialist/:id`
- **Description:** Update a specialist category.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
  - `Content-Type`: `multipart/form-data`
- **Body:**
  - `name`: (text)
  - `description`: (text)
  - `image`: (file)
  - `isActive`: (text, boolean)

### Delete Specialist (Admin)

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/specialist/:id`
- **Description:** Delete a specialist category.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Wellness Tips Module

### Create Wellness Tip (Admin)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/wellness-tips`
- **Description:** Create a new wellness tip.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "content": "Stay hydrated...",
  "isActive": true
}
```

### Get All Wellness Tips

- **Method:** `GET`
- **URL:** `{{baseUrl}}/wellness-tips`
- **Description:** Get all wellness tips. Returns `isFavourite: true` if the user is authenticated and has liked the tip.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>` (Optional)
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)
  - `search`: (string)

### Get Wellness Tip by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/wellness-tips/:id`
- **Description:** Get a single wellness tip by ID. Returns `isFavourite: true` if the user is authenticated and has liked the tip.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>` (Optional)

### Update Wellness Tip (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/wellness-tips/:id`
- **Description:** Update a wellness tip.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "content": "Drink More Water"
}
```

### Delete Wellness Tip (Admin)

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/wellness-tips/:id`
- **Description:** Delete a wellness tip.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Toggle Like

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/wellness-tips/:id/like`
- **Description:** Like or unlike a wellness tip.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Donations Module

### Create Donation (Internal/Admin)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/donations`
- **Description:** Create a new donation record manually.
- **Body:**

```json
{
  "userId": "user_id_here",
  "paystackReference": "ref_123456",
  "amount": 1000,
  "currency": "NGN",
  "status": "PENDING" // PENDING, PAID, FAILED
}
```

### Get All Donations

- **Method:** `GET`
- **URL:** `{{baseUrl}}/donations`
- **Description:** Get all donations.
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)

### Get Donation by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/donations/:id`
- **Description:** Get a single donation by ID.

### Update Donation

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/donations/:id`
- **Description:** Update a donation.
- **Body:**

```json
{
  "amount": 2000
}
```

### Delete Donation

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/donations/:id`
- **Description:** Delete a donation.

## Contact Support Module

### Create Support Message (Doctor)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/contact`
- **Description:** Send a support message.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "name": "Dr. Smith",
  "email": "smith@example.com",
  "message": "I need help with..."
}
```

### Get All Support Messages (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/contact`
- **Description:** Get all support messages.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)

### Get My Messages (Doctor)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/contact/my-messages`
- **Description:** Get current doctor's support messages.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Support Message by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/contact/:id`
- **Description:** Get a single support message by ID.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Update Support Message (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/contact/:id`
- **Description:** Update support message status or add admin response.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "status": "RESOLVED", // PENDING, IN_PROGRESS, RESOLVED
  "adminResponse": "We have fixed the issue."
}
```

### Delete Support Message (Admin)

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/contact/:id`
- **Description:** Delete a support message.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Audit Logs Module

### Get Audit Logs (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/admin/audit-logs`
- **Description:** Get audit logs with filtering.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `userId`: (string)
  - `action`: (string)
  - `from`: (date)
  - `to`: (date)
  - `page`: (number)
  - `limit`: (number)

## Chat Module

### Send Message

- **Method:** `POST`
- **URL:** `{{baseUrl}}/chat`
- **Description:** Send a chat message.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "appointmentId": "appointment_id_here",
  "senderId": "user_id_here",
  "senderRole": "USER", // USER, DOCTOR
  "message": "Hello doctor!"
}
```

### Get My Chats

- **Method:** `GET`
- **URL:** `{{baseUrl}}/chat`
- **Description:** Get all chats for the current user.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Chats by Appointment

- **Method:** `GET`
- **URL:** `{{baseUrl}}/chat/appointment/:appointmentId`
- **Description:** Get all messages for a specific appointment.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Message by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/chat/:id`
- **Description:** Get a single chat message by ID.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Update Message

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/chat/:id`
- **Description:** Update a chat message.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "message": "Updated message content"
}
```

### Delete Message

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/chat/:id`
- **Description:** Delete a chat message.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Payments Module

### Initialize Appointment Payment

- **Method:** `POST`
- **URL:** `{{baseUrl}}/payments/appointments/:appointmentId/initialize`
- **Description:** Initialize a Paystack payment for a doctor consultation.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Response:**

```json
{
  "authorization_url": "https://checkout.paystack.com/...",
  "reference": "..."
}
```

### Initialize Donation Payment

- **Method:** `POST`
- **URL:** `{{baseUrl}}/payments/donations/initialize`
- **Description:** Initialize a Paystack payment for a donation.
- **Body:**

```json
{
  "email": "donor@example.com",
  "amount": 5000,
  "userId": "optional_user_id"
}
```

- **Response:**

```json
{
  "authorization_url": "https://checkout.paystack.com/...",
  "reference": "..."
}
```

### Paystack Webhook

- **Method:** `POST`
- **URL:** `{{baseUrl}}/payments/webhook/paystack`
- **Description:** Paystack webhook endpoint for payment verification.
- **Headers:**
  - `x-paystack-signature`: `<hmac-sha512-signature>`
- **Body:** Paystack webhook payload.

---

## Legal Content Module

### Get Terms and Conditions

- **Method:** `GET`
- **URL:** `{{baseUrl}}/legal-content/terms-and-conditions`
- **Description:** Get the Terms and Conditions. Public endpoint.

### Get Privacy Policy

- **Method:** `GET`
- **URL:** `{{baseUrl}}/legal-content/privacy-policy`
- **Description:** Get the Privacy Policy. Public endpoint.

### Update Legal Content (Admin)

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/legal-content`
- **Description:** Update Terms and Conditions or Privacy Policy. Admin only.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "type": "terms_and_conditions", // or "privacy_policy"
  "content": "Updated content here..."
}
```

## Notifications Module

### Get My Notifications

- **Method:** `GET`
- **URL:** `{{baseUrl}}/notifications`
- **Description:** Get all notifications for the current user.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)

### Mark Notification as Read

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/notifications/:id/read`
- **Description:** Mark a specific notification as read.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Mark All Notifications as Read

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/notifications/read-all`
- **Description:** Mark all notifications for the current user as read.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Payouts Module

### Get Due Payouts (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/payouts/admin/due`
- **Description:** Get a preview of all doctors who are due for payout. Shows total earnings, platform commission (10%), and final payout amount. Decrypts bank details for display.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Payout History (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/payouts/admin/history`
- **Description:** Get the history of all created payout records.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `doctorId`: (string) Filter by doctor ID
  - `batchId`: (string) Filter by batch ID (e.g., "2026-02")

### Create Payout Batch (Admin)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/payouts/admin/batch`
- **Description:** Manually trigger the creation of a payout batch. Groups unpaid completed appointments by doctor.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Body:**

```json
{
  "batchId": "2026-02" // Optional, groups payouts. Defaults to current YYYY-MM.
}
```

### Process Payout (Admin)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/payouts/admin/:payoutId/process`
- **Description:** Process a specific payout record. Initiates transfer via Paystack.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

## Refunds Module

### Get All Refunds (Admin)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/refunds`
- **Description:** Get all refunds with filtering.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Params:**
  - `page`: (number)
  - `limit`: (number)
  - `status`: (string) // PENDING, PROCESSING, COMPLETED, FAILED
  - `appointmentId`: (string)
  - `paymentId`: (string)

### Get My Refunds

- **Method:** `GET`
- **URL:** `{{baseUrl}}/refunds/me`
- **Description:** Get refunds for the current user (Patient or Doctor).
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

### Get Refund by ID

- **Method:** `GET`
- **URL:** `{{baseUrl}}/refunds/:id`
- **Description:** Get a single refund by ID.
- **Headers:**
  - `Authorization`: `Bearer <accessToken>`

---

## 💸 Financial Flows

### 1. Payment Flow (Patient)

1.  **Book Appointment:**
    - Endpoint: `POST /appointments`
    - Result: Appointment created with status `PENDING`.
2.  **Initialize Payment:**
    - Endpoint: `POST /payments/appointments/:appointmentId/initialize`
    - Result: Returns Paystack `authorization_url`.
3.  **Complete Payment:**
    - Patient completes payment on Paystack gateway.
4.  **Verification (Webhook):**
    - Paystack sends `charge.success` event to `POST /payments/webhook/paystack`.
    - Backend updates Payment status to `PAID`.
    - Backend updates Appointment status to `UPCOMING` (or `PAID` internally).

### 2. Payout Flow (Doctor Earnings)

1.  **Appointment Completion:**
    - Appointment is marked `COMPLETED` by Doctor or Patient.
2.  **Batch Creation:**
    - System (Scheduler or Admin via `POST /payouts/admin/batch`) aggregates unpaid, completed appointments.
    - Calculates totals:
      - **Total Earnings:** 100% of consultation fees.
      - **Platform Commission:** 10%.
      - **Payout Amount:** 90% (to Doctor).
    - Creates `Payout` record with status `PENDING`.
3.  **Processing:**
    - Admin reviews and triggers `POST /payouts/admin/:payoutId/process`.
    - Backend initiates Transfer via Paystack.
    - Payout status updates to `PROCESSING`.
4.  **Completion (Webhook):**
    - Paystack sends `transfer.success` event.
    - Backend updates Payout status to `COMPLETED`.
    - Backend marks included Appointments as `isPaidOut = true`.

### 3. Refund Flow

1.  **Trigger:**
    - **Doctor Rejects:** `POST /appointments/doctor/:id/reject` -> Triggers **100% Refund**.
    - **Patient Cancels:** `PATCH /appointments/me/:id/cancel` -> Triggers **Refund** (Partial/Full based on policy).
2.  **Processing:**
    - System automatically creates `Refund` record (`PENDING`).
    - System calls Paystack Refund API.
    - Refund status updates to `PROCESSING`.
3.  **Completion (Webhook):**
    - Paystack sends `refund.processed` event.
    - Backend updates Refund status to `COMPLETED`.

# Postman Testing Guide: Paystack Integration

This guide explains how to test the Appointment Payment and Donation flows using Postman.

## 1. Setup Environment

Ensure your `.env` file has the following key (from your screenshot):

```env
PAYSTACK_SECRET_KEY=sk_test_82339dbf905c3b1c01e60fe7aa10a5e8ada61a0a
```

## 2. Appointment Payment Flow

### Step A: Initialize Payment

**Endpoint:** `POST /payments/appointments/:appointmentId/initialize`  
**Auth:** Bearer Token (JWT)  
**Description:** This creates a pending payment and returns the Paystack authorization URL.

1.  Find an `appointmentId` where:
    - You are the patient (`userId` matches your JWT).
    - Status is `UPCOMING`.
    - `paymentId` is null.
2.  **Request:**
    - URL: `http://localhost:3000/payments/appointments/YOUR_APPOINTMENT_ID/initialize`
    - Method: `POST`
    - Headers: `Authorization: Bearer <your_jwt_token>`
3.  **Response:**
    ```json
    {
      "authorization_url": "https://checkout.paystack.com/...",
      "reference": "..."
    }
    ```
4.  **Action:** Open the `authorization_url` in your browser and complete the test payment.

---

## 3. Donation Flow

### Step A: Initialize Donation

**Endpoint:** `POST /payments/donations/initialize`  
**Auth:** Optional  
**Description:** Initializes a donation.

1.  **Request:**
    - URL: `http://localhost:3000/payments/donations/initialize`
    - Method: `POST`
    - Body (JSON):
      ```json
      {
        "email": "donor@example.com",
        "amount": 5000,
        "userId": "OPTIONAL_USER_ID"
      }
      ```
2.  **Response:**
    ```json
    {
      "authorization_url": "https://checkout.paystack.com/...",
      "reference": "..."
    }
    ```

---

## 4. Webhook Handling (Verification)

### Option 1: Automatic (Real Webhook)

Since you have a Dev Tunnel running (`https://bvh0nlc7-3000.inc1.devtunnels.ms`), you can test real webhooks:

1.  Go to your [Paystack Dashboard Settings](https://dashboard.paystack.com/#/settings/developer).
2.  Set **Test Webhook URL** to: `https://bvh0nlc7-3000.inc1.devtunnels.ms/payments/webhook/paystack`
3.  When you complete a payment in the browser, Paystack will automatically call your backend.

### Option 2: Manual (Simulate with Postman)

To simulate a successful payment without waiting for Paystack:

1.  **Endpoint:** `POST /payments/webhook/paystack`
2.  **Headers:**
    - `x-paystack-signature`: (See note below)
3.  **Body (JSON):**
    ```json
    {
      "event": "charge.success",
      "data": {
        "reference": "THE_REFERENCE_FROM_STEP_A",
        "status": "success",
        "amount": 500000,
        "metadata": {
          "type": "APPOINTMENT",
          "appointmentId": "YOUR_APPOINTMENT_ID",
          "userId": "YOUR_USER_ID"
        }
      }
    }
    ```

> [!IMPORTANT]
> **Manual Signature Calculation**: The `x-paystack-signature` header is required. It is an HMAC SHA512 hash of the request body using your `PAYSTACK_SECRET_KEY`.
> For testing purposes, you can temporarily disable the signature check in `payments.controller.ts` or use an online HMAC generator to create the signature.

## 5. Verify Results

After a successful webhook:

1.  **Check Payment/Donation Record**: The status should be `PAID`.
2.  **Check Appointment**: The `paymentId` field should now be populated with the Payment ID.
3.  **Check Audit Logs**: A new log entry for `PAYMENT_SUCCESS` or `DONATION_SUCCESS` should exist.

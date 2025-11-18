# Quick Order API - Complete Guide

## Overview

The Quick Order API provides a streamlined, single-page experience for users to create job orders with WhatsApp OTP verification. This eliminates the need for page reloads or navigation, offering a seamless user experience.

---

## Features

- **Single-Page Flow** - Complete entire order process without page navigation
- **WhatsApp OTP Verification** - Secure phone-based authentication
- **All-in-One Endpoint** - One request handles OTP verification, user creation, job order, and payment
- **Supports Both New & Existing Users** - Automatically detects and handles both scenarios
- **Returns JWT Token** - User is authenticated immediately after verification
- **Billplz Integration** - Generates payment URL automatically

---

## API Endpoints

### 1. Request Login OTP (Existing Users)

**Endpoint:** `POST /api/auth/request-login-otp`

**Description:** Send WhatsApp OTP to existing user's phone number for login.

**Request:**
```json
{
  "phone": "60123456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists with this phone, OTP has been sent. Valid for 5 minutes."
}
```

**Notes:**
- Always returns success for security (prevents phone enumeration)
- OTP expires in 5 minutes
- For **existing users only**

---

### 2. Request Signup OTP (New Users)

**Endpoint:** `POST /api/auth/center/signup/request-otp`

**Description:** Send WhatsApp OTP to new user's phone number for signup.

**Request:**
```json
{
  "phone": "60123456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your phone. Valid for 5 minutes."
}
```

**Error Response (if phone already registered):**
```json
{
  "success": false,
  "error": "Phone number already registered. Please login instead."
}
```

**Notes:**
- Rejects if phone is already verified
- OTP expires in 5 minutes
- For **new users only**

---

### 3. Check Phone Exists (Helper)

**Endpoint:** `POST /api/quick-order/check-phone`

**Description:** Check if a phone number is registered to determine which OTP flow to use.

**Request:**
```json
{
  "phone": "60123456789"
}
```

**Response:**
```json
{
  "success": true,
  "exists": true,        // Phone is registered
  "has_center": true     // User has a center
}
```

**Usage:**
```javascript
// Frontend logic
const checkResponse = await fetch('/api/quick-order/check-phone', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '60123456789' })
});

const { exists } = await checkResponse.json();

if (exists) {
  // Use login OTP endpoint
  await fetch('/api/auth/request-login-otp', { ... });
} else {
  // Use signup OTP endpoint
  await fetch('/api/auth/center/signup/request-otp', { ... });
}
```

---

### 4. Create Quick Order (All-in-One)

**Endpoint:** `POST /api/quick-order/create`

**Description:** Create a complete job order with OTP verification in one request.

This endpoint:
1. Verifies OTP
2. Creates or updates user/center
3. Creates job order
4. Creates payment with Billplz
5. Returns JWT token and payment URL

**Request:**
```json
{
  // OTP verification
  "phone": "60123456789",
  "otp": "123456",

  // User/Center details
  "name": "Little Stars Childcare",
  "email": "contact@littlestars.com",
  "address": "123 Jalan Presint 15",
  "postcode": "62000",
  "city": "Putrajaya",
  "state": "Putrajaya",
  "whatsapp_number": "60123456789",
  "location": "2.9264,101.6964",  // optional

  // Job order details
  "scheduled_date": "2025-12-25T09:00:00Z",
  "job_tasks": ["TEACHING", "SUPERVISION"],
  "custom_tasks": ["Prepare lunch"],  // optional
  "center_location": "2.9264,101.6964",
  "rate": 150.00,
  "start_time": "09:00",
  "end_time": "17:00",
  "gantify_service_fees": 10,  // optional, default 10

  // Payment details
  "gantifier_fee": 140.00,
  "service_fee": 10.00,
  "payment_description": "Payment for job on 25 Dec 2025"  // optional
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "name": "Little Stars Childcare",
      "email": "contact@littlestars.com",
      "phone": "60123456789",
      "phoneVerified": true,
      "role": "CENTER"
    },
    "center": {
      "id": "center_123",
      "name": "Little Stars Childcare",
      "email": "contact@littlestars.com",
      "phone": "60123456789",
      "address": "123 Jalan Presint 15",
      "city": "Putrajaya",
      "state": "Putrajaya"
    },
    "job_order": {
      "id": "job_456",
      "center_id": "center_123",
      "scheduled_date": "2025-12-25T09:00:00.000Z",
      "status": "AWAITING_PAYMENT",
      "rate": 150
    },
    "payment": {
      "id": "payment_789",
      "total_amount": 150,
      "billplz_url": "https://www.billplz.com/bills/abc123xyz",
      "status": "PENDING"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Quick order created successfully. Redirect user to payment URL."
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "OTP verification failed"
}
```

**Possible Errors:**
- `"OTP verification failed"` - Invalid or expired OTP
- `"Invalid Malaysian phone number format. Use format: 60XXXXXXXXX"` - Invalid phone
- `"Email already registered to another center. Please use a different email."` - Duplicate email
- `"name is required"` - Missing required field
- `"Valid rate is required"` - Invalid rate

---

## Complete Frontend Integration

### React Example

```jsx
import { useState } from 'react';

function QuickOrderPage() {
  const [step, setStep] = useState('form'); // 'form' | 'otp' | 'processing' | 'redirect'
  const [formData, setFormData] = useState({
    phone: '',
    name: '',
    email: '',
    address: '',
    postcode: '',
    city: '',
    state: '',
    whatsapp_number: '',
    scheduled_date: '',
    job_tasks: [],
    center_location: '',
    rate: 0,
    start_time: '',
    end_time: '',
    gantifier_fee: 0,
    service_fee: 10
  });
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1: Submit form and request OTP
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Check if phone exists
      const checkResponse = await fetch('/api/quick-order/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone })
      });
      const { exists } = await checkResponse.json();

      // Request OTP (different endpoints for new vs existing users)
      const otpEndpoint = exists
        ? '/api/auth/request-login-otp'
        : '/api/auth/center/signup/request-otp';

      const otpResponse = await fetch(otpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone })
      });

      const otpResult = await otpResponse.json();

      if (otpResult.success) {
        setStep('otp');
      } else {
        setError(otpResult.error || 'Failed to send OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and create order
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/quick-order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          otp
        })
      });

      const result = await response.json();

      if (result.success) {
        // Save JWT token
        localStorage.setItem('token', result.data.token);

        // Save user data
        localStorage.setItem('user', JSON.stringify(result.data.user));

        // Redirect to payment
        setStep('redirect');
        window.location.href = result.data.payment.billplz_url;
      } else {
        setError(result.error || 'Failed to create order');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Render different steps
  if (step === 'form') {
    return (
      <form onSubmit={handleSubmitForm}>
        <h2>Quick Order - Fill Details</h2>

        {error && <div className="error">{error}</div>}

        {/* Phone */}
        <input
          type="tel"
          placeholder="Phone (60XXXXXXXXX)"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
        />

        {/* Center Details */}
        <input
          type="text"
          placeholder="Center Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />

        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />

        <input
          type="text"
          placeholder="Address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          required
        />

        <input
          type="text"
          placeholder="Postcode"
          value={formData.postcode}
          onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
          required
        />

        <input
          type="text"
          placeholder="City"
          value={formData.city}
          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          required
        />

        <input
          type="text"
          placeholder="State"
          value={formData.state}
          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          required
        />

        <input
          type="tel"
          placeholder="WhatsApp Number"
          value={formData.whatsapp_number}
          onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
          required
        />

        {/* Job Details */}
        <input
          type="datetime-local"
          placeholder="Scheduled Date"
          value={formData.scheduled_date}
          onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
          required
        />

        <select
          multiple
          value={formData.job_tasks}
          onChange={(e) => setFormData({
            ...formData,
            job_tasks: Array.from(e.target.selectedOptions, option => option.value)
          })}
          required
        >
          <option value="TEACHING">Teaching</option>
          <option value="SUPERVISION">Supervision</option>
          <option value="CLEANING">Cleaning</option>
        </select>

        <input
          type="text"
          placeholder="Center Location (lat,lng)"
          value={formData.center_location}
          onChange={(e) => setFormData({ ...formData, center_location: e.target.value })}
          required
        />

        <input
          type="number"
          placeholder="Rate (MYR)"
          value={formData.rate}
          onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) })}
          required
        />

        <input
          type="time"
          placeholder="Start Time"
          value={formData.start_time}
          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
          required
        />

        <input
          type="time"
          placeholder="End Time"
          value={formData.end_time}
          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
          required
        />

        {/* Payment */}
        <input
          type="number"
          placeholder="Gantifier Fee (MYR)"
          value={formData.gantifier_fee}
          onChange={(e) => setFormData({ ...formData, gantifier_fee: parseFloat(e.target.value) })}
          required
        />

        <input
          type="number"
          placeholder="Service Fee (MYR)"
          value={formData.service_fee}
          onChange={(e) => setFormData({ ...formData, service_fee: parseFloat(e.target.value) })}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Sending OTP...' : 'Continue to OTP Verification'}
        </button>
      </form>
    );
  }

  if (step === 'otp') {
    return (
      <form onSubmit={handleVerifyOtp}>
        <h2>Verify OTP</h2>
        <p>Enter the 6-digit OTP sent to {formData.phone} via WhatsApp</p>

        {error && <div className="error">{error}</div>}

        <input
          type="text"
          placeholder="Enter OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          maxLength={6}
          pattern="\d{6}"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify & Create Order'}
        </button>

        <button type="button" onClick={() => setStep('form')}>
          Back to Form
        </button>
      </form>
    );
  }

  if (step === 'redirect') {
    return (
      <div>
        <h2>Redirecting to Payment...</h2>
        <p>Please wait while we redirect you to Billplz payment gateway.</p>
      </div>
    );
  }

  return null;
}

export default QuickOrderPage;
```

---

## Vanilla JavaScript Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quick Order</title>
  <style>
    .hidden { display: none; }
    .error { color: red; padding: 10px; background: #ffe6e6; }
  </style>
</head>
<body>
  <div id="form-section">
    <h2>Quick Order</h2>
    <form id="order-form">
      <!-- Form fields here (same as React example) -->
      <input type="tel" id="phone" placeholder="Phone (60XXXXXXXXX)" required>
      <!-- ... other fields ... -->
      <button type="submit">Send OTP</button>
    </form>
  </div>

  <div id="otp-section" class="hidden">
    <h2>Verify OTP</h2>
    <form id="otp-form">
      <input type="text" id="otp" placeholder="Enter 6-digit OTP" maxlength="6" required>
      <button type="submit">Verify & Create Order</button>
    </form>
  </div>

  <script>
    let formData = {};

    // Step 1: Submit form
    document.getElementById('order-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      // Collect form data
      formData = {
        phone: document.getElementById('phone').value,
        // ... collect other fields ...
      };

      try {
        // Check if phone exists
        const checkRes = await fetch('/api/quick-order/check-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formData.phone })
        });
        const { exists } = await checkRes.json();

        // Request OTP
        const otpEndpoint = exists
          ? '/api/auth/request-login-otp'
          : '/api/auth/center/signup/request-otp';

        const otpRes = await fetch(otpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formData.phone })
        });

        const result = await otpRes.json();

        if (result.success) {
          // Show OTP section
          document.getElementById('form-section').classList.add('hidden');
          document.getElementById('otp-section').classList.remove('hidden');
        } else {
          alert(result.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });

    // Step 2: Verify OTP
    document.getElementById('otp-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const otp = document.getElementById('otp').value;

      try {
        const res = await fetch('/api/quick-order/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, otp })
        });

        const result = await res.json();

        if (result.success) {
          // Save token
          localStorage.setItem('token', result.data.token);
          localStorage.setItem('user', JSON.stringify(result.data.user));

          // Redirect to payment
          window.location.href = result.data.payment.billplz_url;
        } else {
          alert(result.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  </script>
</body>
</html>
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────┐
│  USER FILLS FORM                            │
│  (phone, center details, job details)       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  CHECK PHONE EXISTS                         │
│  POST /api/quick-order/check-phone          │
└─────────────────────────────────────────────┘
         ↓                         ↓
   [EXISTS]                   [NEW USER]
         ↓                         ↓
┌──────────────────┐    ┌──────────────────────┐
│ LOGIN OTP        │    │ SIGNUP OTP           │
│ /auth/           │    │ /auth/center/signup/ │
│ request-login-   │    │ request-otp          │
│ otp              │    │                      │
└──────────────────┘    └──────────────────────┘
         ↓                         ↓
         └─────────┬───────────────┘
                   ↓
        ┌────────────────────┐
        │ USER RECEIVES OTP  │
        │ via WhatsApp       │
        └────────────────────┘
                   ↓
        ┌────────────────────┐
        │ USER ENTERS OTP    │
        └────────────────────┘
                   ↓
    ┌──────────────────────────────────┐
    │ CREATE QUICK ORDER               │
    │ POST /api/quick-order/create     │
    │                                  │
    │ 1. Verify OTP                    │
    │ 2. Create/Update User & Center   │
    │ 3. Create Job Order              │
    │ 4. Create Billplz Payment        │
    │ 5. Return Token + Payment URL    │
    └──────────────────────────────────┘
                   ↓
        ┌────────────────────┐
        │ SAVE JWT TOKEN     │
        │ localStorage       │
        └────────────────────┘
                   ↓
        ┌────────────────────┐
        │ REDIRECT TO        │
        │ BILLPLZ PAYMENT    │
        └────────────────────┘
```

---

## Security Features

1. **OTP Expiration** - OTPs expire after 5 minutes
2. **Phone Enumeration Protection** - Login OTP endpoint doesn't reveal if phone exists
3. **JWT Authentication** - Secure token-based authentication
4. **Phone Verification** - Only verified phones can create orders
5. **Input Validation** - All inputs validated on backend
6. **HTTPS Required** - All endpoints should be called over HTTPS in production

---

## Testing

### Test New User Flow

```bash
# Step 1: Request signup OTP
curl -X POST http://localhost:3000/api/auth/center/signup/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "60123456789"
  }'

# Step 2: Create quick order with OTP
curl -X POST http://localhost:3000/api/quick-order/create \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "60123456789",
    "otp": "123456",
    "name": "Test Center",
    "email": "test@example.com",
    "address": "123 Test Street",
    "postcode": "62000",
    "city": "Putrajaya",
    "state": "Putrajaya",
    "whatsapp_number": "60123456789",
    "scheduled_date": "2025-12-25T09:00:00Z",
    "job_tasks": ["TEACHING"],
    "center_location": "2.9264,101.6964",
    "rate": 150,
    "start_time": "09:00",
    "end_time": "17:00",
    "gantifier_fee": 140,
    "service_fee": 10
  }'
```

### Test Existing User Flow

```bash
# Step 1: Request login OTP
curl -X POST http://localhost:3000/api/auth/request-login-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "60123456789"
  }'

# Step 2: Create quick order (same as above)
```

### Test Phone Check

```bash
curl -X POST http://localhost:3000/api/quick-order/check-phone \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "60123456789"
  }'
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid Malaysian phone number format` | Phone not in 60XXXXXXXXX format | Use correct format |
| `OTP must be 6 digits` | OTP is not 6 digits | Enter valid 6-digit OTP |
| `OTP verification failed` | Wrong OTP or expired | Request new OTP |
| `Email already registered to another center` | Email conflict | Use different email |
| `name is required` | Missing required field | Fill all required fields |
| `Valid rate is required` | Rate is 0 or negative | Enter positive rate |

---

## Best Practices

1. **Store JWT Token** - Save token in localStorage immediately after creation
2. **Handle Errors Gracefully** - Show user-friendly error messages
3. **Loading States** - Show loading indicators during API calls
4. **Validation** - Validate inputs on frontend before submission
5. **Phone Format** - Guide users on correct phone format (60XXXXXXXXX)
6. **OTP Timer** - Show countdown for OTP expiration (5 minutes)
7. **Resend OTP** - Allow users to request new OTP if expired
8. **Session Persistence** - Use JWT token for authenticated requests after order creation

---

## Summary

### Endpoints Created:

1. ✅ `POST /api/auth/request-login-otp` - Login OTP for existing users
2. ✅ `POST /api/auth/center/signup/request-otp` - Signup OTP for new users (already existed)
3. ✅ `POST /api/quick-order/check-phone` - Helper to check if phone exists
4. ✅ `POST /api/quick-order/create` - All-in-one quick order creation

### Features:

- ✅ Single-page order flow
- ✅ WhatsApp OTP verification
- ✅ Automatic user/center creation
- ✅ Job order creation
- ✅ Billplz payment integration
- ✅ JWT token generation
- ✅ Supports both new and existing users
- ✅ No page reload required
- ✅ Security best practices

---

**Last Updated:** 2025-11-18
**Version:** 1.0.0

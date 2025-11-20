# Center Sign-Up with WhatsApp OTP Verification

Complete guide for implementing Center account registration with WhatsApp OTP verification.

## Overview

The Center sign-up flow uses a 2-step process:
1. **Request OTP**: User provides phone number → receives 6-digit OTP via WhatsApp
2. **Complete Sign-up**: User verifies OTP + provides center details → account created + JWT token returned

## API Endpoints

### Step 1: Request OTP

**Endpoint**: `POST /api/auth/center/signup/request-otp`

**Authentication**: ❌ None required (public endpoint)

**Request Body**:
```json
{
  "phone": "60123456789"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "OTP sent to your phone. Valid for 5 minutes."
}
```

**Error Responses**:
- `400`: Invalid phone number format
- `400`: Phone number already registered
- `500`: Failed to send OTP

**Validation**:
- Phone number must be Malaysian format: `60XXXXXXXXX`, `0XXXXXXXXX`, or `+60XXXXXXXXX`
- Checks if phone is already verified (prevents duplicate accounts)

---

### Step 2: Complete Sign-Up

**Endpoint**: `POST /api/auth/center/signup/complete`

**Authentication**: ❌ None required (public endpoint)

**Request Body**:
```json
{
  "phone": "60123456789",
  "otp": "123456",
  "name": "CIC Presint 15",
  "email": "center@example.com",
  "address": "Jalan Presint 15",
  "postcode": "62000",
  "city": "Putrajaya",
  "state": "Putrajaya",
  "whatsapp_number": "60123456789",
  "location": "2.9264,101.6964" // Optional: coordinates
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Center account created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_1234567890_abc123",
    "name": "CIC Presint 15",
    "email": "center@example.com",
    "phone": "60123456789",
    "phoneVerified": true
  },
  "center": {
    "id": "center_1234567890_xyz789",
    "name": "CIC Presint 15",
    "email": "center@example.com",
    "phone": "60123456789",
    "address": "Jalan Presint 15",
    "city": "Putrajaya",
    "state": "Putrajaya"
  }
}
```

**Error Responses**:
- `400`: Missing required fields
- `400`: Invalid phone number format
- `400`: Invalid email format
- `400`: Invalid OTP (wrong code)
- `400`: OTP expired (> 5 minutes)
- `400`: Email already registered
- `500`: Internal server error

---

## Complete Frontend Flow Example

### React/Next.js Example

```typescript
// Step 1: Request OTP
async function requestOTP(phone: string) {
  const response = await fetch('http://localhost:3000/api/auth/center/signup/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error);
  }

  return data;
}

// Step 2: Complete sign-up
async function completeSignup(signupData: {
  phone: string;
  otp: string;
  name: string;
  email: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  whatsapp_number: string;
  location?: string;
}) {
  const response = await fetch('http://localhost:3000/api/auth/center/signup/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupData)
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error);
  }

  // Store JWT token
  localStorage.setItem('authToken', data.token);

  return data;
}

// Usage in component
function CenterSignupForm() {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [centerData, setCenterData] = useState({...});

  const handleRequestOTP = async () => {
    try {
      await requestOTP(phone);
      setStep(2); // Move to OTP verification step
      toast.success('OTP sent to your phone!');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCompleteSignup = async () => {
    try {
      const result = await completeSignup({
        phone,
        otp,
        ...centerData
      });

      // Redirect to dashboard
      router.push('/dashboard');
      toast.success('Account created successfully!');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      {step === 1 && (
        <PhoneInput
          value={phone}
          onChange={setPhone}
          onSubmit={handleRequestOTP}
        />
      )}

      {step === 2 && (
        <SignupForm
          phone={phone}
          otp={otp}
          setOtp={setOtp}
          centerData={centerData}
          setCenterData={setCenterData}
          onSubmit={handleCompleteSignup}
        />
      )}
    </div>
  );
}
```

---

## cURL Testing Examples

### Test Step 1: Request OTP
```bash
curl -X POST http://localhost:3000/api/auth/center/signup/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "60123456789"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "OTP sent to your phone. Valid for 5 minutes."
}
```

---

### Test Step 2: Complete Sign-Up
```bash
curl -X POST http://localhost:3000/api/auth/center/signup/complete \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "60123456789",
    "otp": "123456",
    "name": "CIC Presint 15",
    "email": "center@example.com",
    "address": "Jalan Presint 15",
    "postcode": "62000",
    "city": "Putrajaya",
    "state": "Putrajaya",
    "whatsapp_number": "60123456789",
    "location": "2.9264,101.6964"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Center account created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...},
  "center": {...}
}
```

---

## Database Changes

The sign-up flow creates records in two tables:

### 1. `users` table
```sql
INSERT INTO users (
  id,
  phone,
  name,
  email,
  phoneVerified,
  otpCode,
  otpExpiresAt
) VALUES (
  'user_1234567890_abc123',
  '60123456789',
  'CIC Presint 15',
  'center@example.com',
  true,
  NULL, -- Cleared after verification
  NULL
);
```

### 2. `centers` table
```sql
INSERT INTO centers (
  id,
  user_id,
  name,
  email,
  phone,
  address,
  postcode,
  city,
  state,
  whatsapp_number,
  location
) VALUES (
  'center_1234567890_xyz789',
  'user_1234567890_abc123',
  'CIC Presint 15',
  'center@example.com',
  '60123456789',
  'Jalan Presint 15',
  '62000',
  'Putrajaya',
  'Putrajaya',
  '60123456789',
  '2.9264,101.6964'
);
```

---

## WhatsApp Template Setup

### Template Name: `gantify_authentication`

**Category**: Authentication

**Language**: English (US)

**Template Content**:
```
{{1}} is your verification code. For your security, do not share this code.

This code expires in 5 minutes.
```

**Parameters**:
- `{{1}}`: OTP code (6 digits)
- Note: Expiry time (5 minutes) is hardcoded in the template, not a parameter

**Status**: Must be approved by Meta before use

**Note**: The template name is configurable via `WA_OTP_TEMPLATE_NAME` environment variable (default: `gantify_authentication`)

### How to Create Template in Meta Business Manager:

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to: **WhatsApp Manager** → **Message Templates**
3. Click **Create Template**
4. Fill in:
   - **Template Name**: `gantify_authentication`
   - **Category**: Authentication
   - **Language**: English (US)
   - **Body**: (paste content above)
5. Submit for approval
6. Wait 24-48 hours for Meta approval

---

## Security Features

✅ **OTP Expiry**: OTP automatically expires after 5 minutes
✅ **Phone Verification**: Marks phone as verified after successful OTP
✅ **Duplicate Prevention**: Checks if phone/email already registered
✅ **Input Validation**: Validates phone format, email format, OTP format
✅ **JWT Authentication**: Returns secure JWT token for authenticated requests
✅ **No Password Required**: Passwordless authentication via phone

---

## Error Handling

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| `Phone number is required` | 400 | Missing phone | Provide phone number |
| `Invalid Malaysian phone number format` | 400 | Wrong format | Use format: 60XXXXXXXXX |
| `Phone number already registered` | 400 | Duplicate phone | User should login instead |
| `OTP must be 6 digits` | 400 | Wrong OTP format | Enter 6-digit code |
| `Invalid OTP code` | 400 | Wrong OTP | Re-enter correct code |
| `OTP has expired` | 400 | > 5 minutes | Request new OTP |
| `Email already registered` | 400 | Duplicate email | Use different email |
| `Failed to send OTP via WhatsApp` | 500 | WhatsApp API error | Check WA credentials |
| `Template name does not exist` | 500 | Template not found/approved | See troubleshooting below |

---

## Environment Variables Required

```bash
# WhatsApp Configuration (for OTP sending)
WA_ACCESS_TOKEN=your_whatsapp_access_token
WA_PHONE_NUMBER_ID=your_phone_number_id
WA_OTP_TEMPLATE_NAME=gantify_authentication  # Optional: Default is 'gantify_authentication'
WA_OTP_TEMPLATE_LANGUAGE=en_US                # Optional: Default is 'en_US' (English US)

# JWT Configuration (for token generation)
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/gantify
```

**Note:** If your WhatsApp template has a different name, set `WA_OTP_TEMPLATE_NAME` to match your actual template name in Meta Business Manager.

---

## Using the JWT Token

After successful sign-up, use the returned JWT token for authenticated requests:

```bash
curl -X GET http://localhost:3000/api/centers \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

The token is valid for 7 days (configurable via `JWT_EXPIRES_IN`).

---

## Next Steps After Sign-Up

Once the center is registered:

1. ✅ User is created in `users` table
2. ✅ Center is created in `centers` table
3. ✅ Phone is verified (`phoneVerified = true`)
4. ✅ JWT token is issued
5. 🔄 Create account balance entry (optional - for payment tracking)
6. 🔄 Send welcome email (optional)
7. 🔄 Redirect to onboarding flow (optional)

---

## Swagger Documentation

Access API documentation at: `http://localhost:3000/api-docs`

Search for "Center sign-up" to see interactive documentation with "Try it out" feature.

---

## Troubleshooting WhatsApp Template Errors

### Error: `(#132001) Template name does not exist in the translation`

This error means the WhatsApp template doesn't exist or isn't approved in your Meta Business Manager account.

**Solution Steps:**

1. **Check Template Status in Meta Business Manager:**
   - Go to [Meta Business Suite](https://business.facebook.com/)
   - Navigate to: **WhatsApp Manager** → **Message Templates**
   - Look for template named `authentication_otp` (or your custom name)
   - Check status: Should be **"Approved"** (not "Pending" or "Rejected")

2. **Verify Template Name:**
   - Template names are **case-sensitive**
   - Default template name: `gantify_authentication`
   - Check exact spelling matches your template in Meta Business Manager
   - If your template has a different name, set it in `.env`:
     ```bash
     WA_OTP_TEMPLATE_NAME=your_actual_template_name
     ```

3. **Create Template if Missing:**
   - If template doesn't exist, create it following the guide above (lines 324-356)
   - Template name: `authentication_otp`
   - Category: **Authentication**
   - Language: **English**
   - Body: `Your verification code is {{1}}. This code will expire in {{2}} minutes.`
   - Submit for approval (takes 24-48 hours)

4. **Check Template Language:**
   - If using a different language, set `WA_OTP_TEMPLATE_LANGUAGE` in `.env`
   - Example: `WA_OTP_TEMPLATE_LANGUAGE=ms` for Malay

5. **Verify WhatsApp API Credentials:**
   - Ensure `WA_ACCESS_TOKEN` and `WA_PHONE_NUMBER_ID` are correct
   - Token should have permissions to send messages

**Quick Test:**
```bash
# Check if template name is correct
echo $WA_OTP_TEMPLATE_NAME  # Should output: authentication_otp (or your template name)
```

---

## Support

For issues or questions:
- Check logs: `npm run dev` shows detailed console logs
- Test endpoints: Use Swagger UI or cURL examples above
- Database issues: Check Prisma schema and run `npx prisma studio`
- WhatsApp template issues: See troubleshooting section above

# Admin Manual Job Order Flow - Implementation Guide

## 🎯 Overview

This guide documents the new admin manual job order flow that allows administrators to create job orders and trigger gantifier matching without going through the Billplz payment gateway.

---

## 📋 Changes Summary

### ✅ Added
1. **Job Matching Service** (`src/services/job-matching.service.ts`)
   - Reusable service for gantifier discovery and matching
   - Used by both webhook and admin manual trigger

2. **Admin Trigger Endpoint** (`POST /api/job-orders/:id/trigger-matching`)
   - Manually triggers gantifier matching
   - Returns detailed matching results

3. **Admin Manual Payment Endpoint** (`POST /api/payment-actions/create-admin-manual-payment`)
   - Creates payment record without Billplz
   - Marks payment as PAID immediately
   - Uses `ADMIN_MANUAL` payment method

### ❌ Removed
1. **Mark Paid Endpoint** (`PATCH /api/payments/:id/mark-paid`)
   - Removed because it created incomplete workflow
   - Replaced with proper admin flow

### 🔄 Modified
1. **Webhook Route** (`src/routes/webhooks.routes.ts`)
   - Now uses job-matching service
   - Cleaner and more maintainable code

---

## 🔌 API Endpoints

### 1. Create Admin Manual Payment

**Endpoint:** `POST /api/payment-actions/create-admin-manual-payment`

**Purpose:** Create a payment record for admin manual job orders

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_order_id": "job_123",
  "center_id": "center_456",
  "gantifier_fee": 135.00,
  "service_fee": 15.00,
  "description": "Admin manual payment for emergency job"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "payment_789",
    "job_order_id": "job_123",
    "center_id": "center_456",
    "gantifier_fee": 135.00,
    "service_fee": 15.00,
    "total_amount": 150.00,
    "currency": "MYR",
    "payment_method": "ADMIN_MANUAL",
    "status": "PAID",
    "paid_at": "2025-11-18T10:30:00Z",
    "reference_number": "ADMIN-1731924600000",
    "description": "Admin manual payment for emergency job",
    "created_at": "2025-11-18T10:30:00Z"
  },
  "message": "Admin manual payment created successfully. You can now trigger matching."
}
```

---

### 2. Trigger Gantifier Matching

**Endpoint:** `POST /api/job-orders/:id/trigger-matching`

**Purpose:** Manually trigger gantifier discovery and job offer creation

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**
```json
{
  "radius": 20,
  "payment_id": "payment_789"
}
```

**Parameters:**
- `radius` (optional): Search radius in kilometers (default: 20)
- `payment_id` (optional): Link to payment record for tracking

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Successfully matched 5 gantifiers and sent 5 offers",
  "data": {
    "jobOrderId": "job_123",
    "status": "AWAITING_GANTIFIER_RESPONSE",
    "gantifiersFound": 5,
    "offersCreated": 5,
    "offersSent": 5,
    "offers": [
      {
        "id": "offer_001",
        "gantifierId": "gantifier_abc",
        "gantifierName": "Ali Ahmad",
        "status": "DELIVERED",
        "acceptanceToken": "abc12345",
        "sentAt": "2025-11-18T10:31:00Z"
      }
    ]
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "NO_GANTIFIERS_FOUND",
  "message": "No gantifiers found within 20km radius",
  "data": {
    "jobOrderId": "job_123",
    "status": "PENDING",
    "gantifiersFound": 0,
    "offersCreated": 0,
    "offersSent": 0,
    "offers": []
  }
}
```

---

## 🔄 Workflow Comparison

### CENTER User Flow (Normal Payment)

```
1. Create Job Order
   POST /api/job-orders
   → Status: DRAFT

2. Create Payment with Billplz
   POST /api/payment-actions/create-payment
   → Redirects to Billplz gateway

3. User Completes Payment
   → Billplz webhook triggered

4. Webhook Auto-triggers Matching
   → Gantifiers found
   → Offers created
   → WhatsApp sent
   → Status: AWAITING_GANTIFIER_RESPONSE

5. Gantifier Accepts
   GET /api/offers/{token}/accept
   → Status: ASSIGNED

6. Job Completed
   POST /api/job-orders/:id/complete
   → Status: COMPLETED
```

### ADMIN User Flow (Manual Payment)

```
1. Create Job Order
   POST /api/job-orders
   → Status: PENDING

2. Create Admin Manual Payment
   POST /api/payment-actions/create-admin-manual-payment
   → Payment status: PAID
   → Payment method: ADMIN_MANUAL

3. Trigger Matching Manually
   POST /api/job-orders/:id/trigger-matching
   → Gantifiers found
   → Offers created
   → WhatsApp sent
   → Status: AWAITING_GANTIFIER_RESPONSE

4. Gantifier Accepts
   GET /api/offers/{token}/accept
   → Status: ASSIGNED

5. Job Completed
   POST /api/job-orders/:id/complete
   → Status: COMPLETED
```

---

## 🎨 Frontend UI Implementation

### Same Page with Role-Based Conditionals

```jsx
// JobOrderPage.jsx

function JobOrderPage({ user, jobOrder }) {
  const [matchingResults, setMatchingResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleTriggerMatching = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/job-orders/${jobOrder.id}/trigger-matching`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            radius: 20,
            payment_id: jobOrder.payment_id
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        setMatchingResults(result.data);
        // Show success modal
      } else {
        // Show error message
        alert(result.message);
      }
    } catch (error) {
      console.error('Error triggering matching:', error);
      alert('Failed to trigger matching');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="job-order-page">
      <h1>Job Order Details</h1>

      {/* Job Order Information */}
      <JobOrderInfo jobOrder={jobOrder} />

      {/* Payment Section - Role-based rendering */}
      {user.role === 'CENTER' && jobOrder.status === 'DRAFT' && (
        <div className="payment-section">
          <button onClick={handlePaymentGateway}>
            💳 Proceed to Payment
          </button>
        </div>
      )}

      {/* Admin Manual Trigger - Role-based rendering */}
      {user.role === 'ADMIN' && jobOrder.status === 'PENDING' && (
        <div className="admin-actions">
          <button
            onClick={handleTriggerMatching}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? '🔄 Finding Gantifiers...' : '🔍 Find & Send to Gantifiers'}
          </button>
        </div>
      )}

      {/* Status Badge */}
      <StatusBadge status={jobOrder.status} />

      {/* Matching Results Modal */}
      {matchingResults && (
        <MatchingResultsModal
          results={matchingResults}
          onClose={() => setMatchingResults(null)}
        />
      )}
    </div>
  );
}

// MatchingResultsModal.jsx
function MatchingResultsModal({ results, onClose }) {
  return (
    <div className="modal">
      <div className="modal-content">
        <h3>✅ Matching Results</h3>

        <div className="stats">
          <p>🔍 Gantifiers Found: <strong>{results.gantifiersFound}</strong></p>
          <p>📝 Offers Created: <strong>{results.offersCreated}</strong></p>
          <p>📨 WhatsApp Sent: <strong>{results.offersSent}</strong></p>
        </div>

        <h4>Offers Sent To:</h4>
        <ul className="offers-list">
          {results.offers.map(offer => (
            <li key={offer.id}>
              <span className="gantifier-name">{offer.gantifierName}</span>
              <span className="status-badge">{offer.status}</span>
            </li>
          ))}
        </ul>

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

---

## 📝 Complete Example: Admin Creates Job Order

### Step 1: Create Job Order

```bash
POST /api/job-orders
Authorization: Bearer {admin_token}

{
  "id": "job_emergency_001",
  "center_id": "center_123",
  "scheduled_date": "2025-11-20T09:00:00Z",
  "start_time": "09:00",
  "end_time": "17:00",
  "center_location": "3.139003,101.686855",
  "rate": 150.00,
  "total_cost": 150.00,
  "gantifier_fee": 135.00,
  "service_fee": 15.00,
  "job_tasks": ["Childcare assistance"],
  "status": "PENDING"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job_emergency_001",
    "status": "PENDING",
    "center_id": "center_123",
    "scheduled_date": "2025-11-20T09:00:00Z"
  }
}
```

---

### Step 2: Create Admin Manual Payment

```bash
POST /api/payment-actions/create-admin-manual-payment
Authorization: Bearer {admin_token}

{
  "job_order_id": "job_emergency_001",
  "center_id": "center_123",
  "gantifier_fee": 135.00,
  "service_fee": 15.00,
  "description": "Emergency job - manual payment"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "payment_admin_001",
    "status": "PAID",
    "payment_method": "ADMIN_MANUAL"
  },
  "message": "Admin manual payment created successfully. You can now trigger matching."
}
```

---

### Step 3: Trigger Gantifier Matching

```bash
POST /api/job-orders/job_emergency_001/trigger-matching
Authorization: Bearer {admin_token}

{
  "radius": 20,
  "payment_id": "payment_admin_001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully matched 5 gantifiers and sent 5 offers",
  "data": {
    "jobOrderId": "job_emergency_001",
    "status": "AWAITING_GANTIFIER_RESPONSE",
    "gantifiersFound": 5,
    "offersCreated": 5,
    "offersSent": 5,
    "offers": [...]
  }
}
```

---

### Step 4: Gantifier Accepts Offer

Gantifier clicks WhatsApp link:
```
GET /api/offers/{acceptance_token}/accept
```

Job order status changes to: **ASSIGNED**

---

### Step 5: Complete Job

```bash
POST /api/job-orders/job_emergency_001/complete
Authorization: Bearer {admin_token}

{
  "completionRating": 5,
  "clientFeedback": "Excellent service!"
}
```

Job order status changes to: **COMPLETED**

---

## 🧪 Testing Guide

### Test Case 1: Admin Creates Job Order with Manual Matching

```bash
# 1. Create job order
curl -X POST http://localhost:3000/api/job-orders \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test_job_001",
    "center_id": "center_test",
    "scheduled_date": "2025-11-20T09:00:00Z",
    "start_time": "09:00",
    "end_time": "17:00",
    "center_location": "3.139003,101.686855",
    "rate": 150.00,
    "total_cost": 150.00,
    "gantifier_fee": 135.00,
    "service_fee": 15.00,
    "job_tasks": ["Childcare"],
    "status": "PENDING"
  }'

# 2. Create manual payment
curl -X POST http://localhost:3000/api/payment-actions/create-admin-manual-payment \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "job_order_id": "test_job_001",
    "center_id": "center_test",
    "gantifier_fee": 135.00,
    "service_fee": 15.00
  }'

# 3. Trigger matching
curl -X POST http://localhost:3000/api/job-orders/test_job_001/trigger-matching \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "radius": 20
  }'
```

---

## 🔐 Security Considerations

1. **Authentication Required**
   - All endpoints require valid JWT token
   - Use `authenticate` middleware

2. **Role-Based Access**
   - Consider adding role check for admin endpoints
   - Example: `requireRole(['ADMIN', 'CENTER'])`

3. **Validation**
   - All inputs validated via middleware
   - Job order status checked before matching

---

## 📊 Database Changes

### Payment Record with ADMIN_MANUAL

```sql
-- Example payment record created by admin
{
  "id": "payment_123",
  "payment_method": "ADMIN_MANUAL",
  "status": "PAID",
  "paid_at": "2025-11-18T10:00:00Z",
  "billplz_bill_id": null,
  "billplz_url": null,
  "reference_number": "ADMIN-1731924000000"
}
```

### Job Order Status Flow

```
ADMIN FLOW:
PENDING → (trigger matching) → AWAITING_GANTIFIER_RESPONSE → ASSIGNED → COMPLETED

CENTER FLOW:
DRAFT → AWAITING_PAYMENT → PAYMENT_CONFIRMED → (auto matching) → AWAITING_GANTIFIER_RESPONSE → ASSIGNED → COMPLETED
```

---

## ✅ Summary

### What We Built
1. ✅ Reusable job matching service
2. ✅ Admin trigger endpoint for manual matching
3. ✅ Admin manual payment creation
4. ✅ Refactored webhook to use service
5. ✅ Removed incomplete bypass endpoint

### Benefits
- 🚀 Faster admin job creation (no payment gateway)
- 🔄 Reusable matching logic (webhook + admin)
- 📊 Payment tracking for audit trail
- 🎯 Same UI for both flows
- 🧪 Easier testing and development

### Next Steps for Frontend
1. Add role check in UI
2. Show/hide payment button based on role
3. Add "Trigger Matching" button for admin
4. Display matching results modal
5. Update status badges

---

## 🐛 Troubleshooting

### Error: "No gantifiers found"
**Cause:** No active gantifiers within radius
**Solution:**
- Increase radius parameter
- Check gantifier locations in database
- Verify gantifiers have `selected_cities` configured

### Error: "Cannot trigger matching"
**Cause:** Job order in invalid status
**Solution:**
- Check job order status
- Only PENDING or PAYMENT_CONFIRMED can be matched
- Cannot re-trigger already matched jobs

### Error: "Job order not found"
**Cause:** Invalid job order ID
**Solution:**
- Verify job order ID exists
- Check authentication permissions

---

## 📞 Support

For questions or issues:
1. Check server logs: `[JOB-MATCHING]`, `[ADMIN-TRIGGER]`, `[ADMIN-PAYMENT]`
2. Verify job order status in database
3. Check gantifier availability and locations
4. Review authentication tokens

---

**Last Updated:** 2025-11-18
**Version:** 1.0.0

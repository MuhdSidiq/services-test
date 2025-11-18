# Invoice Download Feature - Documentation

## 🎯 Overview

The invoice download feature allows centers, admins, and gantifiers to download PDF invoices for completed job orders. Invoices include comprehensive job details, payment breakdown, and company branding.

---

## 📋 Features

✅ **PDF Generation** - Professional invoices with clean design
✅ **Invoice Numbering** - Format: `IV-YYMMDDSSS` (Year-Month-Day-Serial)
✅ **Role-Based Access** - Centers, admins, and gantifiers can download
✅ **Completed Jobs Only** - Invoices available after job completion
✅ **On-Demand Generation** - No storage overhead
✅ **Comprehensive Information** - All job, payment, and party details

---

## 🔌 API Endpoints

### 1. Download Invoice PDF

**Endpoint:** `GET /api/invoices/job-order/:job_order_id/download`

**Purpose:** Download invoice as PDF file

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Response:**
- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="Invoice-IV-2511180001.pdf"`
- **Body:** PDF binary data

**Response Codes:**
- `200` - Success, PDF file returned
- `400` - Job not completed yet
- `403` - Not authorized to access invoice
- `404` - Job order not found
- `500` - Error generating PDF

**Example:**
```bash
curl -X GET \
  http://localhost:3000/api/invoices/job-order/job_123/download \
  -H "Authorization: Bearer {token}" \
  --output invoice.pdf
```

---

### 2. Preview Invoice Data

**Endpoint:** `GET /api/invoices/job-order/:job_order_id/preview`

**Purpose:** Get invoice data as JSON (for preview or debugging)

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "invoiceNumber": "IV-2511180001",
    "invoiceDate": "2025-11-18T10:00:00Z",
    "jobOrder": {
      "id": "job_123",
      "scheduled_date": "2025-11-20T09:00:00Z",
      "start_time": "09:00",
      "end_time": "17:00",
      "status": "COMPLETED",
      "completed_at": "2025-11-20T17:30:00Z"
    },
    "center": {
      "name": "Little Stars Childcare",
      "email": "contact@littlestars.com",
      "phone": "+60123456789",
      "address": "123 Main Street",
      "city": "Kuala Lumpur",
      "state": "Wilayah Persekutuan"
    },
    "gantifier": {
      "full_name": "Ali Ahmad",
      "email": "ali@example.com",
      "phone": "+60198765432"
    },
    "payment": {
      "gantifier_fee": 135.00,
      "service_fee": 15.00,
      "total_amount": 150.00,
      "payment_method": "billplz",
      "status": "PAID",
      "paid_at": "2025-11-19T14:30:00Z"
    }
  }
}
```

---

## 🔐 Authorization

### Who Can Access Invoices?

| Role | Access Level | Details |
|------|-------------|----------|
| **Admin** | All invoices | Can download any invoice |
| **Center** | Own invoices only | Can download invoices for their job orders |
| **Gantifier** | Assigned jobs only | Can download invoices for jobs they completed |

### Authorization Flow:

```
1. User makes request with JWT token
2. System validates token and extracts user info
3. System checks job order ownership:
   - Admin → Always authorized
   - Center → Check if job order belongs to center
   - Gantifier → Check if assigned to this job
4. If authorized → Generate and return PDF
5. If not authorized → Return 403 Forbidden
```

---

## 📄 Invoice Format

### Invoice Number Format: `IV-YYMMDDSSS`

- **IV** - Invoice prefix
- **YY** - Year (2 digits)
- **MM** - Month (2 digits)
- **DD** - Day (2 digits)
- **SSS** - Serial number (3 digits, daily counter)

**Examples:**
- `IV-2511180001` - First invoice on November 18, 2025
- `IV-2511180042` - 42nd invoice on November 18, 2025
- `IV-2512250123` - 123rd invoice on December 25, 2025

### Invoice Contents:

#### **Header Section:**
- Gantify company logo and information
- Invoice number and date

#### **Billing Information:**
- **Bill To:** Center details (name, address, contact)
- **Service By:** Gantifier details (name, contact)

#### **Job Details:**
- Job Order ID
- Scheduled date and time
- Location (coordinates)
- Tasks performed
- Status and completion date

#### **Payment Breakdown:**
| Description | Amount |
|-------------|--------|
| Gantifier Fee | RM 135.00 |
| Gantify Service Fee | RM 15.00 |
| **TOTAL** | **RM 150.00** |

#### **Payment Information:**
- Payment method (Billplz, Admin Manual, etc.)
- Payment status
- Reference number
- Paid date

#### **Footer:**
- Thank you message
- Generation timestamp
- Legal disclaimer

---

## 🎨 Invoice Design

### Colors:
- **Primary:** Blue (#2563EB)
- **Secondary:** Gray (#64748B)
- **Background:** Light Gray (#F1F5F9)

### Layout:
- **Size:** A4
- **Margins:** 50pt all sides
- **Font:** System default (Helvetica)
- **Sections:** Clearly separated with lines and spacing

### Professional Features:
- ✅ Clean, modern design
- ✅ Clear section headers
- ✅ Highlighted total amount
- ✅ Alternating row colors for readability
- ✅ Company branding
- ✅ Legal disclaimers

---

## 🔄 Workflow

### When Can Invoices Be Downloaded?

```
Job Order Lifecycle:
┌─────────────┐
│   PENDING   │ ❌ No invoice
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  ASSIGNED   │ ❌ No invoice
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ IN_PROGRESS │ ❌ No invoice
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  COMPLETED  │ ✅ Invoice available
└─────────────┘
```

**Requirements:**
1. ✅ Job order status = `COMPLETED`
2. ✅ Payment exists and processed
3. ✅ User has authorization

---

## 💻 Frontend Integration

### React Example:

```jsx
// InvoiceDownloadButton.jsx

function InvoiceDownloadButton({ jobOrderId, jobStatus }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    // Check if job is completed
    if (jobStatus !== 'COMPLETED') {
      alert('Invoice only available for completed jobs');
      return;
    }

    setDownloading(true);

    try {
      const response = await fetch(
        `/api/invoices/job-order/${jobOrderId}/download`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to download invoice');
        return;
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'invoice.pdf';

      // Convert response to blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('Invoice downloaded successfully');
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Failed to download invoice');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading || jobStatus !== 'COMPLETED'}
      className="btn-download"
    >
      {downloading ? '⬇️ Downloading...' : '📄 Download Invoice'}
    </button>
  );
}
```

### Preview Before Download:

```jsx
// InvoicePreview.jsx

function InvoicePreview({ jobOrderId }) {
  const [invoiceData, setInvoiceData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/invoices/job-order/${jobOrderId}/preview`,
        {
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        }
      );

      const result = await response.json();

      if (result.success) {
        setInvoiceData(result.data);
      }
    } catch (error) {
      console.error('Error loading preview:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={loadPreview}>Preview Invoice</button>

      {invoiceData && (
        <div className="invoice-preview">
          <h3>Invoice: {invoiceData.invoiceNumber}</h3>
          <p>Date: {new Date(invoiceData.invoiceDate).toLocaleDateString()}</p>

          <h4>Center:</h4>
          <p>{invoiceData.center.name}</p>
          <p>{invoiceData.center.email}</p>

          <h4>Payment:</h4>
          <p>Gantifier Fee: RM {invoiceData.payment.gantifier_fee}</p>
          <p>Service Fee: RM {invoiceData.payment.service_fee}</p>
          <p><strong>Total: RM {invoiceData.payment.total_amount}</strong></p>
        </div>
      )}
    </div>
  );
}
```

---

## 🧪 Testing

### Test Case 1: Download Invoice as Center

```bash
# 1. Create and complete a job
# (Assuming job_completed_001 exists and is COMPLETED)

# 2. Download invoice
curl -X GET \
  http://localhost:3000/api/invoices/job-order/job_completed_001/download \
  -H "Authorization: Bearer {center_token}" \
  --output test_invoice.pdf

# 3. Verify PDF
# - Open test_invoice.pdf
# - Check all information is present
# - Verify invoice number format
```

### Test Case 2: Authorization Checks

```bash
# Try to download invoice for job you don't own
curl -X GET \
  http://localhost:3000/api/invoices/job-order/other_job_123/download \
  -H "Authorization: Bearer {center_token}"

# Expected: 403 Forbidden
```

### Test Case 3: Download Before Completion

```bash
# Try to download invoice for incomplete job
curl -X GET \
  http://localhost:3000/api/invoices/job-order/job_pending_001/download \
  -H "Authorization: Bearer {token}"

# Expected: 400 Bad Request
# Message: "Invoice only available for completed jobs"
```

### Test Case 4: Preview Invoice Data

```bash
curl -X GET \
  http://localhost:3000/api/invoices/job-order/job_completed_001/preview \
  -H "Authorization: Bearer {token}"

# Expected: JSON with invoice data
```

---

## ⚙️ Configuration

### Environment Variables

No additional environment variables required. The invoice service uses existing configuration.

### Dependencies

```json
{
  "dependencies": {
    "pdfkit": "^0.15.0"
  },
  "devDependencies": {
    "@types/pdfkit": "^0.13.4"
  }
}
```

**Installation:**
```bash
npm install pdfkit @types/pdfkit
```

---

## 🔧 Technical Details

### Invoice Service (`src/services/invoice.service.ts`)

**Key Functions:**

1. **`generateInvoiceNumber(date)`**
   - Generates unique invoice number
   - Format: IV-YYMMDDSSS
   - Uses daily counter from completed jobs

2. **`generateInvoicePDF(jobOrderId)`**
   - Fetches job order with all related data
   - Validates job is completed
   - Creates PDF document using PDFKit
   - Returns PDF buffer

3. **`getInvoiceData(jobOrderId)`**
   - Returns structured invoice data
   - Used for preview endpoint
   - Validates authorization

### Invoice Routes (`src/routes/invoices.routes.ts`)

**Key Features:**

1. **Authentication Required**
   - All routes protected by `authenticate` middleware

2. **Authorization Check**
   - `checkInvoiceAuthorization()` function
   - Role-based access control

3. **PDF Streaming**
   - Efficient buffer streaming
   - Proper content headers
   - Download as attachment

---

## 📊 Database Schema

### No Schema Changes Required

The invoice feature uses existing tables:
- `job_orders` (for job details)
- `payments` (for payment information)
- `centers` (for center details)
- `gantifiers` (for gantifier details)
- `users` (for contact information)

**Invoice numbers are generated dynamically** - no storage needed.

---

## 🐛 Troubleshooting

### Error: "Invoice only available for completed jobs"

**Cause:** Job order status is not `COMPLETED`

**Solution:**
- Check job order status: `GET /api/job-orders/:id`
- Complete the job first: `POST /api/job-orders/:id/complete`

---

### Error: "Not authorized to download this invoice"

**Cause:** User doesn't have permission

**Solution:**
- Centers: Can only download their own invoices
- Gantifiers: Can only download for jobs they completed
- Use admin account for all invoices

---

### Error: "No payment found for job order"

**Cause:** Payment record missing

**Solution:**
- Verify payment exists: `GET /api/payments/job-order/:job_order_id`
- For admin orders: Create manual payment first

---

### PDF Generation Fails

**Cause:** PDFKit library not installed or corrupted

**Solution:**
```bash
# Reinstall PDFKit
npm uninstall pdfkit
npm install pdfkit

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 🚀 Future Enhancements

Potential features for future versions:

1. **Email Invoices**
   - Automatically email invoice after completion
   - Manual "Email Invoice" button

2. **Invoice History**
   - Store generated invoices in database
   - Track download history

3. **Custom Branding**
   - Per-center logos
   - Customizable colors and layout

4. **Multiple Formats**
   - HTML invoices
   - Excel/CSV exports

5. **Batch Download**
   - Download multiple invoices as ZIP
   - Date range filtering

6. **Invoice Templates**
   - Different templates for different job types
   - Seasonal designs

---

## 📞 Support

For issues or questions:

1. Check server logs: `[INVOICE]` prefix
2. Verify job order status
3. Check authorization roles
4. Review PDF generation errors

**Log Examples:**
```
[INVOICE] Download request for job order: job_123 by user: user_456
[INVOICE] ✅ Authorization: Center owns job order
[INVOICE] Generating PDF for job order: job_123
[INVOICE] ✅ PDF generated successfully: Invoice-IV-2511180001.pdf
```

---

## 📝 Summary

### What We Built:
- ✅ PDF invoice generation service
- ✅ Download endpoint with authorization
- ✅ Preview endpoint for JSON data
- ✅ Invoice number generator (IV-YYMMDDSSS)
- ✅ Professional PDF design
- ✅ Role-based access control

### Key Features:
- 📄 On-demand PDF generation
- 🔐 Secure authorization
- 🎨 Professional design
- 📱 API-ready for frontend integration
- ✅ Available only for completed jobs

### Next Steps:
1. Install dependencies: `npm install`
2. Test endpoints with Postman or cURL
3. Integrate with frontend
4. Add "Download Invoice" button to completed jobs

---

**Last Updated:** 2025-11-18
**Version:** 1.0.0
**Dependencies:** pdfkit ^0.15.0

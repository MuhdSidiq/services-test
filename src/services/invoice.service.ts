// src/services/invoice.service.ts
import PDFDocument from 'pdfkit';
import { PrismaClient } from '../../app/generated/prisma';

const prisma = new PrismaClient();

/**
 * Generates invoice number in format: IV-YYMMDDSSS
 * Where SSS is a daily serial number
 *
 * @param date - Date for the invoice
 * @returns Invoice number (e.g., IV-2511180001)
 */
export async function generateInvoiceNumber(date: Date = new Date()): Promise<string> {
  const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;

  // Get count of invoices created today
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Count completed job orders for today (as proxy for invoices)
  const todayCount = await prisma.job_orders.count({
    where: {
      status: 'COMPLETED',
      completed_at: {
        gte: startOfDay,
        lte: endOfDay
      }
    }
  });

  // Serial number is count + 1, padded to 3 digits
  const serial = String(todayCount + 1).padStart(3, '0');

  return `IV-${datePrefix}${serial}`;
}

/**
 * Interface for invoice data
 */
export interface InvoiceData {
  jobOrder: any;
  center: any;
  gantifier?: any;
  payment: any;
  invoiceNumber: string;
  invoiceDate: Date;
}

/**
 * Generates invoice PDF for a completed job order
 *
 * @param jobOrderId - Job order ID
 * @returns PDF buffer
 */
export async function generateInvoicePDF(jobOrderId: string): Promise<Buffer> {
  // Fetch job order with all related data
  const jobOrder = await prisma.job_orders.findUnique({
    where: { id: jobOrderId },
    include: {
      centers: true,
      gantifiers: {
        include: {
          users: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        }
      },
      payments: true
    }
  });

  if (!jobOrder) {
    throw new Error(`Job order not found: ${jobOrderId}`);
  }

  // Validate job is completed
  if (jobOrder.status !== 'COMPLETED') {
    throw new Error(`Job order must be completed to generate invoice. Current status: ${jobOrder.status}`);
  }

  if (!jobOrder.payments) {
    throw new Error(`No payment found for job order: ${jobOrderId}`);
  }

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(jobOrder.completed_at || new Date());
  const invoiceDate = jobOrder.completed_at || new Date();

  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  // Collect PDF data in buffer
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  // Generate PDF content
  await generatePDFContent(doc, {
    jobOrder,
    center: jobOrder.centers,
    gantifier: jobOrder.gantifiers,
    payment: jobOrder.payments,
    invoiceNumber,
    invoiceDate
  });

  // Finalize PDF
  doc.end();

  // Return promise that resolves with buffer
  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

/**
 * Generates PDF content for invoice
 */
async function generatePDFContent(doc: PDFKit.PDFDocument, data: InvoiceData): Promise<void> {
  const { jobOrder, center, gantifier, payment, invoiceNumber, invoiceDate } = data;

  // Page dimensions
  const pageWidth = doc.page.width;
  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Colors
  const primaryColor = '#2563EB'; // Blue
  const secondaryColor = '#64748B'; // Gray
  const lightGray = '#F1F5F9';

  // Header - Company Info
  doc.fontSize(24)
     .fillColor(primaryColor)
     .text('GANTIFY', marginLeft, 50, { bold: true });

  doc.fontSize(10)
     .fillColor(secondaryColor)
     .text('Childcare Services Provider', marginLeft, 80)
     .text('Email: info@gantify.com', marginLeft, 95)
     .text('Phone: +60 12-345 6789', marginLeft, 110);

  // Invoice Title and Number
  doc.fontSize(28)
     .fillColor(primaryColor)
     .text('INVOICE', pageWidth - marginRight - 150, 50, { width: 150, align: 'right' });

  doc.fontSize(11)
     .fillColor(secondaryColor)
     .text(`Invoice #: ${invoiceNumber}`, pageWidth - marginRight - 150, 85, { width: 150, align: 'right' })
     .text(`Date: ${invoiceDate.toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}`,
           pageWidth - marginRight - 150, 100, { width: 150, align: 'right' });

  // Horizontal line
  doc.moveTo(marginLeft, 140)
     .lineTo(pageWidth - marginRight, 140)
     .strokeColor(lightGray)
     .lineWidth(2)
     .stroke();

  let yPosition = 160;

  // Bill To Section
  doc.fontSize(12)
     .fillColor(primaryColor)
     .text('BILL TO:', marginLeft, yPosition, { underline: true });

  yPosition += 20;

  doc.fontSize(11)
     .fillColor('#000000')
     .text(center.name, marginLeft, yPosition, { bold: true });

  yPosition += 15;

  doc.fontSize(10)
     .fillColor(secondaryColor)
     .text(center.address, marginLeft, yPosition)
     .text(`${center.city}, ${center.state} ${center.postcode}`, marginLeft, yPosition + 12)
     .text(`Email: ${center.email}`, marginLeft, yPosition + 24)
     .text(`Phone: ${center.phone}`, marginLeft, yPosition + 36);

  // Service Provider Section (if assigned)
  if (gantifier) {
    doc.fontSize(12)
       .fillColor(primaryColor)
       .text('SERVICE PROVIDED BY:', pageWidth / 2 + 20, 160, { underline: true });

    doc.fontSize(11)
       .fillColor('#000000')
       .text(gantifier.full_name, pageWidth / 2 + 20, 180, { bold: true });

    doc.fontSize(10)
       .fillColor(secondaryColor)
       .text(`Email: ${gantifier.users?.email || 'N/A'}`, pageWidth / 2 + 20, 195)
       .text(`Phone: ${gantifier.users?.phone || 'N/A'}`, pageWidth / 2 + 20, 207);
  }

  yPosition = 250;

  // Job Details Section
  doc.fontSize(12)
     .fillColor(primaryColor)
     .text('JOB DETAILS', marginLeft, yPosition, { underline: true });

  yPosition += 25;

  // Job details table
  const jobDetailsData = [
    ['Job Order ID:', jobOrder.id],
    ['Scheduled Date:', new Date(jobOrder.scheduled_date).toLocaleDateString('en-MY', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })],
    ['Time:', `${jobOrder.start_time} - ${jobOrder.end_time}`],
    ['Location:', jobOrder.center_location],
    ['Tasks:', jobOrder.job_tasks.join(', ')],
    ['Status:', jobOrder.status],
    ['Completed:', jobOrder.completed_at ? new Date(jobOrder.completed_at).toLocaleDateString('en-MY') : 'N/A']
  ];

  doc.fontSize(10);
  jobDetailsData.forEach(([label, value]) => {
    doc.fillColor(secondaryColor)
       .text(label, marginLeft, yPosition, { width: 150, continued: true })
       .fillColor('#000000')
       .text(value, { width: contentWidth - 150 });
    yPosition += 15;
  });

  yPosition += 20;

  // Payment Breakdown Section
  doc.fontSize(12)
     .fillColor(primaryColor)
     .text('PAYMENT BREAKDOWN', marginLeft, yPosition, { underline: true });

  yPosition += 25;

  // Table header
  doc.rect(marginLeft, yPosition, contentWidth, 25)
     .fillAndStroke(lightGray, secondaryColor);

  doc.fontSize(10)
     .fillColor('#000000')
     .text('Description', marginLeft + 10, yPosition + 8, { width: contentWidth - 150 })
     .text('Amount (MYR)', pageWidth - marginRight - 140, yPosition + 8, { width: 130, align: 'right' });

  yPosition += 30;

  // Line items
  const lineItems = [
    { description: 'Gantifier Fee', amount: Number(payment.gantifier_fee) },
    { description: 'Gantify Service Fee', amount: Number(payment.service_fee) }
  ];

  lineItems.forEach((item, index) => {
    if (index % 2 === 0) {
      doc.rect(marginLeft, yPosition - 5, contentWidth, 20)
         .fillAndStroke('#FAFAFA', '#FAFAFA');
    }

    doc.fontSize(10)
       .fillColor('#000000')
       .text(item.description, marginLeft + 10, yPosition)
       .text(item.amount.toFixed(2), pageWidth - marginRight - 140, yPosition, { width: 130, align: 'right' });

    yPosition += 20;
  });

  // Subtotal line
  yPosition += 5;
  doc.moveTo(marginLeft, yPosition)
     .lineTo(pageWidth - marginRight, yPosition)
     .strokeColor(secondaryColor)
     .lineWidth(1)
     .stroke();

  yPosition += 10;

  // Total
  doc.fontSize(12)
     .fillColor('#000000')
     .text('TOTAL', marginLeft + 10, yPosition, { bold: true })
     .text(`RM ${Number(payment.total_amount).toFixed(2)}`, pageWidth - marginRight - 140, yPosition,
           { width: 130, align: 'right', bold: true });

  yPosition += 30;

  // Payment Information
  doc.fontSize(10)
     .fillColor(secondaryColor)
     .text(`Payment Method: ${payment.payment_method || 'N/A'}`, marginLeft, yPosition)
     .text(`Payment Status: ${payment.status}`, marginLeft, yPosition + 15)
     .text(`Reference: ${payment.reference_number || payment.billplz_bill_id || 'N/A'}`, marginLeft, yPosition + 30);

  if (payment.paid_at) {
    doc.text(`Paid On: ${new Date(payment.paid_at).toLocaleDateString('en-MY')}`, marginLeft, yPosition + 45);
  }

  // Footer
  const footerY = doc.page.height - 80;

  doc.moveTo(marginLeft, footerY)
     .lineTo(pageWidth - marginRight, footerY)
     .strokeColor(lightGray)
     .lineWidth(1)
     .stroke();

  doc.fontSize(9)
     .fillColor(secondaryColor)
     .text('Thank you for using Gantify!', marginLeft, footerY + 15, { align: 'center', width: contentWidth })
     .text('This is a computer-generated invoice and does not require a signature.',
           marginLeft, footerY + 30, { align: 'center', width: contentWidth })
     .text(`Generated on ${new Date().toLocaleString('en-MY')}`,
           marginLeft, footerY + 45, { align: 'center', width: contentWidth });
}

/**
 * Gets invoice data for a job order
 */
export async function getInvoiceData(jobOrderId: string): Promise<InvoiceData> {
  const jobOrder = await prisma.job_orders.findUnique({
    where: { id: jobOrderId },
    include: {
      centers: true,
      gantifiers: {
        include: {
          users: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        }
      },
      payments: true
    }
  });

  if (!jobOrder) {
    throw new Error(`Job order not found: ${jobOrderId}`);
  }

  if (jobOrder.status !== 'COMPLETED') {
    throw new Error(`Job order must be completed. Current status: ${jobOrder.status}`);
  }

  if (!jobOrder.payments) {
    throw new Error(`No payment found for job order: ${jobOrderId}`);
  }

  const invoiceNumber = await generateInvoiceNumber(jobOrder.completed_at || new Date());
  const invoiceDate = jobOrder.completed_at || new Date();

  return {
    jobOrder,
    center: jobOrder.centers,
    gantifier: jobOrder.gantifiers,
    payment: jobOrder.payments,
    invoiceNumber,
    invoiceDate
  };
}

export default {
  generateInvoiceNumber,
  generateInvoicePDF,
  getInvoiceData
};

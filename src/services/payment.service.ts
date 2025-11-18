import { PrismaClient, PaymentStatus, JobPaymentStatus, JobOrderStatus } from '../../app/generated/prisma';
import axios from 'axios';

const prisma = new PrismaClient();

interface CreatePaymentParams {
  job_order_id: string;
  center_id: string;
  gantifier_fee: number;
  service_fee: number;
  description?: string;
}

interface BillplzBillResponse {
  id: string;
  collection_id: string;
  paid: boolean;
  state: string;
  amount: number;
  paid_amount: number;
  due_at: string;
  email: string;
  mobile: string;
  name: string;
  url: string;
  reference_1_label: string;
  reference_1: string;
  reference_2_label: string;
  reference_2: string;
  redirect_url: string;
  callback_url: string;
  description: string;
}

export class PaymentService {
  private billplzApiKey: string;
  private billplzCollectionId: string;
  private billplzBaseUrl: string;

  constructor() {
    this.billplzApiKey = process.env.BILLPLZ_API_KEY || '';
    this.billplzCollectionId = process.env.BILLPLZ_COLLECTION_ID || '';
    this.billplzBaseUrl = process.env.BILLPLZ_BASE_URL || 'https://www.billplz.com/api/v3';

    if (!this.billplzApiKey || !this.billplzCollectionId) {
      console.warn('⚠️  Billplz credentials not configured. Payment creation will fail.');
    }
  }

  /**
   * Create a payment record and generate Billplz bill
   */
  async createPayment(params: CreatePaymentParams): Promise<any> {
    const { job_order_id, center_id, gantifier_fee, service_fee, description } = params;

    // Validate job order exists and is in correct state
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: job_order_id },
      include: {
        centers: true,
      },
    });

    if (!jobOrder) {
      throw new Error(`Job order not found: ${job_order_id}`);
    }

    if (jobOrder.status !== JobOrderStatus.DRAFT) {
      throw new Error(`Job order must be in DRAFT status. Current status: ${jobOrder.status}`);
    }

    // Calculate total amount
    const total_amount = gantifier_fee + service_fee;

    // Create payment record
    const payment = await prisma.payments.create({
      data: {
        job_order_id,
        center_id,
        gantifier_fee,
        service_fee,
        total_amount,
        currency: 'MYR',
        status: PaymentStatus.PENDING,
        description: description || `Payment for job order ${job_order_id}`,
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    // Generate Billplz bill
    try {
      const billplzBill = await this.createBillplzBill({
        email: jobOrder.centers.email,
        mobile: jobOrder.centers.phone,
        name: jobOrder.centers.name,
        amount: total_amount,
        description: payment.description || '',
        reference_1_label: 'Job Order ID',
        reference_1: job_order_id,
        reference_2_label: 'Payment ID',
        reference_2: payment.id,
        callback_url: `${process.env.API_BASE_URL}/api/webhooks/billplz`,
        redirect_url: `${process.env.FRONTEND_URL}/payment/complete`,
      });

      // Update payment with Billplz details
      const updatedPayment = await prisma.payments.update({
        where: { id: payment.id },
        data: {
          billplz_bill_id: billplzBill.id,
          billplz_collection_id: billplzBill.collection_id,
          billplz_url: billplzBill.url,
        },
        include: {
          job_orders: true,
          centers: true,
        },
      });

      // Update job order status
      await prisma.job_orders.update({
        where: { id: job_order_id },
        data: {
          status: JobOrderStatus.AWAITING_PAYMENT,
          gantifier_fee,
          service_fee,
          total_cost: total_amount,
          payment_status: JobPaymentStatus.UNPAID,
        },
      });

      return {
        payment: updatedPayment,
        payment_url: billplzBill.url,
      };
    } catch (error: any) {
      // Mark payment as failed if Billplz bill creation fails
      await prisma.payments.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failed_at: new Date(),
          failure_reason: error.message || 'Failed to create Billplz bill',
        },
      });

      throw new Error(`Failed to create payment bill: ${error.message}`);
    }
  }

  /**
   * Create Billplz bill via API
   */
  private async createBillplzBill(params: {
    email: string;
    mobile: string;
    name: string;
    amount: number;
    description: string;
    reference_1_label: string;
    reference_1: string;
    reference_2_label: string;
    reference_2: string;
    callback_url: string;
    redirect_url: string;
  }): Promise<BillplzBillResponse> {
    const billData = {
      collection_id: this.billplzCollectionId,
      email: params.email,
      mobile: params.mobile.replace(/\D/g, ''), // Remove non-numeric characters
      name: params.name,
      amount: Math.round(params.amount * 100), // Convert to cents
      description: params.description,
      reference_1_label: params.reference_1_label,
      reference_1: params.reference_1,
      reference_2_label: params.reference_2_label,
      reference_2: params.reference_2,
      callback_url: params.callback_url,
      redirect_url: params.redirect_url,
    };

    try {
      // Convert to URLSearchParams for form-urlencoded
      const formData = new URLSearchParams();
      Object.entries(billData).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });

      // Use explicit Authorization header to match curl behavior
      const authHeader = 'Basic ' + Buffer.from(`${this.billplzApiKey}:`).toString('base64');

      const response = await axios.post(
        `${this.billplzBaseUrl}/bills`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authHeader,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      const errorDetails = error.response?.data || error.message;
      console.error('Billplz API Error:', JSON.stringify(errorDetails, null, 2));
      const errorMessage = typeof errorDetails === 'object'
        ? JSON.stringify(errorDetails)
        : errorDetails;
      throw new Error(`Billplz API error: ${errorMessage}`);
    }
  }

  /**
   * Handle Billplz webhook callback
   */
  async handleBillplzWebhook(webhookData: any): Promise<void> {
    const { id: billplz_bill_id, paid, state } = webhookData;

    // Find payment by Billplz bill ID
    const payment = await prisma.payments.findUnique({
      where: { billplz_bill_id },
      include: {
        job_orders: true,
      },
    });

    if (!payment) {
      throw new Error(`Payment not found for Billplz bill ID: ${billplz_bill_id}`);
    }

    // Update payment status based on Billplz state
    if (paid && state === 'paid') {
      await this.markPaymentAsPaid(payment.id);
    } else if (state === 'deleted') {
      await this.markPaymentAsCancelled(payment.id);
    } else {
      console.log(`Unhandled Billplz state: ${state} for payment ${payment.id}`);
    }
  }

  /**
   * Mark payment as paid and trigger account balance update
   */
  async markPaymentAsPaid(payment_id: string): Promise<any> {
    const payment = await prisma.payments.findUnique({
      where: { id: payment_id },
      include: {
        job_orders: true,
      },
    });

    if (!payment) {
      throw new Error(`Payment not found: ${payment_id}`);
    }

    if (payment.status === PaymentStatus.PAID) {
      return payment; // Already paid
    }

    // Update payment status
    const updatedPayment = await prisma.payments.update({
      where: { id: payment_id },
      data: {
        status: PaymentStatus.PAID,
        paid_at: new Date(),
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    // Update job order status
    await prisma.job_orders.update({
      where: { id: payment.job_order_id },
      data: {
        status: JobOrderStatus.PAYMENT_CONFIRMED,
      },
    });

    return updatedPayment;
  }

  /**
   * Mark payment as failed
   */
  async markPaymentAsFailed(payment_id: string, failure_reason?: string): Promise<any> {
    const payment = await prisma.payments.update({
      where: { id: payment_id },
      data: {
        status: PaymentStatus.FAILED,
        failed_at: new Date(),
        failure_reason: failure_reason || 'Payment failed',
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    // Update job order back to DRAFT for retry
    await prisma.job_orders.update({
      where: { id: payment.job_order_id },
      data: {
        status: JobOrderStatus.DRAFT,
      },
    });

    return payment;
  }

  /**
   * Mark payment as cancelled
   */
  async markPaymentAsCancelled(payment_id: string): Promise<any> {
    const payment = await prisma.payments.update({
      where: { id: payment_id },
      data: {
        status: PaymentStatus.CANCELLED,
      },
      include: {
        job_orders: true,
        centers: true,
      },
    });

    // Update job order status
    await prisma.job_orders.update({
      where: { id: payment.job_order_id },
      data: {
        status: JobOrderStatus.CANCELLED_BY_CENTER,
      },
    });

    return payment;
  }

  /**
   * Get payment by job order ID
   */
  async getPaymentByJobOrder(job_order_id: string): Promise<any> {
    return prisma.payments.findUnique({
      where: { job_order_id },
      include: {
        job_orders: true,
        centers: true,
        account_transactions: true,
      },
    });
  }

  /**
   * Get payment by Billplz bill ID
   */
  async getPaymentByBillplzId(billplz_bill_id: string): Promise<any> {
    return prisma.payments.findUnique({
      where: { billplz_bill_id },
      include: {
        job_orders: true,
        centers: true,
      },
    });
  }

  /**
   * Check if payment is completed (paid and held in account)
   */
  isPaymentCompleted(payment: any): boolean {
    return payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.COMPLETED;
  }
}

export default new PaymentService();

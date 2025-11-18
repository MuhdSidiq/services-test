import { PrismaClient, AccountStatus } from '../../app/generated/prisma';
import { TransactionService } from './transaction.service';

const prisma = new PrismaClient();

export class AccountService {
  private transactionService: TransactionService;

  constructor() {
    this.transactionService = new TransactionService();
  }

  /**
   * Create account for a center
   */
  async createAccount(center_id: string): Promise<any> {
    // Check if account already exists
    const existing = await prisma.accounts.findUnique({
      where: { center_id },
    });

    if (existing) {
      throw new Error(`Account already exists for center: ${center_id}`);
    }

    // Verify center exists
    const center = await prisma.centers.findUnique({
      where: { id: center_id },
    });

    if (!center) {
      throw new Error(`Center not found: ${center_id}`);
    }

    return prisma.accounts.create({
      data: {
        center_id,
        balance: 0,
        total_paid: 0,
        total_completed: 0,
        total_refunded: 0,
        currency: 'MYR',
        status: AccountStatus.ACTIVE,
      },
      include: {
        centers: true,
      },
    });
  }

  /**
   * Get or create account for a center
   */
  async getOrCreateAccount(center_id: string): Promise<any> {
    let account = await prisma.accounts.findUnique({
      where: { center_id },
      include: {
        centers: true,
      },
    });

    if (!account) {
      account = await this.createAccount(center_id);
    }

    return account;
  }

  /**
   * Get account by ID
   */
  async getAccountById(account_id: string): Promise<any> {
    return prisma.accounts.findUnique({
      where: { id: account_id },
      include: {
        centers: true,
        account_transactions: {
          orderBy: { created_at: 'desc' },
          take: 50,
        },
        withdrawal_requests: {
          orderBy: { requested_at: 'desc' },
        },
      },
    });
  }

  /**
   * Get account by center ID
   */
  async getAccountByCenterId(center_id: string): Promise<any> {
    return prisma.accounts.findUnique({
      where: { center_id },
      include: {
        centers: true,
        account_transactions: {
          orderBy: { created_at: 'desc' },
          take: 50,
        },
      },
    });
  }

  /**
   * Hold payment amount in account (when payment is confirmed)
   * Creates HOLD transaction and updates balance
   */
  async holdPayment(params: {
    center_id: string;
    amount: number;
    payment_id: string;
    job_order_id: string;
    description: string;
  }): Promise<any> {
    const { center_id, amount, payment_id, job_order_id, description } = params;

    // Get or create account
    const account = await this.getOrCreateAccount(center_id);

    if (account.status !== AccountStatus.ACTIVE) {
      throw new Error(`Account is not active. Status: ${account.status}`);
    }

    // Use transaction service to create HOLD transaction
    return this.transactionService.createTransaction({
      account_id: account.id,
      transaction_type: 'HOLD',
      amount,
      payment_id,
      job_order_id,
      description,
    });
  }

  /**
   * Deduct amount from account (when job is completed)
   * Creates DEDUCT transaction and updates balance
   */
  async deductAmount(params: {
    center_id: string;
    amount: number;
    payment_id?: string;
    job_order_id: string;
    description: string;
  }): Promise<any> {
    const { center_id, amount, payment_id, job_order_id, description } = params;

    const account = await this.getAccountByCenterId(center_id);

    if (!account) {
      throw new Error(`Account not found for center: ${center_id}`);
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new Error(`Account is not active. Status: ${account.status}`);
    }

    // Check sufficient balance
    const currentBalance = parseFloat(account.balance.toString());
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance. Current: ${currentBalance}, Required: ${amount}`
      );
    }

    // Use transaction service to create DEDUCT transaction
    return this.transactionService.createTransaction({
      account_id: account.id,
      transaction_type: 'DEDUCT',
      amount,
      payment_id,
      job_order_id,
      description,
    });
  }

  /**
   * Refund amount to account (when job is cancelled or gantifier no-show)
   * Creates REFUND transaction and updates balance
   */
  async refundAmount(params: {
    center_id: string;
    amount: number;
    payment_id?: string;
    job_order_id: string;
    description: string;
  }): Promise<any> {
    const { center_id, amount, payment_id, job_order_id, description } = params;

    const account = await this.getAccountByCenterId(center_id);

    if (!account) {
      throw new Error(`Account not found for center: ${center_id}`);
    }

    // Use transaction service to create REFUND transaction
    return this.transactionService.createTransaction({
      account_id: account.id,
      transaction_type: 'REFUND',
      amount,
      payment_id,
      job_order_id,
      description,
    });
  }

  /**
   * Process withdrawal from account
   * Creates WITHDRAW transaction and updates balance
   */
  async processWithdrawal(params: {
    center_id: string;
    amount: number;
    job_order_id: string; // Use a system-generated job order ID for withdrawals
    description: string;
  }): Promise<any> {
    const { center_id, amount, job_order_id, description } = params;

    const account = await this.getAccountByCenterId(center_id);

    if (!account) {
      throw new Error(`Account not found for center: ${center_id}`);
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new Error(`Account is not active. Status: ${account.status}`);
    }

    // Check sufficient balance
    const currentBalance = parseFloat(account.balance.toString());
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance for withdrawal. Current: ${currentBalance}, Requested: ${amount}`
      );
    }

    // Use transaction service to create WITHDRAW transaction
    return this.transactionService.createTransaction({
      account_id: account.id,
      transaction_type: 'WITHDRAW',
      amount,
      job_order_id,
      description,
    });
  }

  /**
   * Suspend account (prevents new transactions)
   */
  async suspendAccount(account_id: string): Promise<any> {
    return prisma.accounts.update({
      where: { id: account_id },
      data: {
        status: AccountStatus.SUSPENDED,
      },
      include: {
        centers: true,
      },
    });
  }

  /**
   * Activate account
   */
  async activateAccount(account_id: string): Promise<any> {
    return prisma.accounts.update({
      where: { id: account_id },
      data: {
        status: AccountStatus.ACTIVE,
      },
      include: {
        centers: true,
      },
    });
  }

  /**
   * Close account (final state, cannot be reopened)
   */
  async closeAccount(account_id: string): Promise<any> {
    const account = await this.getAccountById(account_id);

    if (!account) {
      throw new Error(`Account not found: ${account_id}`);
    }

    // Check balance is zero
    const balance = parseFloat(account.balance.toString());
    if (balance !== 0) {
      throw new Error(
        `Cannot close account with non-zero balance. Current balance: ${balance}`
      );
    }

    // Check no pending withdrawals
    const pendingWithdrawals = await prisma.withdrawal_requests.count({
      where: {
        account_id,
        status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
      },
    });

    if (pendingWithdrawals > 0) {
      throw new Error(`Cannot close account with pending withdrawal requests`);
    }

    return prisma.accounts.update({
      where: { id: account_id },
      data: {
        status: AccountStatus.CLOSED,
      },
      include: {
        centers: true,
      },
    });
  }

  /**
   * Get account balance
   */
  async getBalance(center_id: string): Promise<number> {
    const account = await prisma.accounts.findUnique({
      where: { center_id },
      select: { balance: true },
    });

    if (!account) {
      return 0;
    }

    return parseFloat(account.balance.toString());
  }

  /**
   * Get account summary
   */
  async getAccountSummary(center_id: string): Promise<any> {
    const account = await prisma.accounts.findUnique({
      where: { center_id },
      select: {
        id: true,
        balance: true,
        total_paid: true,
        total_completed: true,
        total_refunded: true,
        currency: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!account) {
      return null;
    }

    // Get transaction counts
    const transactionCounts = await prisma.account_transactions.groupBy({
      by: ['transaction_type'],
      where: { account_id: account.id },
      _count: { id: true },
    });

    // Get pending withdrawal requests
    const pendingWithdrawals = await prisma.withdrawal_requests.findMany({
      where: {
        account_id: account.id,
        status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
      },
      select: {
        id: true,
        amount: true,
        status: true,
        requested_at: true,
      },
    });

    return {
      ...account,
      transaction_counts: transactionCounts.map((item) => ({
        transaction_type: item.transaction_type,
        count: item._count.id,
      })),
      pending_withdrawals: pendingWithdrawals,
    };
  }
}

export default new AccountService();

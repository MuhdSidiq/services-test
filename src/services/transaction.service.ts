import { PrismaClient, AccountTransactionType } from '../../app/generated/prisma';

const prisma = new PrismaClient();

interface CreateTransactionParams {
  account_id: string;
  transaction_type: 'HOLD' | 'DEDUCT' | 'REFUND' | 'WITHDRAW' | 'FEE';
  amount: number;
  payment_id?: string;
  job_order_id: string;
  description: string;
  metadata?: any;
}

export class TransactionService {
  /**
   * Create a transaction with atomic balance update
   * This ensures balance integrity through database transaction
   */
  async createTransaction(params: CreateTransactionParams): Promise<any> {
    const {
      account_id,
      transaction_type,
      amount,
      payment_id,
      job_order_id,
      description,
      metadata,
    } = params;

    // Validate amount is positive
    if (amount <= 0) {
      throw new Error('Transaction amount must be positive');
    }

    // Get current account
    const account = await prisma.accounts.findUnique({
      where: { id: account_id },
    });

    if (!account) {
      throw new Error(`Account not found: ${account_id}`);
    }

    const currentBalance = parseFloat(account.balance.toString());
    let newBalance: number;

    // Calculate new balance based on transaction type
    switch (transaction_type) {
      case 'HOLD':
        // HOLD adds to balance (money coming in from payment)
        newBalance = currentBalance + amount;
        break;

      case 'DEDUCT':
        // DEDUCT removes from balance (money going out to gantifier)
        if (currentBalance < amount) {
          throw new Error(
            `Insufficient balance for DEDUCT. Current: ${currentBalance}, Required: ${amount}`
          );
        }
        newBalance = currentBalance - amount;
        break;

      case 'REFUND':
        // REFUND adds to balance (money returned from held amount)
        newBalance = currentBalance + amount;
        break;

      case 'WITHDRAW':
        // WITHDRAW removes from balance (center withdrawing funds)
        if (currentBalance < amount) {
          throw new Error(
            `Insufficient balance for WITHDRAW. Current: ${currentBalance}, Required: ${amount}`
          );
        }
        newBalance = currentBalance - amount;
        break;

      case 'FEE':
        // FEE removes from balance (platform fees)
        if (currentBalance < amount) {
          throw new Error(
            `Insufficient balance for FEE. Current: ${currentBalance}, Required: ${amount}`
          );
        }
        newBalance = currentBalance - amount;
        break;

      default:
        throw new Error(`Invalid transaction type: ${transaction_type}`);
    }

    // Use Prisma transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create transaction record
      const transaction = await tx.account_transactions.create({
        data: {
          account_id,
          transaction_type: transaction_type as AccountTransactionType,
          amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          payment_id,
          job_order_id,
          description,
          metadata,
        },
        include: {
          accounts: true,
          payments: true,
          job_orders: true,
        },
      });

      // Update account balance and aggregates
      const updateData: any = {
        balance: newBalance,
      };

      // Update total_paid when HOLD transaction (money coming in)
      if (transaction_type === 'HOLD') {
        const newTotalPaid = parseFloat(account.total_paid.toString()) + amount;
        updateData.total_paid = newTotalPaid;
      }

      // Update total_completed when DEDUCT transaction (job completed)
      if (transaction_type === 'DEDUCT') {
        const newTotalCompleted = parseFloat(account.total_completed.toString()) + amount;
        updateData.total_completed = newTotalCompleted;
      }

      // Update total_refunded when REFUND transaction
      if (transaction_type === 'REFUND') {
        const newTotalRefunded = parseFloat(account.total_refunded.toString()) + amount;
        updateData.total_refunded = newTotalRefunded;
      }

      await tx.accounts.update({
        where: { id: account_id },
        data: updateData,
      });

      return transaction;
    });

    return result;
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transaction_id: string): Promise<any> {
    return prisma.account_transactions.findUnique({
      where: { id: transaction_id },
      include: {
        accounts: {
          include: {
            centers: true,
          },
        },
        payments: true,
        job_orders: true,
      },
    });
  }

  /**
   * Get transactions for an account
   */
  async getTransactionsByAccount(
    account_id: string,
    options?: {
      limit?: number;
      offset?: number;
      transaction_type?: AccountTransactionType;
    }
  ): Promise<any[]> {
    const where: any = { account_id };
    if (options?.transaction_type) {
      where.transaction_type = options.transaction_type;
    }

    return prisma.account_transactions.findMany({
      where,
      skip: options?.offset || 0,
      take: options?.limit || 50,
      include: {
        payments: {
          select: {
            id: true,
            billplz_bill_id: true,
            status: true,
            total_amount: true,
          },
        },
        job_orders: {
          select: {
            id: true,
            scheduled_date: true,
            status: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get transactions for a job order
   */
  async getTransactionsByJobOrder(job_order_id: string): Promise<any[]> {
    return prisma.account_transactions.findMany({
      where: { job_order_id },
      include: {
        accounts: {
          include: {
            centers: true,
          },
        },
        payments: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Get transaction summary for an account
   */
  async getTransactionSummary(
    account_id: string,
    dateRange?: { start_date?: Date; end_date?: Date }
  ): Promise<any> {
    const where: any = { account_id };

    if (dateRange?.start_date || dateRange?.end_date) {
      where.created_at = {};
      if (dateRange.start_date) where.created_at.gte = dateRange.start_date;
      if (dateRange.end_date) where.created_at.lte = dateRange.end_date;
    }

    const summary = await prisma.account_transactions.groupBy({
      by: ['transaction_type'],
      where,
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
    });

    return summary.map((item) => ({
      transaction_type: item.transaction_type,
      total_amount: item._sum.amount || 0,
      count: item._count.id,
    }));
  }

  /**
   * Verify transaction integrity for an account
   * Recalculates balance from all transactions and compares with current balance
   */
  async verifyAccountIntegrity(account_id: string): Promise<{
    is_valid: boolean;
    current_balance: number;
    calculated_balance: number;
    difference: number;
  }> {
    // Get current account balance
    const account = await prisma.accounts.findUnique({
      where: { id: account_id },
      select: { balance: true },
    });

    if (!account) {
      throw new Error(`Account not found: ${account_id}`);
    }

    const currentBalance = parseFloat(account.balance.toString());

    // Get all transactions and recalculate balance
    const transactions = await prisma.account_transactions.findMany({
      where: { account_id },
      orderBy: { created_at: 'asc' },
      select: {
        transaction_type: true,
        amount: true,
      },
    });

    let calculatedBalance = 0;

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount.toString());

      switch (tx.transaction_type) {
        case 'HOLD':
        case 'REFUND':
          calculatedBalance += amount;
          break;
        case 'DEDUCT':
        case 'WITHDRAW':
        case 'FEE':
          calculatedBalance -= amount;
          break;
      }
    }

    const difference = Math.abs(currentBalance - calculatedBalance);
    const is_valid = difference < 0.01; // Allow for floating point precision issues

    return {
      is_valid,
      current_balance: currentBalance,
      calculated_balance: calculatedBalance,
      difference,
    };
  }

  /**
   * Get transaction statistics for reporting
   */
  async getTransactionStatistics(
    account_id: string,
    dateRange?: { start_date?: Date; end_date?: Date }
  ): Promise<any> {
    const where: any = { account_id };

    if (dateRange?.start_date || dateRange?.end_date) {
      where.created_at = {};
      if (dateRange.start_date) where.created_at.gte = dateRange.start_date;
      if (dateRange.end_date) where.created_at.lte = dateRange.end_date;
    }

    const [summary, totalCount, latestTransaction] = await Promise.all([
      this.getTransactionSummary(account_id, dateRange),
      prisma.account_transactions.count({ where }),
      prisma.account_transactions.findFirst({
        where,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          transaction_type: true,
          amount: true,
          created_at: true,
        },
      }),
    ]);

    return {
      summary,
      total_transactions: totalCount,
      latest_transaction: latestTransaction,
      period: {
        start_date: dateRange?.start_date || null,
        end_date: dateRange?.end_date || null,
      },
    };
  }
}

export default new TransactionService();

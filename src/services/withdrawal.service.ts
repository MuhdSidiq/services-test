import { PrismaClient, WithdrawalStatus } from '../../app/generated/prisma';
import { AccountService } from './account.service';

const prisma = new PrismaClient();

interface CreateWithdrawalParams {
  center_id: string;
  amount: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  notes?: string;
}

interface ProcessWithdrawalParams {
  withdrawal_id: string;
  processed_by: string;
  admin_notes?: string;
}

export class WithdrawalService {
  private accountService: AccountService;

  constructor() {
    this.accountService = new AccountService();
  }

  /**
   * Create a withdrawal request
   */
  async createWithdrawalRequest(params: CreateWithdrawalParams): Promise<any> {
    const {
      center_id,
      amount,
      bank_name,
      bank_account_number,
      bank_account_name,
      notes,
    } = params;

    // Validate amount
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0');
    }

    // Get account
    const account = await this.accountService.getAccountByCenterId(center_id);

    if (!account) {
      throw new Error(`Account not found for center: ${center_id}`);
    }

    // Check account status
    if (account.status !== 'ACTIVE') {
      throw new Error(`Cannot create withdrawal for ${account.status} account`);
    }

    // Check sufficient balance
    const currentBalance = parseFloat(account.balance.toString());
    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance. Available: ${currentBalance}, Requested: ${amount}`
      );
    }

    // Check for existing pending withdrawals
    const pendingWithdrawals = await prisma.withdrawal_requests.count({
      where: {
        account_id: account.id,
        status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED, WithdrawalStatus.PROCESSING] },
      },
    });

    if (pendingWithdrawals > 0) {
      throw new Error(
        'Cannot create new withdrawal request while another is pending'
      );
    }

    // Create withdrawal request
    return prisma.withdrawal_requests.create({
      data: {
        account_id: account.id,
        center_id,
        amount,
        requested_balance: currentBalance,
        bank_name,
        bank_account_number,
        bank_account_name,
        notes,
        status: WithdrawalStatus.PENDING,
      },
      include: {
        accounts: true,
        centers: true,
      },
    });
  }

  /**
   * Get withdrawal request by ID
   */
  async getWithdrawalById(withdrawal_id: string): Promise<any> {
    return prisma.withdrawal_requests.findUnique({
      where: { id: withdrawal_id },
      include: {
        accounts: {
          include: {
            centers: true,
          },
        },
        centers: true,
      },
    });
  }

  /**
   * Get withdrawal requests for a center
   */
  async getWithdrawalsByCenterId(
    center_id: string,
    options?: { status?: WithdrawalStatus; limit?: number; offset?: number }
  ): Promise<any> {
    const where: any = { center_id };
    if (options?.status) {
      where.status = options.status;
    }

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip: options?.offset || 0,
        take: options?.limit || 50,
        include: {
          accounts: {
            select: {
              balance: true,
              currency: true,
            },
          },
        },
        orderBy: { requested_at: 'desc' },
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    return {
      data: withdrawals,
      total,
    };
  }

  /**
   * Get all pending withdrawal requests (for admin)
   */
  async getPendingWithdrawals(options?: { limit?: number; offset?: number }): Promise<any> {
    const where = {
      status: {
        in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED, WithdrawalStatus.PROCESSING],
      },
    };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip: options?.offset || 0,
        take: options?.limit || 50,
        include: {
          accounts: true,
          centers: true,
        },
        orderBy: { requested_at: 'asc' }, // Oldest first
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    return {
      data: withdrawals,
      total,
    };
  }

  /**
   * Approve withdrawal request (admin action)
   */
  async approveWithdrawal(params: {
    withdrawal_id: string;
    processed_by: string;
    admin_notes?: string;
  }): Promise<any> {
    const { withdrawal_id, processed_by, admin_notes } = params;

    const withdrawal = await this.getWithdrawalById(withdrawal_id);

    if (!withdrawal) {
      throw new Error(`Withdrawal request not found: ${withdrawal_id}`);
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new Error(
        `Cannot approve withdrawal with status: ${withdrawal.status}`
      );
    }

    // Verify account still has sufficient balance
    const account = withdrawal.accounts;
    const currentBalance = parseFloat(account.balance.toString());
    const requestedAmount = parseFloat(withdrawal.amount.toString());

    if (currentBalance < requestedAmount) {
      throw new Error(
        `Insufficient balance. Current: ${currentBalance}, Requested: ${requestedAmount}`
      );
    }

    return prisma.withdrawal_requests.update({
      where: { id: withdrawal_id },
      data: {
        status: WithdrawalStatus.APPROVED,
        processed_by,
        admin_notes,
      },
      include: {
        accounts: true,
        centers: true,
      },
    });
  }

  /**
   * Reject withdrawal request (admin action)
   */
  async rejectWithdrawal(params: {
    withdrawal_id: string;
    processed_by: string;
    admin_notes: string;
  }): Promise<any> {
    const { withdrawal_id, processed_by, admin_notes } = params;

    const withdrawal = await this.getWithdrawalById(withdrawal_id);

    if (!withdrawal) {
      throw new Error(`Withdrawal request not found: ${withdrawal_id}`);
    }

    if (!['PENDING', 'APPROVED'].includes(withdrawal.status)) {
      throw new Error(
        `Cannot reject withdrawal with status: ${withdrawal.status}`
      );
    }

    return prisma.withdrawal_requests.update({
      where: { id: withdrawal_id },
      data: {
        status: WithdrawalStatus.REJECTED,
        processed_by,
        admin_notes,
        processed_at: new Date(),
      },
      include: {
        accounts: true,
        centers: true,
      },
    });
  }

  /**
   * Mark withdrawal as processing (admin started bank transfer)
   */
  async markAsProcessing(params: {
    withdrawal_id: string;
    processed_by: string;
    admin_notes?: string;
  }): Promise<any> {
    const { withdrawal_id, processed_by, admin_notes } = params;

    const withdrawal = await this.getWithdrawalById(withdrawal_id);

    if (!withdrawal) {
      throw new Error(`Withdrawal request not found: ${withdrawal_id}`);
    }

    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      throw new Error(
        `Cannot process withdrawal with status: ${withdrawal.status}. Must be APPROVED first.`
      );
    }

    return prisma.withdrawal_requests.update({
      where: { id: withdrawal_id },
      data: {
        status: WithdrawalStatus.PROCESSING,
        processed_by,
        admin_notes,
      },
      include: {
        accounts: true,
        centers: true,
      },
    });
  }

  /**
   * Complete withdrawal (admin confirms bank transfer completed)
   * This deducts the amount from account balance
   */
  async completeWithdrawal(params: ProcessWithdrawalParams): Promise<any> {
    const { withdrawal_id, processed_by, admin_notes } = params;

    const withdrawal = await this.getWithdrawalById(withdrawal_id);

    if (!withdrawal) {
      throw new Error(`Withdrawal request not found: ${withdrawal_id}`);
    }

    if (![WithdrawalStatus.APPROVED, WithdrawalStatus.PROCESSING].includes(withdrawal.status)) {
      throw new Error(
        `Cannot complete withdrawal with status: ${withdrawal.status}`
      );
    }

    // Use Prisma transaction to ensure atomicity
    return prisma.$transaction(async (tx) => {
      // Create WITHDRAW transaction (this will update account balance)
      await this.accountService.processWithdrawal({
        center_id: withdrawal.center_id,
        amount: parseFloat(withdrawal.amount.toString()),
        job_order_id: `WITHDRAWAL_${withdrawal.id}`, // System-generated job order reference
        description: `Withdrawal request ${withdrawal.id} - Bank transfer completed`,
      });

      // Update withdrawal status
      const completedWithdrawal = await tx.withdrawal_requests.update({
        where: { id: withdrawal_id },
        data: {
          status: WithdrawalStatus.COMPLETED,
          processed_by,
          admin_notes,
          processed_at: new Date(),
        },
        include: {
          accounts: true,
          centers: true,
        },
      });

      return completedWithdrawal;
    });
  }

  /**
   * Cancel withdrawal request (can be done by center or admin)
   */
  async cancelWithdrawal(params: {
    withdrawal_id: string;
    cancelled_by?: string;
    admin_notes?: string;
  }): Promise<any> {
    const { withdrawal_id, cancelled_by, admin_notes } = params;

    const withdrawal = await this.getWithdrawalById(withdrawal_id);

    if (!withdrawal) {
      throw new Error(`Withdrawal request not found: ${withdrawal_id}`);
    }

    if (![WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED].includes(withdrawal.status)) {
      throw new Error(
        `Cannot cancel withdrawal with status: ${withdrawal.status}`
      );
    }

    return prisma.withdrawal_requests.update({
      where: { id: withdrawal_id },
      data: {
        status: WithdrawalStatus.CANCELLED,
        processed_by: cancelled_by,
        admin_notes,
        processed_at: new Date(),
      },
      include: {
        accounts: true,
        centers: true,
      },
    });
  }

  /**
   * Get withdrawal statistics for reporting
   */
  async getWithdrawalStatistics(
    center_id?: string,
    dateRange?: { start_date?: Date; end_date?: Date }
  ): Promise<any> {
    const where: any = {};
    if (center_id) where.center_id = center_id;

    if (dateRange?.start_date || dateRange?.end_date) {
      where.requested_at = {};
      if (dateRange.start_date) where.requested_at.gte = dateRange.start_date;
      if (dateRange.end_date) where.requested_at.lte = dateRange.end_date;
    }

    const [summary, totalCount] = await Promise.all([
      prisma.withdrawal_requests.groupBy({
        by: ['status'],
        where,
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    return {
      summary: summary.map((item) => ({
        status: item.status,
        total_amount: item._sum.amount || 0,
        count: item._count.id,
      })),
      total_requests: totalCount,
      period: {
        start_date: dateRange?.start_date || null,
        end_date: dateRange?.end_date || null,
      },
    };
  }
}

export default new WithdrawalService();

// src/services/analytics-aggregation.service.ts
import { PrismaClient, PeriodType } from '../../app/generated/prisma';

const prisma = new PrismaClient();

/**
 * Helper functions for date manipulation
 */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfQuarter(date: Date): Date {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3);
  d.setMonth(quarter * 3);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfQuarter(date: Date): Date {
  const d = startOfQuarter(date);
  d.setMonth(d.getMonth() + 3);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(11);
  d.setDate(31);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Get period boundaries based on type
 */
function getPeriodBounds(date: Date, periodType: PeriodType): { start: Date; end: Date } {
  switch (periodType) {
    case 'DAY':
      return { start: startOfDay(date), end: endOfDay(date) };
    case 'WEEK':
      return { start: startOfWeek(date), end: endOfWeek(date) };
    case 'MONTH':
      return { start: startOfMonth(date), end: endOfMonth(date) };
    case 'QUARTER':
      return { start: startOfQuarter(date), end: endOfQuarter(date) };
    case 'YEAR':
      return { start: startOfYear(date), end: endOfYear(date) };
    default:
      return { start: startOfDay(date), end: endOfDay(date) };
  }
}

/**
 * Calculate hours between two dates
 */
function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/**
 * Calculate minutes between two dates
 */
function minutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60);
}

// ========================================
// CENTER ANALYTICS
// ========================================

/**
 * Calculate center statistics for a specific period
 */
async function calculateCenterStats(
  centerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<any> {
  console.log(`[ANALYTICS] Calculating center stats for ${centerId} (${periodStart.toISOString()} - ${periodEnd.toISOString()})`);

  // Fetch all jobs for this center in the period
  const jobs = await prisma.job_orders.findMany({
    where: {
      center_id: centerId,
      created_at: {
        gte: periodStart,
        lte: periodEnd
      }
    },
    include: {
      payments: true,
      gantifiers: true
    }
  });

  // Job status breakdown
  const completedJobs = jobs.filter(j => j.status === 'COMPLETED');
  const cancelledJobs = jobs.filter(j => j.status === 'CANCELLED_BY_CENTER' || j.status === 'CANCELLED_BY_GANTIFIER' || j.status === 'CANCELLED_BY_SYSTEM');
  const pendingJobs = jobs.filter(j => j.status === 'PENDING' || j.status === 'AWAITING_PAYMENT' || j.status === 'PAYMENT_CONFIRMED' || j.status === 'AWAITING_GANTIFIER_RESPONSE');
  const inProgressJobs = jobs.filter(j => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED');

  // Financial metrics
  const totalSpent = jobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.total_amount) : 0);
  }, 0);

  const totalServiceFees = jobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.service_fee) : 0);
  }, 0);

  const totalGantifierFees = jobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.gantifier_fee) : 0);
  }, 0);

  const avgJobCost = jobs.length > 0 ? totalSpent / jobs.length : 0;

  // Performance metrics
  let avgCompletionTime = null;
  if (completedJobs.length > 0) {
    const completionTimes = completedJobs
      .filter(j => j.completed_at && j.created_at)
      .map(j => hoursBetween(j.created_at, j.completed_at!));

    avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      : null;
  }

  const completionRate = jobs.length > 0
    ? (completedJobs.length / jobs.length) * 100
    : null;

  const cancellationRate = jobs.length > 0
    ? (cancelledJobs.length / jobs.length) * 100
    : null;

  // Engagement metrics
  const uniqueGantifiers = new Set(
    jobs.filter(j => j.gantifier_id).map(j => j.gantifier_id)
  ).size;

  // Repeat gantifiers (worked more than once)
  const gantifierCounts = jobs
    .filter(j => j.gantifier_id)
    .reduce((acc, job) => {
      acc[job.gantifier_id!] = (acc[job.gantifier_id!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const repeatGantifiers = Object.values(gantifierCounts).filter(count => count > 1).length;

  return {
    total_jobs: jobs.length,
    completed_jobs: completedJobs.length,
    cancelled_jobs: cancelledJobs.length,
    pending_jobs: pendingJobs.length,
    in_progress_jobs: inProgressJobs.length,
    total_spent: totalSpent,
    avg_job_cost: avgJobCost,
    total_service_fees: totalServiceFees,
    total_gantifier_fees: totalGantifierFees,
    avg_completion_time: avgCompletionTime,
    completion_rate: completionRate,
    cancellation_rate: cancellationRate,
    unique_gantifiers: uniqueGantifiers,
    repeat_gantifiers: repeatGantifiers
  };
}

/**
 * Aggregate center statistics for all centers
 */
export async function aggregateCenterStats(
  date: Date = new Date(),
  periodType: PeriodType = 'DAY'
): Promise<void> {
  console.log(`[ANALYTICS] Aggregating center stats for ${periodType} (${date.toISOString()})`);

  const { start: periodStart, end: periodEnd } = getPeriodBounds(date, periodType);

  // Get all centers
  const centers = await prisma.centers.findMany({
    select: { id: true, name: true }
  });

  console.log(`[ANALYTICS] Processing ${centers.length} centers...`);

  for (const center of centers) {
    try {
      const stats = await calculateCenterStats(center.id, periodStart, periodEnd);

      await prisma.analytics_center_stats.upsert({
        where: {
          center_id_period_start_period_type: {
            center_id: center.id,
            period_start: periodStart,
            period_type: periodType
          }
        },
        update: {
          ...stats,
          period_end: periodEnd,
          updated_at: new Date()
        },
        create: {
          center_id: center.id,
          period_start: periodStart,
          period_end: periodEnd,
          period_type: periodType,
          ...stats
        }
      });

      console.log(`[ANALYTICS] ✅ Updated stats for center: ${center.name}`);
    } catch (error) {
      console.error(`[ANALYTICS] ❌ Error processing center ${center.name}:`, error);
    }
  }

  console.log(`[ANALYTICS] ✅ Center stats aggregation complete`);
}

// ========================================
// GANTIFIER ANALYTICS
// ========================================

/**
 * Calculate gantifier statistics for a specific period
 */
async function calculateGantifierStats(
  gantifierId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<any> {
  console.log(`[ANALYTICS] Calculating gantifier stats for ${gantifierId}`);

  // Job offers received
  const offers = await prisma.job_offers.findMany({
    where: {
      gantifier_id: gantifierId,
      sent_at: {
        gte: periodStart,
        lte: periodEnd
      }
    }
  });

  const acceptedOffers = offers.filter(o => o.is_accepted === 'YES');
  const declinedOffers = offers.filter(o => o.is_accepted === 'NO');

  // Jobs assigned
  const assignedJobs = await prisma.job_orders.findMany({
    where: {
      gantifier_id: gantifierId,
      created_at: {
        gte: periodStart,
        lte: periodEnd
      }
    },
    include: {
      payments: true,
      centers: true
    }
  });

  const completedJobs = assignedJobs.filter(j => j.status === 'COMPLETED');
  const cancelledJobs = assignedJobs.filter(j => j.status === 'CANCELLED_BY_CENTER' || j.status === 'CANCELLED_BY_GANTIFIER' || j.status === 'CANCELLED_BY_SYSTEM');

  // Financial metrics
  const totalEarnings = completedJobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.gantifier_fee) : 0);
  }, 0);

  const avgEarningsPerJob = completedJobs.length > 0
    ? totalEarnings / completedJobs.length
    : 0;

  // Performance metrics
  const gantifier = await prisma.gantifiers.findUnique({
    where: { id: gantifierId }
  });

  const avgRating = gantifier?.average_rating || null;

  const completionRate = assignedJobs.length > 0
    ? (completedJobs.length / assignedJobs.length) * 100
    : null;

  const acceptanceRate = offers.length > 0
    ? (acceptedOffers.length / offers.length) * 100
    : null;

  // Average response time (time from offer sent to responded)
  const respondedOffers = offers.filter(o => o.responded_at);
  let avgResponseTime = null;
  if (respondedOffers.length > 0) {
    const responseTimes = respondedOffers.map(o =>
      minutesBetween(o.sent_at, o.responded_at!)
    );
    avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  // Engagement metrics
  const uniqueCenters = new Set(
    assignedJobs.map(j => j.center_id)
  ).size;

  const centerCounts = assignedJobs.reduce((acc, job) => {
    acc[job.center_id] = (acc[job.center_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const repeatCenters = Object.values(centerCounts).filter(count => count > 1).length;

  // Active days (days with at least one job)
  const activeDays = new Set(
    assignedJobs.map(j => startOfDay(j.created_at).toISOString())
  ).size;

  return {
    total_offers_received: offers.length,
    total_offers_accepted: acceptedOffers.length,
    total_offers_declined: declinedOffers.length,
    total_jobs_assigned: assignedJobs.length,
    completed_jobs: completedJobs.length,
    cancelled_jobs: cancelledJobs.length,
    total_earnings: totalEarnings,
    avg_earnings_per_job: avgEarningsPerJob,
    avg_rating: avgRating,
    completion_rate: completionRate,
    acceptance_rate: acceptanceRate,
    avg_response_time: avgResponseTime,
    unique_centers: uniqueCenters,
    repeat_centers: repeatCenters,
    active_days: activeDays
  };
}

/**
 * Aggregate gantifier statistics for all gantifiers
 */
export async function aggregateGantifierStats(
  date: Date = new Date(),
  periodType: PeriodType = 'DAY'
): Promise<void> {
  console.log(`[ANALYTICS] Aggregating gantifier stats for ${periodType} (${date.toISOString()})`);

  const { start: periodStart, end: periodEnd } = getPeriodBounds(date, periodType);

  // Get all gantifiers
  const gantifiers = await prisma.gantifiers.findMany({
    select: { id: true, full_name: true }
  });

  console.log(`[ANALYTICS] Processing ${gantifiers.length} gantifiers...`);

  for (const gantifier of gantifiers) {
    try {
      const stats = await calculateGantifierStats(gantifier.id, periodStart, periodEnd);

      await prisma.analytics_gantifier_stats.upsert({
        where: {
          gantifier_id_period_start_period_type: {
            gantifier_id: gantifier.id,
            period_start: periodStart,
            period_type: periodType
          }
        },
        update: {
          ...stats,
          period_end: periodEnd,
          updated_at: new Date()
        },
        create: {
          gantifier_id: gantifier.id,
          period_start: periodStart,
          period_end: periodEnd,
          period_type: periodType,
          ...stats
        }
      });

      console.log(`[ANALYTICS] ✅ Updated stats for gantifier: ${gantifier.full_name}`);
    } catch (error) {
      console.error(`[ANALYTICS] ❌ Error processing gantifier ${gantifier.full_name}:`, error);
    }
  }

  console.log(`[ANALYTICS] ✅ Gantifier stats aggregation complete`);
}

// ========================================
// PLATFORM ANALYTICS
// ========================================

/**
 * Calculate platform-wide statistics for a specific period
 */
async function calculatePlatformStats(
  periodStart: Date,
  periodEnd: Date
): Promise<any> {
  console.log(`[ANALYTICS] Calculating platform stats`);

  // Job metrics
  const allJobs = await prisma.job_orders.findMany({
    where: {
      created_at: {
        gte: periodStart,
        lte: periodEnd
      }
    },
    include: {
      payments: true,
      job_offers: true
    }
  });

  const completedJobs = allJobs.filter(j => j.status === 'COMPLETED');
  const cancelledJobs = allJobs.filter(j => j.status === 'CANCELLED_BY_CENTER' || j.status === 'CANCELLED_BY_GANTIFIER' || j.status === 'CANCELLED_BY_SYSTEM');
  const pendingJobs = allJobs.filter(j => j.status === 'PENDING' || j.status === 'AWAITING_PAYMENT' || j.status === 'PAYMENT_CONFIRMED' || j.status === 'AWAITING_GANTIFIER_RESPONSE');
  const inProgressJobs = allJobs.filter(j => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED');

  // User metrics
  const totalCenters = await prisma.centers.count();
  const activeCenters = await prisma.centers.count({
    where: {
      job_orders: {
        some: {
          created_at: {
            gte: periodStart,
            lte: periodEnd
          }
        }
      }
    }
  });

  const newCenters = await prisma.centers.count({
    where: {
      created_at: {
        gte: periodStart,
        lte: periodEnd
      }
    }
  });

  const totalGantifiers = await prisma.gantifiers.count();
  const activeGantifiers = await prisma.gantifiers.count({
    where: {
      job_orders: {
        some: {
          created_at: {
            gte: periodStart,
            lte: periodEnd
          }
        }
      }
    }
  });

  const newGantifiers = await prisma.gantifiers.count({
    where: {
      created_at: {
        gte: periodStart,
        lte: periodEnd
      }
    }
  });

  // Financial metrics
  const totalRevenue = allJobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.total_amount) : 0);
  }, 0);

  const totalServiceFees = allJobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.service_fee) : 0);
  }, 0);

  const totalGantifierFees = allJobs.reduce((sum, job) => {
    return sum + (job.payments ? Number(job.payments.gantifier_fee) : 0);
  }, 0);

  const avgTransactionValue = allJobs.length > 0
    ? totalRevenue / allJobs.length
    : 0;

  // Engagement metrics
  const avgJobsPerCenter = activeCenters > 0
    ? allJobs.length / activeCenters
    : null;

  const avgJobsPerGantifier = activeGantifiers > 0
    ? completedJobs.length / activeGantifiers
    : null;

  const platformCompletionRate = allJobs.length > 0
    ? (completedJobs.length / allJobs.length) * 100
    : null;

  // Average platform rating from all gantifiers
  const gantifiersWithRatings = await prisma.gantifiers.findMany({
    where: {
      average_rating: {
        gt: 0
      }
    },
    select: {
      average_rating: true
    }
  });

  const avgPlatformRating = gantifiersWithRatings.length > 0
    ? gantifiersWithRatings.reduce((sum, g) => sum + g.average_rating, 0) / gantifiersWithRatings.length
    : null;

  // Matching metrics
  const jobsWithOffers = allJobs.filter(j => j.job_offers && j.job_offers.length > 0);
  const avgOffersPerJob = jobsWithOffers.length > 0
    ? allJobs.reduce((sum, job) => sum + (job.job_offers?.length || 0), 0) / jobsWithOffers.length
    : null;

  // Average time to match (from job creation to first offer accepted)
  const matchedJobs = allJobs.filter(j => j.gantifier_id);
  let avgTimeToMatch = null;
  if (matchedJobs.length > 0) {
    const matchTimes = await Promise.all(
      matchedJobs.map(async (job) => {
        const firstAcceptedOffer = await prisma.job_offers.findFirst({
          where: {
            job_order_id: job.id,
            is_accepted: 'YES'
          },
          orderBy: {
            responded_at: 'asc'
          }
        });

        if (firstAcceptedOffer && firstAcceptedOffer.responded_at) {
          return hoursBetween(job.created_at, firstAcceptedOffer.responded_at);
        }
        return null;
      })
    );

    const validMatchTimes = matchTimes.filter(t => t !== null) as number[];
    avgTimeToMatch = validMatchTimes.length > 0
      ? validMatchTimes.reduce((sum, time) => sum + time, 0) / validMatchTimes.length
      : null;
  }

  const matchSuccessRate = allJobs.length > 0
    ? (matchedJobs.length / allJobs.length) * 100
    : null;

  return {
    total_jobs: allJobs.length,
    completed_jobs: completedJobs.length,
    cancelled_jobs: cancelledJobs.length,
    pending_jobs: pendingJobs.length,
    in_progress_jobs: inProgressJobs.length,
    total_centers: totalCenters,
    active_centers: activeCenters,
    new_centers: newCenters,
    total_gantifiers: totalGantifiers,
    active_gantifiers: activeGantifiers,
    new_gantifiers: newGantifiers,
    total_revenue: totalRevenue,
    total_service_fees: totalServiceFees,
    total_gantifier_fees: totalGantifierFees,
    avg_transaction_value: avgTransactionValue,
    avg_jobs_per_center: avgJobsPerCenter,
    avg_jobs_per_gantifier: avgJobsPerGantifier,
    platform_completion_rate: platformCompletionRate,
    avg_platform_rating: avgPlatformRating,
    avg_offers_per_job: avgOffersPerJob,
    avg_time_to_match: avgTimeToMatch,
    match_success_rate: matchSuccessRate
  };
}

/**
 * Aggregate platform-wide statistics
 */
export async function aggregatePlatformStats(
  date: Date = new Date(),
  periodType: PeriodType = 'DAY'
): Promise<void> {
  console.log(`[ANALYTICS] Aggregating platform stats for ${periodType} (${date.toISOString()})`);

  const { start: periodStart, end: periodEnd } = getPeriodBounds(date, periodType);

  try {
    const stats = await calculatePlatformStats(periodStart, periodEnd);

    await prisma.analytics_platform_stats.upsert({
      where: {
        period_start_period_type: {
          period_start: periodStart,
          period_type: periodType
        }
      },
      update: {
        ...stats,
        period_end: periodEnd,
        updated_at: new Date()
      },
      create: {
        period_start: periodStart,
        period_end: periodEnd,
        period_type: periodType,
        ...stats
      }
    });

    console.log(`[ANALYTICS] ✅ Platform stats aggregation complete`);
  } catch (error) {
    console.error(`[ANALYTICS] ❌ Error aggregating platform stats:`, error);
    throw error;
  }
}

// ========================================
// MAIN AGGREGATION FUNCTION
// ========================================

/**
 * Main function to aggregate all analytics
 */
export async function aggregateAllStats(
  date: Date = new Date(),
  periodType: PeriodType = 'DAY'
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[ANALYTICS] Starting aggregation for ${periodType}`);
  console.log(`[ANALYTICS] Date: ${date.toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  try {
    // Run all aggregations in parallel for better performance
    await Promise.all([
      aggregateCenterStats(date, periodType),
      aggregateGantifierStats(date, periodType),
      aggregatePlatformStats(date, periodType)
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[ANALYTICS] ✅ All aggregations complete in ${duration}s`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.error(`\n[ANALYTICS] ❌ Aggregation failed:`, error);
    throw error;
  }
}

export default {
  aggregateCenterStats,
  aggregateGantifierStats,
  aggregatePlatformStats,
  aggregateAllStats
};

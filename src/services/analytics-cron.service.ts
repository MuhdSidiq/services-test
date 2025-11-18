// src/services/analytics-cron.service.ts
import cron from 'node-cron';
import { aggregateAllStats } from './analytics-aggregation.service';
import { PeriodType } from '../../app/generated/prisma';

/**
 * Analytics Cron Jobs Service
 *
 * Schedules automatic analytics aggregation at various intervals:
 * - Daily stats: Every day at 2:00 AM
 * - Weekly stats: Every Monday at 3:00 AM
 * - Monthly stats: First day of month at 4:00 AM
 * - Quarterly stats: First day of quarter at 5:00 AM
 * - Yearly stats: January 1st at 6:00 AM
 */

let cronJobs: cron.ScheduledTask[] = [];

/**
 * Start all analytics cron jobs
 */
export function startAnalyticsCronJobs(): void {
  console.log('[ANALYTICS CRON] Starting analytics cron jobs...');

  // Daily aggregation - Every day at 2:00 AM
  const dailyJob = cron.schedule('0 2 * * *', async () => {
    console.log('[ANALYTICS CRON] Running daily aggregation...');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await aggregateAllStats(yesterday, 'DAY');
      console.log('[ANALYTICS CRON] ✅ Daily aggregation complete');
    } catch (error) {
      console.error('[ANALYTICS CRON] ❌ Daily aggregation failed:', error);
    }
  });

  // Weekly aggregation - Every Monday at 3:00 AM
  const weeklyJob = cron.schedule('0 3 * * 1', async () => {
    console.log('[ANALYTICS CRON] Running weekly aggregation...');
    try {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      await aggregateAllStats(lastWeek, 'WEEK');
      console.log('[ANALYTICS CRON] ✅ Weekly aggregation complete');
    } catch (error) {
      console.error('[ANALYTICS CRON] ❌ Weekly aggregation failed:', error);
    }
  });

  // Monthly aggregation - First day of month at 4:00 AM
  const monthlyJob = cron.schedule('0 4 1 * *', async () => {
    console.log('[ANALYTICS CRON] Running monthly aggregation...');
    try {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      await aggregateAllStats(lastMonth, 'MONTH');
      console.log('[ANALYTICS CRON] ✅ Monthly aggregation complete');
    } catch (error) {
      console.error('[ANALYTICS CRON] ❌ Monthly aggregation failed:', error);
    }
  });

  // Quarterly aggregation - First day of quarter at 5:00 AM
  // Runs on Jan 1, Apr 1, Jul 1, Oct 1
  const quarterlyJob = cron.schedule('0 5 1 1,4,7,10 *', async () => {
    console.log('[ANALYTICS CRON] Running quarterly aggregation...');
    try {
      const lastQuarter = new Date();
      lastQuarter.setMonth(lastQuarter.getMonth() - 3);
      await aggregateAllStats(lastQuarter, 'QUARTER');
      console.log('[ANALYTICS CRON] ✅ Quarterly aggregation complete');
    } catch (error) {
      console.error('[ANALYTICS CRON] ❌ Quarterly aggregation failed:', error);
    }
  });

  // Yearly aggregation - January 1st at 6:00 AM
  const yearlyJob = cron.schedule('0 6 1 1 *', async () => {
    console.log('[ANALYTICS CRON] Running yearly aggregation...');
    try {
      const lastYear = new Date();
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      await aggregateAllStats(lastYear, 'YEAR');
      console.log('[ANALYTICS CRON] ✅ Yearly aggregation complete');
    } catch (error) {
      console.error('[ANALYTICS CRON] ❌ Yearly aggregation failed:', error);
    }
  });

  cronJobs = [dailyJob, weeklyJob, monthlyJob, quarterlyJob, yearlyJob];

  console.log('[ANALYTICS CRON] ✅ All analytics cron jobs started');
  console.log('[ANALYTICS CRON] Schedule:');
  console.log('[ANALYTICS CRON]   - Daily: Every day at 2:00 AM');
  console.log('[ANALYTICS CRON]   - Weekly: Every Monday at 3:00 AM');
  console.log('[ANALYTICS CRON]   - Monthly: 1st of month at 4:00 AM');
  console.log('[ANALYTICS CRON]   - Quarterly: 1st of quarter at 5:00 AM');
  console.log('[ANALYTICS CRON]   - Yearly: January 1st at 6:00 AM');
}

/**
 * Stop all analytics cron jobs
 */
export function stopAnalyticsCronJobs(): void {
  console.log('[ANALYTICS CRON] Stopping all analytics cron jobs...');
  cronJobs.forEach(job => job.stop());
  cronJobs = [];
  console.log('[ANALYTICS CRON] ✅ All cron jobs stopped');
}

/**
 * Get status of all cron jobs
 */
export function getCronJobsStatus(): { running: boolean; count: number } {
  return {
    running: cronJobs.length > 0,
    count: cronJobs.length
  };
}

/**
 * Run aggregation immediately (for testing)
 */
export async function runAggregationNow(periodType: PeriodType = 'DAY'): Promise<void> {
  console.log(`[ANALYTICS CRON] Running immediate ${periodType} aggregation...`);
  await aggregateAllStats(new Date(), periodType);
  console.log(`[ANALYTICS CRON] ✅ Immediate ${periodType} aggregation complete`);
}

export default {
  startAnalyticsCronJobs,
  stopAnalyticsCronJobs,
  getCronJobsStatus,
  runAggregationNow
};

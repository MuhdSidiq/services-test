/**
 * Cleanup Test Data Script
 * Removes all test data created by the full cycle test
 */

import { PrismaClient } from '../../app/generated/prisma';

const prisma = new PrismaClient();

const TEST_EMAILS = [
  'test-center@gantify.com',
  'test-gantifier@gantify.com',
];

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...\n');

  try {
    // Find test users
    const testUsers = await prisma.users.findMany({
      where: {
        email: {
          in: TEST_EMAILS,
        },
      },
      include: {
        centers: true,
        gantifiers: true,
      },
    });

    for (const user of testUsers) {
      console.log(`🗑️  Cleaning up user: ${user.email}`);

      // Delete center-related data
      if (user.centers && user.centers.length > 0) {
        const center = user.centers[0];
        // Delete job offers for center's jobs
        const centerJobs = await prisma.job_orders.findMany({
          where: { center_id: center.id },
        });

        for (const job of centerJobs) {
          await prisma.job_offers.deleteMany({
            where: { job_order_id: job.id },
          });
          console.log(`   ✓ Deleted job offers for job ${job.id}`);
        }

        // Delete job orders
        await prisma.job_orders.deleteMany({
          where: { center_id: center.id },
        });
        console.log(`   ✓ Deleted job orders`);

        // Delete payments
        await prisma.payments.deleteMany({
          where: { center_id: center.id },
        });
        console.log(`   ✓ Deleted payments`);

        // Delete account transactions
        const centerAccount = await prisma.accounts.findUnique({
          where: { center_id: center.id },
        });

        if (centerAccount) {
          await prisma.account_transactions.deleteMany({
            where: { account_id: centerAccount.id },
          });
          console.log(`   ✓ Deleted account transactions`);

          // Delete account
          await prisma.accounts.delete({
            where: { center_id: center.id },
          });
          console.log(`   ✓ Deleted account`);
        }

        // Delete center profile
        await prisma.centers.delete({
          where: { id: center.id },
        });
        console.log(`   ✓ Deleted center profile`);
      }

      // Delete gantifier-related data
      if (user.gantifiers) {
        // Delete job offers
        await prisma.job_offers.deleteMany({
          where: { gantifier_id: user.gantifiers.id },
        });
        console.log(`   ✓ Deleted job offers`);

        // Note: Gantifiers don't have accounts - accounts are only for centers

        // Delete gantifier profile
        await prisma.gantifiers.delete({
          where: { id: user.gantifiers.id },
        });
        console.log(`   ✓ Deleted gantifier profile`);
      }

      // Delete user
      await prisma.users.delete({
        where: { id: user.id },
      });
      console.log(`   ✓ Deleted user\n`);
    }

    console.log('✅ Cleanup completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();

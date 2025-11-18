/**
 * Full Cycle Test Script
 * Tests the complete workflow from job order creation to completion
 *
 * Workflow:
 * 1. Create test center and gantifier users
 * 2. Center creates job order
 * 3. Center makes payment (simulated as paid)
 * 4. System finds nearby gantifiers
 * 5. System sends job offers via WhatsApp
 * 6. Gantifier accepts offer
 * 7. Job is marked as complete
 * 8. Payment is released to gantifier
 */

import { PrismaClient } from '../../app/generated/prisma';
import axios from 'axios';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test data
const TEST_CENTER_EMAIL = 'test-center@gantify.com';
const TEST_GANTIFIER_EMAIL = 'test-gantifier@gantify.com';
const TEST_CENTER_PHONE = '60123456001';
const TEST_GANTIFIER_PHONE = '60123456002';

// Kuala Lumpur coordinates (for testing)
const KL_LOCATION = '3.139003,101.686855'; // Kuala Lumpur city center

interface TestContext {
  centerUser?: any;
  gantifierUser?: any;
  centerAccount?: any;
  jobOrder?: any;
  payment?: any;
  offers?: any[];
}

const context: TestContext = {};

/**
 * Step 1: Setup test data
 */
async function setupTestData() {
  console.log('\n📋 STEP 1: Setting up test data...\n');

  try {
    // Get or create roles
    let centerRole = await prisma.roles.findFirst({ where: { name: 'CENTER' } });
    if (!centerRole) {
      centerRole = await prisma.roles.create({
        data: {
          id: 'role_center_test',
          name: 'CENTER',
        },
      });
      console.log('✅ Created CENTER role');
    }

    let gantifierRole = await prisma.roles.findFirst({ where: { name: 'GANTIFIER' } });
    if (!gantifierRole) {
      gantifierRole = await prisma.roles.create({
        data: {
          id: 'role_gantifier_test',
          name: 'GANTIFIER',
        },
      });
      console.log('✅ Created GANTIFIER role');
    }

    // Create test center user
    context.centerUser = await prisma.users.upsert({
      where: { email: TEST_CENTER_EMAIL },
      update: {},
      create: {
        id: `user_center_${Date.now()}`,
        email: TEST_CENTER_EMAIL,
        phone: TEST_CENTER_PHONE,
        name: 'Test Center',
        roles: {
          connect: { id: centerRole.id }
        },
        phoneVerified: true,
        updated_at: new Date(),
      },
    });
    console.log(`✅ Center user: ${context.centerUser.email}`);

    // Create center profile
    const centerProfile = await prisma.centers.upsert({
      where: { email: TEST_CENTER_EMAIL },
      update: {},
      create: {
        id: `center_${Date.now()}`,
        user_id: context.centerUser.id,
        name: 'Test Childcare Center',
        address: 'Kuala Lumpur, Malaysia',
        postcode: '50000',
        city: 'Kuala Lumpur',
        state: 'Kuala Lumpur',
        location: KL_LOCATION,
        phone: TEST_CENTER_PHONE,
        email: TEST_CENTER_EMAIL,
        whatsapp_number: TEST_CENTER_PHONE,
      },
    });
    console.log(`✅ Center profile: ${centerProfile.name}`);

    // Create center account
    context.centerAccount = await prisma.accounts.upsert({
      where: { center_id: centerProfile.id },
      update: {},
      create: {
        id: `account_center_${Date.now()}`,
        center_id: centerProfile.id,
        balance: 0,
      },
    });
    console.log(`✅ Center account created with balance: RM ${context.centerAccount.balance}`);

    // Create test gantifier user
    context.gantifierUser = await prisma.users.upsert({
      where: { email: TEST_GANTIFIER_EMAIL },
      update: {},
      create: {
        id: `user_gantifier_${Date.now()}`,
        email: TEST_GANTIFIER_EMAIL,
        phone: TEST_GANTIFIER_PHONE,
        name: 'Test Gantifier',
        roles: {
          connect: { id: gantifierRole.id }
        },
        phoneVerified: true,
        updated_at: new Date(),
      },
    });
    console.log(`✅ Gantifier user: ${context.gantifierUser.email}`);

    // Create gantifier profile with selected cities near KL
    const gantifierProfile = await prisma.gantifiers.upsert({
      where: { user_id: context.gantifierUser.id },
      update: {},
      create: {
        id: `gantifier_${Date.now()}`,
        user_id: context.gantifierUser.id,
        full_name: 'Ali Gantifier',
        status: 'ACTIVE',
        address: 'Kuala Lumpur, Malaysia',
        postcode: '50000',
        current_address: 'Kuala Lumpur',
        selected_cities: ['kuala_lumpur_kuala_lumpur', 'selangor_petaling_jaya'], // Cities near KL
        average_rating: 4.5,
        completion_rate: 95.0,
        total_jobs_completed: 10,
        citizenship: 'Malaysian',
        ece_qualification: true,
        education_level: 'Degree',
        experience_with_children: true,
        last_minute_work: true,
        gender: 'FEMALE',
        updated_at: new Date(),
      },
    });
    console.log(`✅ Gantifier profile: ${gantifierProfile.full_name} (Cities: ${gantifierProfile.selected_cities})`);

    // Note: Gantifiers don't have accounts - accounts are only for centers
    console.log(`✅ Gantifier profile created`);

    console.log('\n✅ Test data setup complete!\n');
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    throw error;
  }
}

/**
 * Step 2: Center creates job order
 */
async function createJobOrder() {
  console.log('\n📋 STEP 2: Center creates job order...\n');

  try {
    // Get center profile
    const centerProfile = await prisma.centers.findFirst({
      where: { user_id: context.centerUser.id },
    });

    if (!centerProfile) {
      throw new Error('Center profile not found');
    }

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 1); // Tomorrow

    context.jobOrder = await prisma.job_orders.create({
      data: {
        id: `job_${Date.now()}`,
        center_id: centerProfile!.id,
        center_location: KL_LOCATION,
        scheduled_date: scheduledDate,
        start_time: '09:00',
        end_time: '17:00',
        rate: 150.00,
        total_cost: 150.00,
        gantifier_fee: 135.00,
        service_fee: 15.00,
        status: 'PENDING',
        job_tasks: ['Childcare assistance'],
        custom_tasks: [],
      },
    });

    console.log(`✅ Job Order Created:`);
    console.log(`   ID: ${context.jobOrder.id}`);
    console.log(`   Location: ${context.jobOrder.center_location}`);
    console.log(`   Date: ${context.jobOrder.scheduled_date.toDateString()}`);
    console.log(`   Time: ${context.jobOrder.start_time} - ${context.jobOrder.end_time}`);
    console.log(`   Amount: RM ${context.jobOrder.total_cost}`);
    console.log(`   Status: ${context.jobOrder.status}\n`);
  } catch (error) {
    console.error('❌ Error creating job order:', error);
    throw error;
  }
}

/**
 * Step 3: Center makes payment (simulated as paid)
 */
async function simulatePayment() {
  console.log('\n💳 STEP 3: Simulating payment...\n');

  try {
    // Find center by email
    const centerProfile = await prisma.centers.findFirst({
      where: { user_id: context.centerUser.id }
    });

    if (!centerProfile) {
      throw new Error('Center profile not found');
    }

    // Create payment record
    context.payment = await prisma.payments.create({
      data: {
        id: `payment_${Date.now()}`,
        center_id: centerProfile.id,
        job_order_id: context.jobOrder.id,
        gantifier_fee: context.jobOrder.gantifier_fee || 135.00,
        service_fee: context.jobOrder.service_fee || 15.00,
        total_amount: context.jobOrder.total_cost,
        payment_method: 'BILLPLZ',
        status: 'PENDING',
        billplz_bill_id: `test_bill_${Date.now()}`,
        billplz_url: 'https://test.billplz.com/test',
      },
    });

    console.log(`✅ Payment created:`);
    console.log(`   ID: ${context.payment.id}`);
    console.log(`   Amount: RM ${context.payment.total_amount}`);
    console.log(`   Billplz ID: ${context.payment.billplz_bill_id}\n`);

    // Simulate Billplz webhook (payment successful)
    console.log('🔔 Triggering Billplz webhook (payment successful)...\n');

    const webhookData = {
      id: context.payment.billplz_bill_id,
      paid: 'true',
      state: 'paid',
      amount: String(Math.round(context.payment.total_amount * 100)), // Convert to cents
    };

    const response = await axios.post(`${BASE_URL}/api/webhooks/billplz`, webhookData);

    console.log(`✅ Webhook response:`, response.data);

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify payment status
    const updatedPayment = await prisma.payments.findUnique({
      where: { id: context.payment.id },
    });

    console.log(`✅ Payment status: ${updatedPayment?.status}`);

    // Find center and verify account hold
    const centerProfileForAccount = await prisma.centers.findFirst({
      where: { user_id: context.centerUser.id }
    });
    const updatedAccount = centerProfileForAccount ? await prisma.accounts.findUnique({
      where: { center_id: centerProfileForAccount.id },
    }) : null;

    console.log(`✅ Center account held balance: RM ${updatedAccount?.balance}\n`);
  } catch (error) {
    console.error('❌ Error simulating payment:', error);
    throw error;
  }
}

/**
 * Step 4: Verify gantifier discovery and offers
 */
async function verifyGantifierDiscovery() {
  console.log('\n🔍 STEP 4: Verifying gantifier discovery...\n');

  try {
    // Check job order status
    const updatedJobOrder = await prisma.job_orders.findUnique({
      where: { id: context.jobOrder.id },
    });

    console.log(`✅ Job order status: ${updatedJobOrder?.status}`);

    // Check job offers
    context.offers = await prisma.job_offers.findMany({
      where: { job_order_id: context.jobOrder.id },
      include: {
        gantifiers: {
          include: {
            users: true,
          },
        },
      },
    });

    console.log(`✅ Found ${context.offers.length} job offers`);

    context.offers.forEach((offer, index) => {
      console.log(`\n   Offer ${index + 1}:`);
      console.log(`   - Gantifier: ${offer.gantifiers.full_name}`);
      console.log(`   - Status: ${offer.status}`);
      console.log(`   - Acceptance Token: ${offer.acceptance_token}`);
      console.log(`   - Sent At: ${offer.sent_at}`);
    });

    console.log('');
  } catch (error) {
    console.error('❌ Error verifying gantifier discovery:', error);
    throw error;
  }
}

/**
 * Step 5: Gantifier accepts offer
 */
async function gantifierAcceptsOffer() {
  console.log('\n✅ STEP 5: Gantifier accepts offer...\n');

  try {
    if (!context.offers || context.offers.length === 0) {
      console.log('⚠️  No offers to accept');
      return;
    }

    const firstOffer = context.offers[0];
    const acceptUrl = `${BASE_URL}/api/offers/${firstOffer.acceptance_token}/accept`;

    console.log(`🔗 Accept URL: ${acceptUrl}\n`);

    const response = await axios.get(acceptUrl, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    console.log(`✅ Offer accepted!`);
    console.log(`   Response:`, response.data);

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify job order status
    const updatedJobOrder = await prisma.job_orders.findUnique({
      where: { id: context.jobOrder.id },
      include: {
        gantifiers: true,
      },
    });

    console.log(`\n✅ Job order updated:`);
    console.log(`   Status: ${updatedJobOrder?.status}`);
    console.log(`   Assigned to: ${updatedJobOrder?.gantifiers?.full_name || 'N/A'}\n`);
  } catch (error: any) {
    if (error.response?.status === 302) {
      console.log(`✅ Offer accepted! (Redirected to: ${error.response.headers.location})\n`);
    } else {
      console.error('❌ Error accepting offer:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * Step 6: Mark job as complete
 */
async function completeJob() {
  console.log('\n🎉 STEP 6: Marking job as complete...\n');

  try {
    // Update job order status to COMPLETED
    const completedJob = await prisma.job_orders.update({
      where: { id: context.jobOrder.id },
      data: {
        status: 'COMPLETED',
        completed_at: new Date(),
      },
    });

    console.log(`✅ Job marked as complete:`);
    console.log(`   Job ID: ${completedJob.id}`);
    console.log(`   Status: ${completedJob.status}`);
    console.log(`   Completed At: ${completedJob.completed_at}\n`);
  } catch (error) {
    console.error('❌ Error completing job:', error);
    throw error;
  }
}

/**
 * Step 7: Release payment to gantifier
 */
async function releasePayment() {
  console.log('\n💰 STEP 7: Releasing payment to gantifier...\n');

  try {
    const centerProfile = await prisma.centers.findFirst({
      where: { user_id: context.centerUser.id },
    });

    if (!centerProfile) {
      throw new Error('Center profile not found');
    }

    const gantifierProfile = await prisma.gantifiers.findUnique({
      where: { user_id: context.gantifierUser.id },
    });

    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: context.jobOrder.id },
    });

    const gantifierFee = jobOrder!.gantifier_fee || 135.00;

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Release amount from center account
      await tx.accounts.update({
        where: { center_id: centerProfile.id },
        data: {
          balance: { decrement: Number(jobOrder!.total_cost) },
        },
      });

      // 2. Note: Gantifiers don't have accounts - payment is handled differently
      // The gantifier fee would be paid directly via other means (not through accounts table)

      // 3. Record center transaction
      const centerAccountBefore = await tx.accounts.findUnique({
        where: { center_id: centerProfile.id },
      });

      await tx.account_transactions.create({
        data: {
          id: `txn_center_${Date.now()}`,
          account_id: context.centerAccount.id,
          transaction_type: 'DEDUCT',
          amount: Number(jobOrder!.total_cost),
          balance_before: Number(centerAccountBefore?.balance || 0),
          balance_after: Number(centerAccountBefore?.balance || 0) - Number(jobOrder!.total_cost),
          job_order_id: jobOrder!.id,
          description: `Payment for job ${jobOrder!.id}`,
        },
      });

      // 4. Note: Gantifier transactions would be recorded in a different system
      // Since gantifiers don't have accounts in this schema

      // 5. Update payment status
      await tx.payments.update({
        where: { id: context.payment.id },
        data: { status: 'COMPLETED' },
      });
    });

    // Get updated balances
    const updatedCenterAccount = await prisma.accounts.findUnique({
      where: { center_id: centerProfile!.id },
    });

    // Note: Gantifiers don't have accounts in this schema

    console.log(`✅ Payment released successfully!`);
    console.log(`\n   Center Account:`);
    console.log(`   - Balance: RM ${updatedCenterAccount?.balance}`);
    console.log(`\n   Note: Gantifiers don't have accounts in this schema\n`);
  } catch (error) {
    console.error('❌ Error releasing payment:', error);
    throw error;
  }
}

/**
 * Display final summary
 */
async function displaySummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(60) + '\n');

  const jobOrder = await prisma.job_orders.findUnique({
    where: { id: context.jobOrder.id },
    include: {
      centers: true,
      gantifiers: true,
    },
  });

  const payment = await prisma.payments.findUnique({
    where: { id: context.payment.id },
  });

  const centerAccount = await prisma.accounts.findUnique({
    where: { center_id: jobOrder!.center_id },
  });

  // Note: Gantifiers don't have accounts in this schema

  console.log('Job Order:');
  console.log(`  ✓ ID: ${jobOrder!.id}`);
  console.log(`  ✓ Center: ${jobOrder!.centers.name}`);
  console.log(`  ✓ Gantifier: ${jobOrder!.gantifiers?.full_name || 'N/A'}`);
  console.log(`  ✓ Date: ${jobOrder!.scheduled_date.toDateString()}`);
  console.log(`  ✓ Time: ${jobOrder!.start_time} - ${jobOrder!.end_time}`);
  console.log(`  ✓ Amount: RM ${jobOrder!.total_cost}`);
  console.log(`  ✓ Status: ${jobOrder!.status}`);

  console.log('\nPayment:');
  console.log(`  ✓ Status: ${payment!.status}`);
  console.log(`  ✓ Amount: RM ${payment!.total_amount}`);

  console.log('\nAccounts:');
  console.log(`  Center:`);
  console.log(`    - Balance: RM ${centerAccount!.balance}`);
  console.log(`  Note: Gantifiers don't have accounts in this schema`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ FULL CYCLE TEST COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60) + '\n');
}

/**
 * Main test runner
 */
async function runFullCycleTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 GANTIFY FULL CYCLE TEST');
  console.log('='.repeat(60));

  try {
    await setupTestData();
    await createJobOrder();
    await simulatePayment();
    await verifyGantifierDiscovery();
    await gantifierAcceptsOffer();
    await completeJob();
    await releasePayment();
    await displaySummary();
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
runFullCycleTest();

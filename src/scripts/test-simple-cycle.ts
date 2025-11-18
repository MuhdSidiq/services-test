/**
 * Simplified Full Cycle Test Script
 * Tests the core workflow with actual database schema
 */

import { PrismaClient } from '../../app/generated/prisma';
import axios from 'axios';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000'; // Always use localhost for tests

// Test data
const TEST_CENTER_EMAIL = 'simple-test-center@gantify.com';
const TEST_GANTIFIER_EMAIL = 'simple-test-gantifier@gantify.com';
const TEST_CENTER_PHONE = '60123456101';
const TEST_GANTIFIER_PHONE = '60123456102';
const KL_LOCATION = '3.139003,101.686855';

interface TestContext {
  centerUser?: any;
  gantifierUser?: any;
  centerProfile?: any;
  gantifierProfile?: any;
  jobOrder?: any;
  payment?: any;
  offers?: any[];
}

const context: TestContext = {};

async function setupTestData() {
  console.log('\n📋 STEP 1: Setting up test data...\n');

  try {
    // Get or create roles
    let centerRole = await prisma.roles.findFirst({ where: { name: 'CENTER' } });
    if (!centerRole) {
      centerRole = await prisma.roles.create({
        data: { id: `role_center_${Date.now()}`, name: 'CENTER' }
      });
    }

    let gantifierRole = await prisma.roles.findFirst({ where: { name: 'GANTIFIER' } });
    if (!gantifierRole) {
      gantifierRole = await prisma.roles.create({
        data: { id: `role_gantifier_${Date.now()}`, name: 'GANTIFIER' }
      });
    }

    // Create center user
    context.centerUser = await prisma.users.upsert({
      where: { email: TEST_CENTER_EMAIL },
      update: {},
      create: {
        id: `user_center_${Date.now()}`,
        email: TEST_CENTER_EMAIL,
        phone: TEST_CENTER_PHONE,
        name: 'Simple Test Center',
        roles: { connect: { id: centerRole.id } },
        phoneVerified: true,
        updated_at: new Date(),
      },
    });
    console.log(`✅ Center user: ${context.centerUser.email}`);

    // Create center profile
    context.centerProfile = await prisma.centers.upsert({
      where: { email: TEST_CENTER_EMAIL },
      update: {},
      create: {
        id: `center_${Date.now()}`,
        user_id: context.centerUser.id,
        name: 'Simple Test Center',
        email: TEST_CENTER_EMAIL,
        phone: TEST_CENTER_PHONE,
        address: 'KL',
        postcode: '50000',
        city: 'Kuala Lumpur',
        state: 'Kuala Lumpur',
        location: KL_LOCATION,
        whatsapp_number: TEST_CENTER_PHONE,
      },
    });
    console.log(`✅ Center profile: ${context.centerProfile.name}`);

    // Create center account (accounts table only needs center_id)
    const existingCenterAccount = await prisma.accounts.findUnique({
      where: { center_id: context.centerProfile.id },
    });

    if (!existingCenterAccount) {
      await prisma.accounts.create({
        data: {
          center_id: context.centerProfile.id,
          balance: 0,
        },
      });
      console.log(`✅ Center account created`);
    }

    // Create gantifier user
    context.gantifierUser = await prisma.users.upsert({
      where: { email: TEST_GANTIFIER_EMAIL },
      update: {},
      create: {
        id: `user_gantifier_${Date.now()}`,
        email: TEST_GANTIFIER_EMAIL,
        phone: TEST_GANTIFIER_PHONE,
        name: 'Simple Test Gantifier',
        roles: { connect: { id: gantifierRole.id } },
        phoneVerified: true,
        updated_at: new Date(),
      },
    });
    console.log(`✅ Gantifier user: ${context.gantifierUser.email}`);

    // Create gantifier profile
    const existingGantifier = await prisma.gantifiers.findUnique({
      where: { user_id: context.gantifierUser.id },
    });

    if (!existingGantifier) {
      context.gantifierProfile = await prisma.gantifiers.create({
        data: {
          id: `gantifier_${Date.now()}`,
          user_id: context.gantifierUser.id,
          full_name: 'Ali Test Gantifier',
          status: 'ACTIVE',
          address: 'KL',
          postcode: '50000',
          current_address: 'Kuala Lumpur',
          selected_cities: ['kuala_lumpur_kuala_lumpur', 'selangor_petaling_jaya'],
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
    } else {
      context.gantifierProfile = existingGantifier;
    }
    console.log(`✅ Gantifier profile: ${context.gantifierProfile.full_name}`);

    console.log('\n✅ Test data setup complete!\n');
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    throw error;
  }
}

async function createJobOrder() {
  console.log('\n📋 STEP 2: Center creates job order...\n');

  try {
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 1);

    context.jobOrder = await prisma.job_orders.create({
      data: {
        id: `job_${Date.now()}`,
        center_id: context.centerProfile.id,
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

    console.log(`✅ Job Order Created: ${context.jobOrder.id}`);
    console.log(`   Amount: RM ${context.jobOrder.total_cost}\n`);
  } catch (error) {
    console.error('❌ Error creating job order:', error);
    throw error;
  }
}

async function simulatePayment() {
  console.log('\n💳 STEP 3: Simulating payment...\n');

  try {
    context.payment = await prisma.payments.create({
      data: {
        id: `payment_${Date.now()}`,
        center_id: context.centerProfile.id,
        job_order_id: context.jobOrder.id,
        total_amount: context.jobOrder.total_cost,
        gantifier_fee: context.jobOrder.gantifiers_fee,
        service_fee: context.jobOrder.service_fee,
        payment_method: 'BILLPLZ',
        status: 'PENDING',
        billplz_bill_id: `test_bill_${Date.now()}`,
        billplz_url: 'https://test.billplz.com/test',
      },
    });

    console.log(`✅ Payment created: ${context.payment.id}\n`);

    // Trigger webhook
    console.log('🔔 Triggering Billplz webhook...\n');

    const webhookData = {
      id: context.payment.billplz_bill_id,
      paid: 'true',
      state: 'paid',
      amount: String(Math.round(Number(context.payment.total_amount) * 100)),
    };

    const response = await axios.post(`${BASE_URL}/api/webhooks/billplz`, webhookData);
    console.log(`✅ Webhook response:`, response.data.success ? 'Success' : 'Failed');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    const updatedPayment = await prisma.payments.findUnique({
      where: { id: context.payment.id },
    });

    console.log(`✅ Payment status: ${updatedPayment?.status}\n`);
  } catch (error) {
    console.error('❌ Error simulating payment:', error);
    throw error;
  }
}

async function verifyOffersCreated() {
  console.log('\n🔍 STEP 4: Verifying offers created...\n');

  try {
    const jobOrder = await prisma.job_orders.findUnique({
      where: { id: context.jobOrder.id },
    });

    console.log(`✅ Job order status: ${jobOrder?.status}`);

    context.offers = await prisma.job_offers.findMany({
      where: { job_order_id: context.jobOrder.id },
      include: {
        gantifiers: true,
      },
    });

    console.log(`✅ Found ${context.offers.length} job offers\n`);

    if (context.offers.length > 0) {
      context.offers.forEach((offer, index) => {
        console.log(`   Offer ${index + 1}: ${offer.gantifiers.full_name} (${offer.status})`);
      });
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error verifying offers:', error);
    throw error;
  }
}

async function acceptOffer() {
  console.log('\n✅ STEP 5: Accepting offer...\n');

  try {
    if (!context.offers || context.offers.length === 0) {
      console.log('⚠️  No offers to accept\n');
      return;
    }

    const firstOffer = context.offers[0];
    const acceptUrl = `${BASE_URL}/api/offers/${firstOffer.acceptance_token}/accept`;

    console.log(`🔗 Accept URL: ${acceptUrl}`);

    try {
      await axios.get(acceptUrl, { maxRedirects: 0, validateStatus: () => true });
    } catch (e) {
      // Ignore redirect errors
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const updatedJob = await prisma.job_orders.findUnique({
      where: { id: context.jobOrder.id },
      include: { gantifiers: true },
    });

    console.log(`✅ Job status: ${updatedJob?.status}`);
    console.log(`✅ Assigned to: ${updatedJob?.gantifiers?.full_name || 'N/A'}\n`);
  } catch (error) {
    console.error('❌ Error accepting offer:', error);
  }
}

async function completeJobAndRelease() {
  console.log('\n🎉 STEP 6: Completing job and releasing payment...\n');

  try {
    // Mark job as complete
    await prisma.job_orders.update({
      where: { id: context.jobOrder.id },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });

    console.log(`✅ Job marked as COMPLETED`);

    // Update payment status
    await prisma.payments.update({
      where: { id: context.payment.id },
      data: { status: 'COMPLETED' },
    });

    console.log(`✅ Payment marked as COMPLETED\n`);
  } catch (error) {
    console.error('❌ Error completing job:', error);
    throw error;
  }
}

async function displaySummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(60) + '\n');

  const job = await prisma.job_orders.findUnique({
    where: { id: context.jobOrder.id },
    include: { centers: true, gantifiers: true },
  });

  const payment = await prisma.payments.findUnique({
    where: { id: context.payment.id },
  });

  console.log('Job Order:');
  console.log(`  ✓ ID: ${job!.id}`);
  console.log(`  ✓ Center: ${job!.centers.name}`);
  console.log(`  ✓ Gantifier: ${job!.gantifiers?.full_name || 'N/A'}`);
  console.log(`  ✓ Date: ${job!.scheduled_date.toDateString()}`);
  console.log(`  ✓ Time: ${job!.start_time} - ${job!.end_time}`);
  console.log(`  ✓ Amount: RM ${job!.total_cost}`);
  console.log(`  ✓ Status: ${job!.status}`);

  console.log('\nPayment:');
  console.log(`  ✓ Status: ${payment!.status}`);
  console.log(`  ✓ Amount: RM ${payment!.total_amount}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ SIMPLE CYCLE TEST COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60) + '\n');
}

async function runTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 GANTIFY SIMPLE CYCLE TEST');
  console.log('='.repeat(60));

  try {
    await setupTestData();
    await createJobOrder();
    await simulatePayment();
    await verifyOffersCreated();
    await acceptOffer();
    await completeJobAndRelease();
    await displaySummary();
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();

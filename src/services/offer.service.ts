// src/services/offer.service.ts
import { PrismaClient } from '../../app/generated/prisma';
import { nanoid } from 'nanoid';
import { sendJobOfferWhatsApp } from './whatsapp.service';

const prisma = new PrismaClient();

/**
 * Creates job offers for a list of gantifiers
 *
 * @param job_order_id - The job order ID
 * @param gantifiers - Array of gantifier objects
 * @returns Array of created job offers
 */
export async function createJobOffers(job_order_id: string, gantifiers: any[]) {
    try {
        console.log(`[OFFER-SERVICE] Creating ${gantifiers.length} job offers for job order ${job_order_id}`);

        if (!gantifiers.length) {
            console.log('[OFFER-SERVICE] No gantifiers provided, skipping offer creation');
            return [];
        }

        // Create offers
        const offers = await Promise.all(
            gantifiers.map(async (gantifier) => {
                // Generate a unique token for accept/reject (8 characters for shorter URLs)
                const acceptance_token = nanoid(8);

                console.log(`[OFFER-SERVICE] Creating offer for gantifier: ${gantifier.fullName} (ID: ${gantifier.id})`);

                // Create the job offer
                return prisma.job_offers.create({
                    data: {
                        id: nanoid(12),
                        job_order_id,
                        gantifier_id: gantifier.id,
                        acceptance_token,
                        status: 'SENT',
                        sent_at: new Date(),
                        is_accepted: 'NOT_RESPONDED'
                    },
                    include: {
                        gantifiers: {
                            include: {
                                users: {
                                    select: {
                                        phone: true,
                                        email: true,
                                        name: true
                                    }
                                }
                            }
                        },
                        job_orders: {
                            include: {
                                centers: true
                            }
                        }
                    }
                });
            })
        );

        console.log(`[OFFER-SERVICE] ✅ Successfully created ${offers.length} job offers`);
        return offers;
    } catch (error) {
        console.error('[OFFER-SERVICE] ❌ Error creating job offers:', error);
        throw error;
    }
}

/**
 * Sends WhatsApp job offer notifications to gantifiers
 *
 * @param offers - Array of job offers with gantifier and job order details
 * @returns Array of WhatsApp send results
 */
export async function sendOffersViaWhatsApp(offers: any[]) {
    try {
        console.log(`[OFFER-SERVICE] Sending ${offers.length} WhatsApp job offer notifications`);

        const results = await Promise.all(
            offers.map(async (offer) => {
                try {
                    // Get gantifier phone number
                    const phoneNumber = offer.gantifiers?.users?.phone;

                    if (!phoneNumber) {
                        console.log(`[OFFER-SERVICE] ⚠️ Gantifier ${offer.gantifiers?.full_name} has no phone number - skipping WhatsApp`);
                        return { success: false, gantifier: offer.gantifiers?.full_name, error: 'No phone number' };
                    }

                    // Generate accept/reject URLs
                    const baseUrl = process.env.API_BASE_URL;
                    const acceptUrl = `${baseUrl}/api/v1/offers/${offer.acceptance_token}/accept`;
                    const rejectUrl = `${baseUrl}/api/v1/offers/${offer.acceptance_token}/reject`;

                    // Format job details
                    const jobDate = new Date(offer.job_orders.scheduled_date).toLocaleDateString('en-MY', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    const jobTime = `${offer.job_orders.start_time} - ${offer.job_orders.end_time}`;

                    // Calculate duration in hours
                    const startTime = new Date(`2000-01-01 ${offer.job_orders.start_time}`);
                    const endTime = new Date(`2000-01-01 ${offer.job_orders.end_time}`);
                    const durationHours = Math.abs((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));

                    // Prepare WhatsApp job offer parameters
                    const whatsappParams = {
                        candidateName: offer.gantifiers?.full_name || 'Gantifier',
                        companyName: offer.job_orders.centers?.name || 'Center',
                        location: offer.job_orders.center_location,
                        date: jobDate,
                        shift: '1', // Default shift number, can be customized
                        time: jobTime,
                        duration: durationHours.toFixed(1),
                        additionalInfo: `RM ${parseFloat(String(offer.job_orders.rate || 0)).toFixed(2)}`,
                        offerUrl: offer.acceptance_token // This will be used in the button URL
                    };

                    console.log(`[OFFER-SERVICE] Sending WhatsApp job offer to ${offer.gantifiers?.full_name} (${phoneNumber})`);

                    // Send WhatsApp message using job offer template
                    await sendJobOfferWhatsApp(phoneNumber, whatsappParams);

                    // Update offer status to DELIVERED
                    await prisma.job_offers.update({
                        where: { id: offer.id },
                        data: { status: 'DELIVERED' }
                    });

                    console.log(`[OFFER-SERVICE] ✅ WhatsApp sent successfully to ${offer.gantifiers?.full_name}`);

                    return {
                        success: true,
                        gantifier: offer.gantifiers?.full_name,
                        phone: phoneNumber
                    };
                } catch (error) {
                    console.error(`[OFFER-SERVICE] ❌ Error sending WhatsApp to ${offer.gantifiers?.full_name}:`, error);
                    return {
                        success: false,
                        gantifier: offer.gantifiers?.full_name,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            })
        );

        const successCount = results.filter(r => r.success).length;
        console.log(`[OFFER-SERVICE] ✅ Successfully sent ${successCount}/${offers.length} WhatsApp notifications`);

        return results;
    } catch (error) {
        console.error('[OFFER-SERVICE] ❌ Error sending WhatsApp offers:', error);
        throw error;
    }
}

/**
 * Handles offer acceptance by a gantifier
 *
 * @param token - The acceptance token
 * @returns Result object with success status and details
 */
export async function handleOfferAcceptance(token: string) {
    try {
        console.log(`[OFFER-SERVICE] Processing offer acceptance for token: ${token}`);

        const offer = await prisma.job_offers.findUnique({
            where: { acceptance_token: token },
            include: {
                job_orders: {
                    include: { centers: true }
                },
                gantifiers: {
                    include: {
                        users: {
                            select: {
                                phone: true,
                                email: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        if (!offer) {
            console.log(`[OFFER-SERVICE] ❌ Offer not found for token: ${token}`);
            throw new Error('Offer not found');
        }

        // Check if offer is still valid
        if (offer.status !== 'SENT' && offer.status !== 'DELIVERED' && offer.status !== 'READ') {
            console.log(`[OFFER-SERVICE] ❌ Offer status is ${offer.status} - no longer valid`);
            return {
                success: false,
                error: 'This offer is no longer valid',
                status: offer.status
            };
        }

        // Check if job is still available
        if (offer.job_orders.status !== 'PENDING' && offer.job_orders.status !== 'AWAITING_GANTIFIER_RESPONSE') {
            console.log(`[OFFER-SERVICE] ❌ Job status is ${offer.job_orders.status} - no longer available`);
            return {
                success: false,
                error: 'This job is no longer available',
                status: offer.job_orders.status
            };
        }

        // Check if offer has expired (30 minutes)
        const expirationTime = new Date(new Date(offer.sent_at).getTime() + 30 * 60000);
        if (new Date() > expirationTime) {
            console.log(`[OFFER-SERVICE] ❌ Offer has expired`);
            return {
                success: false,
                error: 'This offer has expired',
                status: 'EXPIRED'
            };
        }

        // Use a transaction to handle race conditions
        const result = await prisma.$transaction(async (tx) => {
            // Mark this offer as accepted
            await tx.job_offers.update({
                where: { id: offer.id },
                data: {
                    status: 'CONFIRMED_BY_CENTER',
                    responded_at: new Date(),
                    is_accepted: 'YES',
                    response: 'ACCEPT'
                }
            });

            // Update job status and assign gantifier
            await tx.job_orders.update({
                where: { id: offer.job_order_id },
                data: {
                    status: 'ASSIGNED',
                    gantifier_id: offer.gantifier_id,
                }
            });

            // Mark other offers as superseded
            await tx.job_offers.updateMany({
                where: {
                    job_order_id: offer.job_order_id,
                    id: { not: offer.id },
                    status: { in: ['SENT', 'DELIVERED', 'READ'] }
                },
                data: {
                    status: 'SUPERSEDED'
                }
            });

            console.log(`[OFFER-SERVICE] ✅ Offer accepted by ${offer.gantifiers?.full_name} for job ${offer.job_order_id}`);

            // Return success response
            return {
                success: true,
                message: 'Job offer accepted successfully! Payment was already processed.',
                job_order_id: offer.job_order_id,
                gantifierName: offer.gantifiers?.full_name,
                jobDetails: {
                    title: `Job at ${offer.job_orders.centers?.name}`,
                    date: new Date(offer.job_orders.scheduled_date).toLocaleDateString(),
                    time: `${offer.job_orders.start_time} - ${offer.job_orders.end_time}`,
                    location: offer.job_orders.center_location
                }
            };
        });

        return result;
    } catch (error) {
        console.error('[OFFER-SERVICE] ❌ Error handling offer acceptance:', error);
        throw error;
    }
}

/**
 * Handles offer rejection by a gantifier
 *
 * @param token - The acceptance token
 * @returns Result object with success status and details
 */
export async function handleOfferRejection(token: string) {
    try {
        console.log(`[OFFER-SERVICE] Processing offer rejection for token: ${token}`);

        const offer = await prisma.job_offers.findUnique({
            where: { acceptance_token: token },
            include: {
                job_orders: {
                    include: { centers: true }
                },
                gantifiers: true
            }
        });

        if (!offer) {
            console.log(`[OFFER-SERVICE] ❌ Offer not found for token: ${token}`);
            throw new Error('Offer not found');
        }

        // Check if offer is still valid
        if (offer.status !== 'SENT' && offer.status !== 'DELIVERED' && offer.status !== 'READ') {
            console.log(`[OFFER-SERVICE] ❌ Offer status is ${offer.status} - no longer valid`);
            return {
                success: false,
                error: 'This offer is no longer valid',
                status: offer.status
            };
        }

        // Update job offer as rejected
        await prisma.job_offers.update({
            where: { id: offer.id },
            data: {
                status: 'REJECTED_BY_GANTIFIER',
                responded_at: new Date(),
                is_accepted: 'NO',
                response: 'REJECT'
            }
        });

        // Check remaining offers
        const pendingOffers = await prisma.job_offers.count({
            where: {
                job_order_id: offer.job_order_id,
                status: { in: ['SENT', 'DELIVERED', 'READ'] }
            }
        });

        // If no more pending offers and job still awaiting responses
        if (pendingOffers === 0 && offer.job_orders.status === 'AWAITING_GANTIFIER_RESPONSE') {
            await prisma.job_orders.update({
                where: { id: offer.job_order_id },
                data: { status: 'PENDING' }
            });
            console.log(`[OFFER-SERVICE] ⚠️ All offers rejected, job ${offer.job_order_id} back to PENDING`);
        }

        console.log(`[OFFER-SERVICE] ✅ Offer rejected by ${offer.gantifiers?.full_name} for job ${offer.job_order_id}`);

        // Return success response
        return {
            success: true,
            message: 'Job offer rejected successfully',
            gantifierName: offer.gantifiers?.full_name,
            jobDetails: {
                title: `Job at ${offer.job_orders.centers?.name}`,
                date: new Date(offer.job_orders.scheduled_date).toLocaleDateString(),
                time: `${offer.job_orders.start_time} - ${offer.job_orders.end_time}`
            }
        };
    } catch (error) {
        console.error('[OFFER-SERVICE] ❌ Error handling offer rejection:', error);
        throw error;
    }
}

/**
 * Gets offer action URLs for a given acceptance token
 *
 * @param acceptance_token - The acceptance token
 * @returns Object with accept, reject, and view URLs
 */
export function getOfferActionUrls(acceptance_token: string) {
    const baseUrl = process.env.API_BASE_URL || '';

    return {
        acceptUrl: `${baseUrl}/api/offers/${acceptance_token}/accept`,
        rejectUrl: `${baseUrl}/api/offers/${acceptance_token}/reject`,
        viewJobUrl: `${baseUrl}/api/offers/${acceptance_token}`
    };
}

/**
 * Checks if an offer is still valid
 *
 * @param offer - The offer object with jobOrder included
 * @returns True if valid, false otherwise
 */
export function isOfferValid(offer: any): boolean {
    // Check if offer status is still valid
    if (!['SENT', 'DELIVERED', 'READ'].includes(offer.status)) {
        return false;
    }

    // Check if the job is still available
    if (!['PENDING', 'AWAITING_GANTIFIER_RESPONSE'].includes(offer.job_orders.status)) {
        return false;
    }

    // Check if offer has expired (30 minutes after sent)
    const expirationTime = new Date(new Date(offer.sent_at).getTime() + 30 * 60000);
    if (new Date() > expirationTime) {
        return false;
    }

    return true;
}

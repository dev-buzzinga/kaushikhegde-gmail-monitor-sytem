import { config } from '../config/env.js';
import { classifyAppointmentIntent, extractBookingSlots } from './aiService.js';
import { readAvailability, generateSlots, removeBookedSlots, formatAvailabilityTable, findMatchingSlot } from './availabilityService.js';
import { getEventsForDateRange, createEvent } from './calendarService.js';
import { sendEmail } from './gmailSender.js';

/**
 * Appointment Handler Service
 * Orchestrates the appointment flow for availability requests and booking confirmations
 */

/**
 * Main appointment email handler
 * Determines intent and routes to appropriate sub-handler
 * 
 * @param {Object} emailData - Processed email data
 * @param {string} emailData.from - Sender email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.body - Email body
 * @param {string} emailData.messageId - Message ID for threading
 * @param {string} emailData.threadId - Thread ID
 */
export async function handleAppointmentEmail(emailData) {
    try {
        console.log('\n📅 Starting appointment processing pipeline...');

        const doctorName = config.DOCTOR_NAME || 'Dr Rishabh';

        // Step A: Determine intent
        const intent = await classifyAppointmentIntent(emailData.subject, emailData.body);

        if (intent === 'AVAILABILITY_REQUEST') {
            await handleAvailabilityRequest(emailData, doctorName);
        } else if (intent === 'BOOKING_CONFIRMATION') {
            await handleBookingConfirmation(emailData, doctorName);
        } else {
            console.log('⏭️  Unknown appointment intent, skipping');
        }

        console.log('🎉 Appointment processing completed!\n');

    } catch (error) {
        console.error('⚠️  Appointment processing failed (non-critical):', error.message);
        console.log('📧 Email processing will continue normally\n');
    }
}

/**
 * Handles availability request emails
 * Reads CSV, generates slots, checks calendar, and replies with available times
 * 
 * @param {Object} emailData - Email data
 * @param {string} doctorName - Doctor name
 */
async function handleAvailabilityRequest(emailData, doctorName) {
    console.log('📋 Handling availability request...');

    // 1. Read availability from CSV
    const availability = readAvailability(doctorName);
    if (availability.length === 0) {
        console.log('⚠️  No availability data found for', doctorName);
        await sendReply(emailData, `Sorry, no availability information is currently set for ${doctorName}. Please contact us directly.`);
        return;
    }

    // 2. Generate 1-hour slots for current week
    const allSlots = generateSlots(availability);
    console.log(`📊 Generated ${allSlots.length} potential time slots`);

    if (allSlots.length === 0) {
        await sendReply(emailData, `Sorry, there are no remaining available slots for ${doctorName} this week. Please check back next week.`);
        return;
    }

    // 3. Get calendar events for the current week range
    let availableSlots = allSlots;
    try {
        const startDate = allSlots[0].startTime;
        const endDate = new Date(allSlots[allSlots.length - 1].endTime);
        endDate.setDate(endDate.getDate() + 1); // Include full last day

        const calendarEvents = await getEventsForDateRange(startDate, endDate);

        // 4. Remove already booked slots
        availableSlots = removeBookedSlots(allSlots, calendarEvents);
        console.log(`✅ ${availableSlots.length} available slots after removing booked ones`);
    } catch (calendarError) {
        console.log('⚠️  Could not check calendar, showing all CSV-based slots:', calendarError.message);
        // Continue with all slots if calendar check fails
    }

    // 5. Format and send availability table
    const availabilityText = formatAvailabilityTable(availableSlots, doctorName);
    await sendReply(emailData, availabilityText);

    console.log('✅ Availability reply sent successfully');
}

/**
 * Handles booking confirmation emails
 * Extracts requested slot, verifies calendar availability, and books
 * 
 * @param {Object} emailData - Email data
 * @param {string} doctorName - Doctor name
 */
async function handleBookingConfirmation(emailData, doctorName) {
    console.log('📋 Handling booking confirmation...');

    // 1. Extract requested slots from email using AI
    const requestedSlots = await extractBookingSlots(emailData.subject, emailData.body);
    console.log("requestedSlots=>", requestedSlots);

    if (!requestedSlots || requestedSlots.length === 0) {
        console.log('⚠️  Could not extract booking slots from email');
        await sendReply(emailData,
            `Thank you for your interest in booking an appointment with ${doctorName}. ` +
            `Unfortunately, I couldn't determine your preferred time slot. ` +
            `Please reply with a specific day and time (e.g., "Monday at 10:00 AM").`
        );
        return;
    }

    // 2. Generate available slots
    const availability = readAvailability(doctorName);
    const allSlots = generateSlots(availability);

    // 3. Get calendar events to check availability
    let availableSlots = allSlots;
    try {
        if (allSlots.length > 0) {
            const startDate = allSlots[0].startTime;
            const endDate = new Date(allSlots[allSlots.length - 1].endTime);
            endDate.setDate(endDate.getDate() + 1);

            const calendarEvents = await getEventsForDateRange(startDate, endDate);
            availableSlots = removeBookedSlots(allSlots, calendarEvents);
        }
    } catch (calendarError) {
        console.log('⚠️  Could not check calendar:', calendarError.message);
    }

    // 4. Try to match and book ALL available requested slots
    const senderName = extractSenderName(emailData.from);
    const senderEmail = extractSenderEmail(emailData.from);

    const bookedSlots = [];
    const failedSlots = [];

    for (const requested of requestedSlots) {
        const matchingSlot = findMatchingSlot(availableSlots, requested.day, requested.time);

        if (matchingSlot) {
            try {
                // 5. Book the slot on Google Calendar
                const event = await createEvent({
                    summary: `Appointment - ${senderName}`,
                    description: `Patient: ${senderName}\nEmail: ${senderEmail}\nBooked via email automation`,
                    startTime: matchingSlot.startTime,
                    endTime: matchingSlot.endTime,
                });

                bookedSlots.push(matchingSlot);
                console.log(`✅ Slot booked: ${matchingSlot.date} ${matchingSlot.label}`);

                // Remove booked slot from available slots so it can't be double-matched
                availableSlots = availableSlots.filter(s =>
                    s.startTime.getTime() !== matchingSlot.startTime.getTime()
                );

            } catch (bookingError) {
                console.error('❌ Error booking slot:', bookingError.message);
                failedSlots.push(requested);
            }
        } else {
            failedSlots.push(requested);
        }
    }

    // 6. Send response based on booking results
    if (bookedSlots.length > 0) {
        const slotDetails = bookedSlots.map(slot =>
            `📅 Date: ${slot.date}\n🕐 Time: ${slot.label}`
        ).join('\n\n');

        let confirmationText =
            `Your appointment${bookedSlots.length > 1 ? 's' : ''} with ${doctorName} ${bookedSlots.length > 1 ? 'have' : 'has'} been confirmed! ✅\n\n` +
            `${slotDetails}\n\n` +
            `Please arrive 10 minutes before your appointment time.\n`;

        if (failedSlots.length > 0) {
            confirmationText += `⚠️ Note: ${failedSlots.length} requested slot(s) could not be booked as they were not available.\n\n`;
        }

        confirmationText += `Thank you!`;

        await sendReply(emailData, confirmationText);
        console.log(`✅ ${bookedSlots.length} appointment(s) booked successfully for ${senderName}`);

    } else {
        // 7. No matching slot available — send apology
        const apologyText =
            `Thank you for your interest in booking with ${doctorName}.\n\n` +
            `Unfortunately, the requested time slot(s) are not available this week.\n\n` +
            `Here are the currently available slots:\n\n` +
            formatAvailabilityTable(availableSlots, doctorName);

        await sendReply(emailData, apologyText);
        console.log('📧 Sent apology with alternative slots');
    }
}

/**
 * Sends a reply email in the same thread
 * 
 * @param {Object} emailData - Original email data
 * @param {string} replyText - Reply body text
 */
async function sendReply(emailData, replyText) {
    const senderEmail = extractSenderEmail(emailData.from);

    await sendEmail({
        to: senderEmail,
        subject: `Re: ${emailData.subject}`,
        text: replyText,
        inReplyTo: emailData.messageId,
    });
}

/**
 * Extracts sender name from "Name <email>" format
 */
function extractSenderName(from) {
    const match = from.match(/^(.+?)\s*<.*>$/);
    return match ? match[1].trim().replace(/"/g, '') : from.split('@')[0];
}

/**
 * Extracts email address from "Name <email>" format
 */
function extractSenderEmail(from) {
    const match = from.match(/<(.+?)>/);
    return match ? match[1] : from;
}

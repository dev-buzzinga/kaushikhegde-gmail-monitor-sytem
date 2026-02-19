import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';

/**
 * Classifies an email into one of: APPOINTMENT, REFERRAL, UNKNOWN
 * 
 * @param {string} subject - Email subject
 * @param {string} body - Email body text
 * @returns {Promise<string>} - 'APPOINTMENT' | 'REFERRAL' | 'UNKNOWN'
 */
export async function classifyEmailType(subject, body) {
    try {
        if (!config.ANTHROPIC_API_KEY) {
            console.log('⚠️  ANTHROPIC_API_KEY not configured, skipping email classification');
            return 'UNKNOWN';
        }

        console.log('🤖 Classifying email type (APPOINTMENT / REFERRAL / UNKNOWN)...');

        const anthropic = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });

        const prompt = `
        You are an email classification engine for a dental clinic automation system.

        Email Subject:  ${subject}
        Email Body: ${body}

        Your job is to classify the email into EXACTLY ONE of the following categories:
        APPOINTMENT
        REFERRAL
        UNKNOWN

        DETAILED RULES:
        APPOINTMENT:
        - The sender is asking about doctor availability.
        - The sender wants to schedule, book, confirm, reschedule, or cancel an appointment.
        - The email mentions time slots, dates, days, availability, calendar, or scheduling.

        REFERRAL:
        - The email is about referring a patient.
        - It mentions referral forms, dental referral, specialist referral, patient details for referral.
        - It includes or refers to attached referral documents.
        - It talks about sending a patient to another dentist/specialist.

        IMPORTANT PRIORITY RULE:
        If the email clearly involves a dental referral or referral form, classify it as REFERRAL even if it mentions scheduling.

        UNKNOWN:
        - Marketing emails
        - Spam
        - Non-medical emails
        - Anything unrelated to appointment booking or referrals.

        Respond with ONLY one word:
        APPOINTMENT
        or
        REFERRAL
        or
        UNKNOWN

        No explanation.
`;

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            temperature: 0,
            top_p: 0.1,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
        });

        const response = message.content[0].text.trim().toUpperCase();
        console.log(`🤖 Email Type Classification: ${response}`);

        // Validate response
        if (['APPOINTMENT', 'REFERRAL', 'UNKNOWN'].includes(response)) {
            return response;
        }

        console.log('⚠️  Unexpected AI response, defaulting to UNKNOWN');
        return 'UNKNOWN';

    } catch (error) {
        console.error('❌ Error in email type classification:', error.message);
        return 'UNKNOWN'; // Fail gracefully
    }
}

/**
 * Determines the appointment intent: AVAILABILITY_REQUEST or BOOKING_CONFIRMATION
 * 
 * @param {string} subject - Email subject
 * @param {string} body - Email body text
 * @returns {Promise<string>} - 'AVAILABILITY_REQUEST' | 'BOOKING_CONFIRMATION'
 */
export async function classifyAppointmentIntent(subject, body) {
    try {
        if (!config.ANTHROPIC_API_KEY) {
            console.log('⚠️  ANTHROPIC_API_KEY not configured, skipping intent classification');
            return 'AVAILABILITY_REQUEST';
        }

        console.log('🤖 Determining appointment intent...');

        const anthropic = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });

        const prompt = `
        You are analyzing an email already classified as APPOINTMENT.
        Email Subject:  ${subject}
        Email Body: ${body}
        Determine the intent.
        Respond with EXACTLY ONE of:
        AVAILABILITY_REQUEST
        BOOKING_CONFIRMATION

        RULES:
        AVAILABILITY_REQUEST:
        - The sender is asking what time slots are available.
        - They have NOT selected a specific slot.
        - Examples:
        "What times are available?"
        "Can I see next week's schedule?"
        "When is Dr available?"

        BOOKING_CONFIRMATION:
        - The sender selects or confirms a specific day and time.
        - The sender chooses one or more specific time slots.
        - Examples:
        "Monday at 10 AM works."
        "Please book Tuesday 2 PM."
        "Any of these 3 slots are fine."

        If the email clearly includes specific date/time selections → BOOKING_CONFIRMATION.

        Respond with ONLY:
        AVAILABILITY_REQUEST
        or
        BOOKING_CONFIRMATION

        No explanation.
        `;

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            temperature: 0,
            top_p: 0.1,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
        });

        const response = message.content[0].text.trim().toUpperCase();
        console.log(`🤖 Appointment Intent: ${response}`);

        if (['AVAILABILITY_REQUEST', 'BOOKING_CONFIRMATION'].includes(response)) {
            return response;
        }

        console.log('⚠️  Unexpected AI response, defaulting to AVAILABILITY_REQUEST');
        return 'AVAILABILITY_REQUEST';

    } catch (error) {
        console.error('❌ Error in appointment intent classification:', error.message);
        return 'AVAILABILITY_REQUEST'; // Fail gracefully
    }
}

/**
 * Extracts requested booking slots from an email
 * 
 * @param {string} subject - Email subject
 * @param {string} body - Email body text
 * @returns {Promise<Array<Object>|null>} - Array of { day, time } objects or null
 */
export async function extractBookingSlots(subject, body) {
    try {
        if (!config.ANTHROPIC_API_KEY) {
            console.log('⚠️  ANTHROPIC_API_KEY not configured, skipping slot extraction');
            return null;
        }

        console.log('🤖 Extracting requested booking slots from email...');

        const anthropic = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });

        const prompt = `
You are extracting appointment booking slots from an email. Each slot = 1 hour.

Email Subject: ${subject}
Email Body: ${body}

TASK:
Extract ALL requested 1-hour appointment slots.

CRITICAL RULES FOR TIME RANGES:
- If a time RANGE is mentioned like "1 PM to 3 PM" → create SEPARATE slots for each hour:
  [{"day": "Monday", "time": "1:00 PM"}, {"day": "Monday", "time": "2:00 PM"}]
- If client says "2 hours" or "2 slots" on a day with a start time → expand into individual hourly slots
- If a single time is mentioned like "10 AM" → just one slot: [{"day": "Monday", "time": "10:00 AM"}]
- If client says "book from 9 AM to 12 PM" → 3 slots: 9:00 AM, 10:00 AM, 11:00 AM

EXAMPLES:
Input: "I need 1 PM to 3 PM on Monday"
Output: [{"day": "Monday", "time": "1:00 PM"}, {"day": "Monday", "time": "2:00 PM"}]

Input: "Book me 10 AM on Tuesday and 2 PM to 4 PM on Wednesday"
Output: [{"day": "Tuesday", "time": "10:00 AM"}, {"day": "Wednesday", "time": "2:00 PM"}, {"day": "Wednesday", "time": "3:00 PM"}]

Input: "I want 3 hours starting 9 AM Friday"
Output: [{"day": "Friday", "time": "9:00 AM"}, {"day": "Friday", "time": "10:00 AM"}, {"day": "Friday", "time": "11:00 AM"}]

RULES:
- "day" must be full weekday name (Monday, Tuesday, etc.)
- If full date mentioned, use YYYY-MM-DD format instead of day name
- "time" must be in 12-hour format with AM/PM (e.g., "1:00 PM")
- End time is the START of the LAST slot (1 PM to 3 PM = 1:00 PM and 2:00 PM)
- If no valid slot found, return: []

OUTPUT FORMAT:
Return STRICT JSON ARRAY ONLY.
NO explanation, NO markdown, NO code blocks, NO extra text.
Only valid JSON array.`;

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024, // ⬆️ increased for multiple slots
            temperature: 0,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
        });

        const responseText = message.content[0].text.trim();
        const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const slots = JSON.parse(cleanedResponse);

        console.log(`🤖 Extracted ${slots.length} booking slot(s)`);
        return slots.length > 0 ? slots : null;

    } catch (error) {
        console.error('❌ Error extracting booking slots:', error.message);
        return null;
    }
}
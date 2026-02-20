import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

/**
 * AI Service for processing emails and extracting referral data
 * Uses Anthropic API for classification and document understanding
 */

/**
 * Step 2: Classify email using AI (subject + body)
 * Determines if email is related to dental referral
 * 
 * @param {string} subject - Email subject
 * @param {string} body - Email body text
 * @returns {Promise<boolean>} - true if dental referral, false otherwise
 */
export async function classifyEmail(subject, body) {
    try {
        if (!config.ANTHROPIC_API_KEY) {
            console.log('⚠️  ANTHROPIC_API_KEY not configured, skipping AI classification');
            return false;
        }

        console.log('🤖 Classifying email with AI...');

        const anthropic = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });

        const prompt = `You are analyzing an email to determine if it contains a dental referral or dentist referring form.

Email Subject: ${subject}

Email Body:
${body}

Question: Is this email related to a dental referral where a dentist is sending a patient referral form or dental referral information?

Respond with ONLY one word:
YES
or
NO

Response:`;

        const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 10,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
        });

        const response = message.content[0].text.trim().toUpperCase();
        console.log(`🤖 AI Classification Result: ${response}`);

        return response === 'YES';

    } catch (error) {
        console.error('❌ Error in AI email classification:', error.message);
        return false; // Fail gracefully
    }
}

/**
 * Step 4: Extract referral data from attachment using AI
 * Sends attachment to Anthropic Vision for document understanding
 * 
 * @param {Array<string>} attachmentPaths - Full paths to attachment files
 * @param {string} attachmentsDir - Directory where attachments are stored
 * @returns {Promise<Object|null>} - Extracted referral data as JSON or null
 */
export async function extractReferralData(attachmentPaths, attachmentsDir) {
    try {
        if (!config.ANTHROPIC_API_KEY) {
            console.log('⚠️  ANTHROPIC_API_KEY not configured, skipping AI extraction');
            return null;
        }

        if (!attachmentPaths || attachmentPaths.length === 0) {
            console.log('⚠️  No attachments to process');
            return null;
        }

        console.log(`🤖 Analyzing ${attachmentPaths.length} attachment(s) with AI Vision...`);

        const anthropic = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });

        // Process first attachment (can extend to multiple)
        const attachmentFilename = attachmentPaths[0];
        const attachmentFullPath = path.join(attachmentsDir, attachmentFilename);

        // Check if file exists
        if (!fs.existsSync(attachmentFullPath)) {
            console.error(`❌ Attachment file not found: ${attachmentFullPath}`);
            return null;
        }

        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(attachmentFullPath);
        const base64Data = fileBuffer.toString('base64');

        // Determine file type and create appropriate content block
        const ext = path.extname(attachmentFilename).toLowerCase();
        let contentBlock;

        if (ext === '.pdf') {
            // ✅ PDF: Use document type (Claude Sonnet 4 supports PDFs natively)
            console.log('📄 Processing PDF document with AI...');
            contentBlock = {
                type: 'document',
                source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Data,
                },
            };
        } else {
            // ✅ Image: Use image type
            let mediaType = 'image/jpeg';
            if (ext === '.png') mediaType = 'image/png';
            else if (ext === '.gif') mediaType = 'image/gif';
            else if (ext === '.webp') mediaType = 'image/webp';
            else if (ext === '.jpg' || ext === '.jpeg') mediaType = 'image/jpeg';

            console.log(`🖼️  Processing ${ext} image with AI Vision...`);
            contentBlock = {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Data,
                },
            };
        }

        const prompt = `You are analyzing a document that may be a dental referral form.

TASK 1 - Determine if this is a dental referral form:
First, examine if this document is actually a dental/dentist patient referral form.
If it is NOT a referral form, respond with JSON: {"isReferralForm": false}

TASK 2 - Extract structured data:
If it IS a referral form, follow these STRICT rules:

STRICT RULES:
1. ONLY extract fields that are PHYSICALLY PRESENT and VISIBLE in the document
2. If a field exists in the form but is EMPTY/BLANK → return it as null
3. Do NOT guess, assume, or make up any field names or values
4. Do NOT include fields that are not in the document at all
5. ONLY return fields you can actually SEE in the form

HOW TO EXTRACT:
- Look at every label/field name in the document
- Use the EXACT field name as it appears in the form
- If the field has a value filled in → include it
- If the field is blank/empty → return null for that field
- If the field does not exist in the form → do NOT include it in JSON

SPECIAL INSTRUCTIONS FOR CHECKBOXES AND TOOTH DIAGRAMS:
- If you see a "Reason for Referral" section with tooth numbers (like 11, 12, 21, 22 etc.) 
  that are checked or highlighted → extract them as an array: "reasonForReferral": [11, 21, 22]
- If none are checked → return null
- Also check for procedure checkboxes like "Dental Implants", "Bone Grafting", 
  "Extractions", "Jaw Trauma", "Pathology", "CT Imaging", "Pre-Prosthetic Surgery"
  → extract only the CHECKED ones as an array: "selectedProcedures": ["Bone Grafting"]
- For "X-rays enclosed" checkbox → if checked extract the date, if not checked return null

SPECIAL INSTRUCTIONS FOR "Reason for Referral" TOOTH DIAGRAM:
- This section contains a grid of tooth numbers (11-85 dental numbering system)
- Teeth that are SELECTED/CHECKED have a visible "X" or cross mark drawn on them
- Teeth that are NOT selected are plain numbers without any mark
- CAREFULLY look at each number — if it has an X or cross mark through it → it is selected
- Extract ONLY the tooth numbers that have an X mark as an array
- Example: if teeth 11, 12, 21 have X marks → "reasonForReferral": [11, 12, 21]
- If NO teeth are marked → return null
- Do NOT include plain numbers without X marks

STRICT OCR ACCURACY RULES:
- Phone numbers: ONLY contain digits 0-9, NO letters allowed
  (Common AI mistake: confusing "1" with "I" or "l" — always use digit "1")
- Dates: format as written in the form (DD/MM/YYYY)
- Numbers: double-check that no digit has been replaced with a letter

Return ONLY valid JSON in this format:
{
  "isReferralForm": true,
  "fieldNameFromForm": "extracted value or null",
  "reasonForReferral": [11, 21, 22] or null,
  "selectedProcedures": ["Bone Grafting"] or null,
  "xraysDate": "22/05/2005" or null
}

CRITICAL: 
- Return ONLY the JSON object, no explanation, no extra text
- Never invent fields
- Never fill in values that are not written in the form
- Phone/ID numbers must contain ONLY digits, never letters`;
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            temperature: 0.3,
            messages: [
                {
                    role: 'user',
                    content: [
                        contentBlock, // ✅ Dynamic content block (document or image)
                        {
                            type: 'text',
                            text: prompt
                        }
                    ],
                }
            ],
        });

        const responseText = message.content[0].text.trim();
        // console.log('🤖 AI Extraction Response:', responseText);
        const aiResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Parse JSON response
        const extractedData = JSON.parse(aiResponse);

        // Check if it's a referral form
        if (!extractedData.isReferralForm) {
            console.log('ℹ️  AI determined this is not a referral form');
            return null;
        }

        // Remove the isReferralForm flag from the data
        delete extractedData.isReferralForm;

        // console.log('✅ Successfully extracted referral data==>', extractedData);
        return extractedData;

    } catch (error) {
        console.error('❌ Error in AI document extraction:', error.message);
        if (error.response) {
            console.error('API Error:', error.response.data);
        }
        return null; // Fail gracefully
    }
}


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
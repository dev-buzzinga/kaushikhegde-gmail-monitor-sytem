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

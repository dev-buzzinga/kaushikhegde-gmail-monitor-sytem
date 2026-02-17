import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';
import { logEmailToCSV } from '../utils/csvLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define attachments storage path
const ATTACHMENTS_DIR = path.join(__dirname, '../../storage/attachments');

/**
 * Ensures the attachments directory exists
 */
function ensureAttachmentsDirectory() {
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
        fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
        console.log('✅ Created attachments directory');
    }
}

/**
 * Extracts Gmail thread ID from email headers
 * @param {Object} headers - Email headers
 * @returns {string} - Thread ID or generated timestamp
 */
function extractThreadId(headers) {
    // Try to get Gmail thread ID from X-GM-THRID header
    const threadId = headers.get('x-gm-thrid');
    if (threadId) {
        return threadId.toString();
    }

    // Fallback: use Message-ID or timestamp
    const messageId = headers.get('message-id');
    if (messageId) {
        // Extract just the unique part of message ID
        const match = messageId.match(/<(.+)@/);
        if (match) {
            return match[1].replace(/[^a-zA-Z0-9]/g, '');
        }
    }

    // Last resort: use timestamp
    return Date.now().toString();
}

/**
 * Saves an email attachment to disk
 * @param {Object} attachment - Attachment object from mailparser
 * @param {string} threadId - Gmail thread ID
 * @returns {string} - Saved filename
 */
function saveAttachment(attachment, threadId) {
    try {
        ensureAttachmentsDirectory();

        // Create filename in format: <threadId>_<originalFilename>
        const filename = `${threadId}_${attachment.filename}`;
        const filepath = path.join(ATTACHMENTS_DIR, filename);

        // Write attachment content to file
        fs.writeFileSync(filepath, attachment.content);

        console.log(`📎 Saved attachment: ${filename}`);
        return filename;

    } catch (error) {
        console.error(`❌ Error saving attachment ${attachment.filename}:`, error.message);
        return null;
    }
}

/**
 * Processes a single email message
 * @param {Object} message - Email message from IMAP
 * @returns {Promise<Object>} - Processed email data
 */
async function processEmail(message) {
    try {
        // Parse the email using mailparser
        const parsed = await simpleParser(message.source);

        // Extract thread ID
        const threadId = extractThreadId(parsed.headers);

        // ✅ PART 1: Extract Message-ID header for email reply support
        const messageId = parsed.headers.get('message-id') || '';

        // Extract plain text body
        let body = '';
        if (parsed.text) {
            body = parsed.text.substring(0, 500); // Limit body length for CSV
        } else if (parsed.textAsHtml) {
            // If no plain text, use a snippet of HTML
            body = parsed.textAsHtml.substring(0, 500);
        }

        // Process attachments
        const savedAttachments = [];
        if (parsed.attachments && parsed.attachments.length > 0) {
            console.log(`📎 Found ${parsed.attachments.length} attachment(s)`);

            for (const attachment of parsed.attachments) {
                const savedFilename = saveAttachment(attachment, threadId);
                if (savedFilename) {
                    savedAttachments.push(savedFilename);
                }
            }
        }

        // Prepare email data
        const emailData = {
            date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            from: parsed.from ? parsed.from.text : 'Unknown',
            subject: parsed.subject || 'No Subject',
            threadId: threadId,
            messageId: messageId, // ✅ Added messageId for reply support
            body: body,
            attachments: savedAttachments
        };

        // Log to CSV
        await logEmailToCSV(emailData);

        return emailData;

    } catch (error) {
        console.error('❌ Error processing email:', error.message);
        throw error;
    }
}

/**
 * Connects to Gmail via IMAP and fetches unseen emails
 * Processes each email, downloads attachments, and logs to CSV
 * 
 * @returns {Promise<Object>} - Result object with count and processed emails
 */
export async function fetchUnseenEmails() {
    let client;

    try {
        // Validate configuration
        if (!config.EMAIL_USER || !config.EMAIL_APP_PASSWORD) {
            throw new Error('Gmail credentials not configured. Please set EMAIL_USER and EMAIL_APP_PASSWORD in .env file');
        }

        console.log('📬 Connecting to Gmail IMAP...');

        // Create IMAP client
        client = new ImapFlow({
            host: config.IMAP_HOST,
            port: config.IMAP_PORT,
            secure: true,
            auth: {
                user: config.EMAIL_USER,
                pass: config.EMAIL_APP_PASSWORD
            },
            logger: false // Disable verbose logging
        });

        // Connect to IMAP server
        await client.connect();
        console.log('✅ Connected to Gmail IMAP');

        // Open INBOX mailbox
        await client.mailboxOpen('INBOX');
        console.log('📂 Opened INBOX');

        // Search for UNSEEN emails
        const unseenMessages = await client.search({ seen: false });

        if (!unseenMessages || unseenMessages.length === 0) {
            console.log('📭 No new unseen emails found');
            return {
                success: true,
                count: 0,
                emails: [],
                message: 'No new emails to process'
            };
        }

        console.log(`📧 Found ${unseenMessages.length} unseen email(s)`);

        const processedEmails = [];
        let successCount = 0;
        let errorCount = 0;

        // Process each unseen email
        for (const uid of unseenMessages) {
            try {
                // Fetch email with full content
                const message = await client.fetchOne(uid, {
                    source: true,
                    flags: true
                });

                // Process the email
                const emailData = await processEmail(message);
                processedEmails.push(emailData);
                successCount++;

                // Mark as seen (optional - remove if you want emails to stay unseen)
                // await client.messageFlagsAdd(uid, ['\\Seen']);

            } catch (emailError) {
                console.error(`❌ Failed to process email UID ${uid}:`, emailError.message);
                errorCount++;
                // Continue processing next email instead of crashing
            }
        }

        console.log(`✅ Successfully processed ${successCount} email(s)`);
        if (errorCount > 0) {
            console.log(`⚠️  Failed to process ${errorCount} email(s)`);
        }

        return {
            success: true,
            count: successCount,
            errors: errorCount,
            emails: processedEmails,
            message: `Processed ${successCount} email(s)`
        };

    } catch (error) {
        console.error('❌ Error fetching emails:', error.message);

        return {
            success: false,
            count: 0,
            emails: [],
            error: error.message,
            message: 'Failed to fetch emails'
        };

    } finally {
        // Always close the connection
        if (client) {
            try {
                await client.logout();
                console.log('🔌 Disconnected from Gmail IMAP');
            } catch (logoutError) {
                console.error('Error during logout:', logoutError.message);
            }
        }
    }
}

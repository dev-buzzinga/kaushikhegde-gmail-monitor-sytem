import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createObjectCsvWriter } from 'csv-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define storage path
const STORAGE_DIR = path.join(__dirname, '../../storage');
const CSV_FILE_PATH = path.join(STORAGE_DIR, 'email_log.csv');

/**
 * Ensures the storage directory exists
 */
function ensureStorageDirectory() {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        console.log('✅ Created storage directory');
    }
}

/**
 * Checks if the CSV file exists and has headers
 * @returns {boolean}
 */
function csvFileExists() {
    return fs.existsSync(CSV_FILE_PATH);
}

/**
 * Sanitizes text for CSV export
 * Removes problematic characters, emojis, and special symbols
 * that can cause encoding issues in CSV files
 * 
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
    if (!text) return '';

    return text
        // Remove emojis and special Unicode characters
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
        .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
        .replace(/[\u{200D}]/gu, '')            // Zero Width Joiner
        .replace(/[\u{200B}-\u{200F}]/gu, '')   // Zero Width Spaces
        .replace(/[\uFEFF]/gu, '')              // Zero Width No-Break Space
        // Remove other problematic Unicode characters
        .replace(/[^\x00-\x7F]/g, '')           // Remove non-ASCII characters
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Remove newlines and tabs
        .replace(/[\n\r\t]/g, ' ')
        // Trim whitespace
        .trim();
}

/**
 * Logs email data to CSV file
 * Creates the file with headers if it doesn't exist
 * Appends data if file exists
 * 
 * @param {Object} emailData - Email data to log
 * @param {string} emailData.date - Email date
 * @param {string} emailData.from - Email sender
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.threadId - Gmail thread ID
 * @param {string} emailData.body - Email body text
 * @param {Array<string>} emailData.attachments - Array of attachment filenames
 */
export async function logEmailToCSV(emailData) {
    try {
        ensureStorageDirectory();

        const fileExists = csvFileExists();

        const csvWriter = createObjectCsvWriter({
            path: CSV_FILE_PATH,
            header: [
                { id: 'date', title: 'date' },
                { id: 'from', title: 'from' },
                { id: 'subject', title: 'subject' },
                { id: 'threadId', title: 'threadId' },
                { id: 'body', title: 'body' },
                { id: 'attachments', title: 'attachments' }
            ],
            append: fileExists // Append if file exists, otherwise create new
        });

        // Format attachments as pipe-separated string
        const attachmentsString = emailData.attachments && emailData.attachments.length > 0
            ? emailData.attachments.join('|')
            : '';

        // Prepare data row with sanitized text
        const record = {
            date: emailData.date || '',
            from: sanitizeText(emailData.from) || '',
            subject: sanitizeText(emailData.subject) || '',
            threadId: emailData.threadId || '',
            body: sanitizeText(emailData.body), // Sanitize body text
            attachments: attachmentsString
        };

        await csvWriter.writeRecords([record]);
        console.log(`✅ Logged email to CSV: ${emailData.subject}`);

    } catch (error) {
        console.error('❌ Error logging to CSV:', error.message);
        throw error;
    }
}

/**
 * Gets the path to the CSV file
 * @returns {string}
 */
export function getCSVPath() {
    return CSV_FILE_PATH;
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createObjectCsvWriter } from 'csv-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define storage path
const STORAGE_DIR = path.join(__dirname, '../../storage');
const REFERRALS_CSV_PATH = path.join(STORAGE_DIR, 'referrals.csv');

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
 * Checks if the referrals CSV file exists
 * @returns {boolean}
 */
function referralsCsvExists() {
    return fs.existsSync(REFERRALS_CSV_PATH);
}

/**
 * Reads existing CSV headers to determine current column structure
 * @returns {Array<string>} - Array of existing column names
 */
function getExistingHeaders() {
    if (!referralsCsvExists()) {
        return [];
    }

    try {
        const content = fs.readFileSync(REFERRALS_CSV_PATH, 'utf8');
        const lines = content.split('\n');
        if (lines.length > 0) {
            return lines[0].split(',').map(h => h.trim());
        }
    } catch (error) {
        console.error('Error reading existing headers:', error.message);
    }

    return [];
}

/**
 * Merges existing headers with new fields from extracted data
 * Maintains order: messageId, threadId, from, then alphabetically sorted extracted fields
 * 
 * @param {Array<string>} existingHeaders - Current CSV headers
 * @param {Object} extractedData - New data with potential new fields
 * @returns {Array<string>} - Merged header list
 */
function mergeHeaders(existingHeaders, extractedData) {
    // Base required fields
    const baseFields = ['messageId', 'threadId', 'from'];

    // Get all fields from extracted data
    const extractedFields = Object.keys(extractedData).filter(
        key => !baseFields.includes(key)
    );

    // Combine existing and new fields
    const allExtractedFields = new Set();

    // Add existing fields (excluding base fields)
    existingHeaders.forEach(header => {
        if (!baseFields.includes(header)) {
            allExtractedFields.add(header);
        }
    });

    // Add new fields from current data
    extractedFields.forEach(field => {
        allExtractedFields.add(field);
    });

    // Sort alphabetically for consistency
    const sortedExtractedFields = Array.from(allExtractedFields).sort();

    // Return base fields + sorted extracted fields
    return [...baseFields, ...sortedExtractedFields];
}

/**
 * Logs referral data to CSV file with dynamic column support
 * Creates file if it doesn't exist
 * Dynamically adds new columns as needed
 * 
 * @param {Object} referralData - Referral data to log
 * @param {string} referralData.messageId - Email Message-ID
 * @param {string} referralData.threadId - Gmail thread ID
 * @param {string} referralData.from - Email sender
 * @param {Object} referralData.extractedData - AI-extracted fields
 */
export async function logReferralToCSV(referralData) {
    try {
        ensureStorageDirectory();

        const { messageId, threadId, from, extractedData } = referralData;

        // Combine all data
        const fullData = {
            messageId,
            threadId,
            from,
            ...extractedData
        };

        const fileExists = referralsCsvExists();
        const existingHeaders = fileExists ? getExistingHeaders() : [];
        const newHeaders = mergeHeaders(existingHeaders, fullData);

        // If headers changed, we need to rewrite the file
        const headersChanged = fileExists &&
            JSON.stringify(existingHeaders) !== JSON.stringify(newHeaders);

        if (headersChanged) {
            console.log('ℹ️  New columns detected, updating CSV structure...');
            await rewriteCSVWithNewHeaders(existingHeaders, newHeaders);
        }

        // Create CSV writer with current headers
        const header = newHeaders.map(h => ({ id: h, title: h }));

        const csvWriter = createObjectCsvWriter({
            path: REFERRALS_CSV_PATH,
            header: header,
            append: fileExists && !headersChanged
        });

        // Prepare record with all fields (null for missing values)
        const record = {};
        newHeaders.forEach(headerKey => {
            record[headerKey] = fullData[headerKey] || '';
        });

        await csvWriter.writeRecords([record]);
        console.log(`✅ Logged referral to CSV: ${from}`);

    } catch (error) {
        console.error('❌ Error logging referral to CSV:', error.message);
        throw error;
    }
}

/**
 * Rewrites the entire CSV file with new header structure
 * Preserves existing data and fills missing columns with empty strings
 * 
 * @param {Array<string>} oldHeaders - Previous headers
 * @param {Array<string>} newHeaders - New headers including added columns
 */
async function rewriteCSVWithNewHeaders(oldHeaders, newHeaders) {
    try {
        // Read existing data
        const content = fs.readFileSync(REFERRALS_CSV_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length <= 1) {
            // Only header or empty, just update header
            return;
        }

        // Parse existing records
        const existingRecords = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const record = {};
            oldHeaders.forEach((header, index) => {
                record[header] = values[index] || '';
            });
            existingRecords.push(record);
        }

        // Create new CSV writer with new headers
        const header = newHeaders.map(h => ({ id: h, title: h }));
        const csvWriter = createObjectCsvWriter({
            path: REFERRALS_CSV_PATH,
            header: header,
            append: false // Overwrite
        });

        // Prepare records with new structure
        const updatedRecords = existingRecords.map(record => {
            const newRecord = {};
            newHeaders.forEach(headerKey => {
                newRecord[headerKey] = record[headerKey] || '';
            });
            return newRecord;
        });

        // Write all records
        await csvWriter.writeRecords(updatedRecords);
        console.log('✅ CSV structure updated with new columns');

    } catch (error) {
        console.error('❌ Error rewriting CSV:', error.message);
        throw error;
    }
}

/**
 * Gets the path to the referrals CSV file
 * @returns {string}
 */
export function getReferralsCSVPath() {
    return REFERRALS_CSV_PATH;
}

import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

/**
 * Creates and configures the SMTP transporter for Gmail
 * @returns {nodemailer.Transporter}
 */
function createTransporter() {
    return nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: true, // Use SSL
        auth: {
            user: config.EMAIL_USER,
            pass: config.EMAIL_APP_PASSWORD
        }
    });
}

/**
 * Sends an email using Gmail SMTP
 * 
 * @param {Object} emailOptions - Email options
 * @param {string} emailOptions.to - Recipient email address
 * @param {string} emailOptions.subject - Email subject
 * @param {string} emailOptions.text - Email body (plain text)
 * @returns {Promise<Object>} - Send result with success status and message
 */
export async function sendEmail({ to, subject, text, inReplyTo }) {
    try {
        // Validate required fields
        if (!to || !subject || !text) {
            throw new Error('Missing required fields: to, subject, and text are required');
        }

        if (!config.EMAIL_USER || !config.EMAIL_APP_PASSWORD) {
            throw new Error('Gmail credentials not configured. Please set EMAIL_USER and EMAIL_APP_PASSWORD in .env file');
        }

        const transporter = createTransporter();

        const mailOptions = {
            from: config.EMAIL_USER,
            to,
            subject,
            text,
            headers: {}
        };
        if (inReplyTo) {
            mailOptions.headers['In-Reply-To'] = inReplyTo;
            mailOptions.headers['References'] = inReplyTo;
        }
        console.log(`📧 Sending email to: ${to}`);
        const info = await transporter.sendMail(mailOptions);

        console.log(`✅ Email sent successfully! Message ID: ${info.messageId}`);

        // Mark the sent email as read in Sent Mail folder via IMAP
        await markSentEmailAsRead();

        return {
            success: true,
            messageId: info.messageId,
            message: 'Email sent successfully'
        };

    } catch (error) {
        console.error('❌ Error sending email:', error.message);

        return {
            success: false,
            error: error.message,
            message: 'Failed to send email'
        };
    }
}

async function markSentEmailAsRead() {
    let client;

    try {
        client = new ImapFlow({
            host: config.IMAP_HOST,
            port: config.IMAP_PORT,
            secure: true,
            auth: {
                user: config.EMAIL_USER,
                pass: config.EMAIL_APP_PASSWORD
            },
            logger: false
        });

        await client.connect();

        // Open the Sent Mail folder
        await client.mailboxOpen('[Gmail]/Sent Mail');

        // Search for unseen emails in Sent Mail
        const unseenSent = await client.search({ seen: false });

        if (unseenSent && unseenSent.length > 0) {
            // Mark all unseen sent emails as read
            await client.messageFlagsAdd(unseenSent, ['\\Seen']);
            console.log(`✅ Marked ${unseenSent.length} sent email(s) as read`);
        }

    } catch (error) {
        // Non-critical - don't break the flow
        console.error('⚠️  Could not mark sent email as read:', error.message);
    } finally {
        if (client) {
            try {
                await client.logout();
            } catch (logoutError) {
                // Ignore logout errors
            }
        }
    }
}

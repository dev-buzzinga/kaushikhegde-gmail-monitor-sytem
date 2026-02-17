import express from 'express';
import { checkEmails, sendEmailController } from '../controllers/emailController.js';

const router = express.Router();

/**
 * POST /api/check-emails
 * Manually triggers Gmail inbox check
 * Fetches unseen emails, processes them, downloads attachments, and logs to CSV
 */
router.post('/check-emails', checkEmails);

/**
 * POST /api/send-email
 * Sends an email via Gmail SMTP
 * 
 * Request body:
 * {
 *   "to": "recipient@email.com",
 *   "subject": "Email subject",
 *   "text": "Email body text"
 * }
 */
router.post('/send-email', sendEmailController);

export default router;

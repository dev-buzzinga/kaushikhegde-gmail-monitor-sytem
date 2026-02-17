import { fetchUnseenEmails } from '../services/gmailReader.js';
import { sendEmail } from '../services/gmailSender.js';

export async function checkEmails(req, res) {
    try {
        console.log('🔍 Manual email check triggered');

        // Fetch and process unseen emails from service
        const result = await fetchUnseenEmails();

        if (result.success) {
            return res.status(200).json({
                success: true,
                data: {
                    count: result.count,
                    errors: result.errors || 0,
                    emails: result.emails
                },
                message: result.message
            });
        } else {
            return res.status(500).json({
                success: false,
                data: {},
                message: result.message,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error in check-emails controller:', error.message);

        return res.status(500).json({
            success: false,
            data: {},
            message: 'Internal server error',
            error: error.message
        });
    }
}

export async function sendEmailController(req, res) {
    try {
        const { to, subject, text, inReplyTo } = req.body;
        // Send email via service
        const result = await sendEmail({ to, subject, text, inReplyTo });

        if (result.success) {
            return res.status(200).json({
                success: true,
                data: {
                    messageId: result.messageId
                },
                message: result.message
            });
        } else {
            return res.status(500).json({
                success: false,
                data: {},
                message: result.message,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error in send-email controller:', error.message);

        return res.status(500).json({
            success: false,
            data: {},
            message: 'Internal server error',
            error: error.message
        });
    }
}

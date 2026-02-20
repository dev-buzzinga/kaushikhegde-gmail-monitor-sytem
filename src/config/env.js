import dotenv from "dotenv";
dotenv.config();

export const config = {
    PORT: process.env.PORT || 5000,
    NODE_ENV: process.env.NODE_ENV,

    // Gmail Configuration
    EMAIL_USER: process.env.EMAIL_USER || "rushabh.s@buzzinga.design",
    EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD || "gvbljkcdcxbjpxxg",

    // IMAP Configuration
    IMAP_HOST: process.env.IMAP_HOST || 'imap.gmail.com',
    IMAP_PORT: parseInt(process.env.IMAP_PORT) || 993,

    // SMTP Configuration
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: parseInt(process.env.SMTP_PORT) || 465,

    // AI Configuration
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    MAX_AI_ATTACHMENT_SIZE_MB: parseInt(process.env.MAX_AI_ATTACHMENT_SIZE_MB) || 2,

    // Google Calendar OAuth2 Configuration
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || 'primary',

    // Doctor Configuration
    DOCTOR_NAME: process.env.DOCTOR_NAME || 'Dr Rishabh'
}

/**
 * Google Calendar OAuth2 Token Generator
 * 
 * Run this script once to get a refresh token for Google Calendar API.
 * 
 * Prerequisites:
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create OAuth2 credentials (Desktop app type)
 * 3. Enable Google Calendar API in your project
 * 4. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 * 
 * Usage:
 *   node scripts/generateToken.js
 * 
 * After running, copy the refresh token and add it to .env as GOOGLE_REFRESH_TOKEN
 */

import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    console.error('   1. Go to https://console.cloud.google.com/apis/credentials');
    console.error('   2. Create OAuth2 credentials (Desktop app type)');
    console.error('   3. Add the values to your .env file');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
});

console.log('🔗 Open this URL in your browser to authorize:\n');
console.log(authUrl);
console.log('\n⏳ Waiting for authorization...\n');

// Start local server to receive the callback
const server = http.createServer(async (req, res) => {
    try {
        const queryParams = new url.URL(req.url, `http://localhost:3000`).searchParams;
        const code = queryParams.get('code');

        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: No authorization code received</h1>');
            return;
        }

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Authorization successful!</h1><p>You can close this window. Check the terminal for your refresh token.</p>');

        console.log('✅ Authorization successful!\n');
        console.log('━'.repeat(60));
        console.log('Add this to your .env file:\n');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('━'.repeat(60));

        server.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error exchanging code for tokens:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Error during token exchange</h1>');
        server.close();
        process.exit(1);
    }
});

server.listen(3000, () => {
    console.log('🖥️  Local callback server running on http://localhost:3000');
});

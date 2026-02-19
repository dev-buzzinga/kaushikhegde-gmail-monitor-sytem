import { google } from 'googleapis';
import { config } from '../config/env.js';

/**
 * Google Calendar Service
 * Uses OAuth2 with stored refresh token for calendar access
 */

/**
 * Creates an authenticated OAuth2 client using stored refresh token
 * @returns {google.auth.OAuth2} - Authenticated OAuth2 client
 */
function getCalendarAuth() {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
        throw new Error(
            'Google Calendar credentials not configured. ' +
            'Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env. ' +
            'Run `node scripts/generateToken.js` to generate the refresh token.'
        );
    }

    const oauth2Client = new google.auth.OAuth2(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: config.GOOGLE_REFRESH_TOKEN,
    });

    return oauth2Client;
}

/**
 * Gets events from Google Calendar for a given date range
 * 
 * @param {Date} startDate - Start of the date range
 * @param {Date} endDate - End of the date range
 * @returns {Promise<Array<Object>>} - Array of calendar events
 */
export async function getEventsForDateRange(startDate, endDate) {
    try {
        const auth = getCalendarAuth();
        const calendar = google.calendar({ version: 'v3', auth });

        const response = await calendar.events.list({
            calendarId: config.GOOGLE_CALENDAR_ID || 'primary',
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        console.log(`📅 Found ${events.length} calendar event(s) in date range`);

        return events.map(event => ({
            summary: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
        }));

    } catch (error) {
        console.error('❌ Error fetching calendar events:', error.message);
        throw error;
    }
}

/**
 * Creates a new event on Google Calendar
 * 
 * @param {Object} eventDetails - Event details
 * @param {string} eventDetails.summary - Event title (e.g., "Appointment - Patient Name")
 * @param {string} eventDetails.description - Event description
 * @param {Date} eventDetails.startTime - Event start time
 * @param {Date} eventDetails.endTime - Event end time
 * @returns {Promise<Object>} - Created event data
 */
export async function createEvent({ summary, description, startTime, endTime }) {
    try {
        const auth = getCalendarAuth();
        const calendar = google.calendar({ version: 'v3', auth });

        const event = {
            summary,
            description,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
        };

        const response = await calendar.events.insert({
            calendarId: config.GOOGLE_CALENDAR_ID || 'primary',
            requestBody: event,
        });

        console.log(`✅ Calendar event created: ${response.data.summary} at ${response.data.start.dateTime}`);

        return {
            id: response.data.id,
            summary: response.data.summary,
            start: response.data.start.dateTime,
            end: response.data.end.dateTime,
            htmlLink: response.data.htmlLink,
        };

    } catch (error) {
        console.error('❌ Error creating calendar event:', error.message);
        throw error;
    }
}

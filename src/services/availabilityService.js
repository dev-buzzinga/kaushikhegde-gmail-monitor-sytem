import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AVAILABILITY_CSV_PATH = path.join(__dirname, '../../storage/availability.csv');

/**
 * Day name to JS day index mapping (0=Sunday, 1=Monday, etc.)
 */
const DAY_MAP = {
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6,
};

/**
 * Parses time string in "HH:MM AM/PM" format to hours and minutes
 * @param {string} timeStr - Time string like "09:00 AM" or "05:00 PM"
 * @returns {{ hours: number, minutes: number }}
 */
function parseTime(timeStr) {
    const [time, period] = timeStr.trim().split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (period.toUpperCase() === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period.toUpperCase() === 'AM' && hours === 12) {
        hours = 0;
    }

    return { hours, minutes };
}

/**
 * Reads availability CSV and filters by doctor name
 * 
 * @param {string} doctorName - Doctor name to filter by
 * @returns {Array<Object>} - Array of { doctor, day, start, end }
 */
export function readAvailability(doctorName) {
    try {
        if (!fs.existsSync(AVAILABILITY_CSV_PATH)) {
            console.log('⚠️  availability.csv not found');
            return [];
        }

        const content = fs.readFileSync(AVAILABILITY_CSV_PATH, 'utf-8');
        const lines = content.trim().split('\n');

        if (lines.length <= 1) {
            return []; // Only header or empty
        }

        // Skip header row
        const dataLines = lines.slice(1);
        const availability = [];

        for (const line of dataLines) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 4) {
                const [doctor, day, start, end] = parts;
                if (doctor.toLowerCase() === doctorName.toLowerCase()) {
                    availability.push({ doctor, day, start, end });
                }
            }
        }

        console.log(`📋 Found ${availability.length} availability entries for ${doctorName}`);
        return availability;

    } catch (error) {
        console.error('❌ Error reading availability CSV:', error.message);
        return [];
    }
}

/**
 * Gets the dates for the current week (Monday to Sunday)
 * @returns {Object} - Map of day name → Date object for current week
 */
export function getCurrentWeekDates() {
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

    const weekDates = {};

    for (const [dayName, dayIndex] of Object.entries(DAY_MAP)) {
        const date = new Date(now);
        const offset = mondayOffset + (dayIndex === 0 ? 6 : dayIndex - 1);
        date.setDate(now.getDate() + offset);
        date.setHours(0, 0, 0, 0);
        weekDates[dayName] = date;
    }

    return weekDates;
}

/**
 * Generates 1-hour time slots from availability for current week
 * 
 * @param {Array<Object>} availability - Array from readAvailability()
 * @returns {Array<Object>} - Array of { day, date, startTime, endTime, label }
 */
export function generateSlots(availability) {
    const weekDates = getCurrentWeekDates();
    const slots = [];
    const now = new Date();

    for (const entry of availability) {
        const date = weekDates[entry.day];
        if (!date) continue;

        const start = parseTime(entry.start);
        const end = parseTime(entry.end);

        // Generate 1-hour slots
        let currentHour = start.hours;
        const currentMinute = start.minutes;

        while (currentHour < end.hours || (currentHour === end.hours && currentMinute < end.minutes)) {
            const slotStart = new Date(date);
            slotStart.setHours(currentHour, currentMinute, 0, 0);

            const slotEnd = new Date(slotStart);
            slotEnd.setHours(currentHour + 1, currentMinute, 0, 0);

            // Don't exceed end time
            if (slotEnd.getHours() > end.hours || (slotEnd.getHours() === end.hours && slotEnd.getMinutes() > end.minutes)) {
                break;
            }

            // Skip past slots
            if (slotStart > now) {
                const startLabel = formatTimeLabel(currentHour, currentMinute);
                const endLabel = formatTimeLabel(currentHour + 1, currentMinute);

                slots.push({
                    day: entry.day,
                    date: slotStart.toISOString().split('T')[0],
                    startTime: slotStart,
                    endTime: slotEnd,
                    label: `${entry.day} ${slotStart.toLocaleDateString('en-IN')} — ${startLabel} to ${endLabel}`,
                });
            }

            currentHour++;
        }
    }

    return slots;
}

/**
 * Formats hours/minutes into 12-hour format label
 */
function formatTimeLabel(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Removes already booked slots by checking against calendar events
 * 
 * @param {Array<Object>} slots - Generated time slots
 * @param {Array<Object>} calendarEvents - Events from Google Calendar
 * @returns {Array<Object>} - Available (unbooked) slots
 */
export function removeBookedSlots(slots, calendarEvents) {
    return slots.filter(slot => {
        // Check if any calendar event overlaps this slot
        const isBooked = calendarEvents.some(event => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);

            // Overlap: event starts before slot ends AND event ends after slot starts
            return eventStart < slot.endTime && eventEnd > slot.startTime;
        });

        return !isBooked;
    });
}

/**
 * Formats available slots as a plain-text table for email reply
 * 
 * @param {Array<Object>} slots - Available time slots
 * @param {string} doctorName - Doctor name
 * @returns {string} - Formatted text table
 */
export function formatAvailabilityTable(slots, doctorName) {
    if (!slots || slots.length === 0) {
        return `Sorry, ${doctorName} has no available slots for this week. Please check back next week or contact us for alternative arrangements.`;
    }

    let table = `Available Appointment Slots for ${doctorName} (This Week)\n`;
    table += '═'.repeat(60) + '\n\n';

    // Group by day
    const groupedByDay = {};
    for (const slot of slots) {
        if (!groupedByDay[slot.day]) {
            groupedByDay[slot.day] = [];
        }
        groupedByDay[slot.day].push(slot);
    }

    for (const [day, daySlots] of Object.entries(groupedByDay)) {
        const dateStr = daySlots[0].date;
        table += `📅 ${day} (${dateStr})\n`;
        table += '─'.repeat(40) + '\n';

        for (const slot of daySlots) {
            const startLabel = formatTimeLabel(slot.startTime.getHours(), slot.startTime.getMinutes());
            const endLabel = formatTimeLabel(slot.endTime.getHours(), slot.endTime.getMinutes());
            table += `   🕐 ${startLabel} - ${endLabel}\n`;
        }

        table += '\n';
    }

    table += '═'.repeat(60) + '\n';
    table += 'To book an appointment, please reply with your preferred date and time.\n';

    return table;
}

/**
 * Finds a matching available slot from a requested day/time
 * 
 * @param {Array<Object>} availableSlots - Available slots
 * @param {string} requestedDay - Day name (e.g., "Monday") or date string
 * @param {string} requestedTime - Time string (e.g., "10:00 AM")
 * @returns {Object|null} - Matching slot or null
 */
export function findMatchingSlot(availableSlots, requestedDay, requestedTime) {
    const requestedParsed = parseTime(requestedTime);

    return availableSlots.find(slot => {
        // Match by day name or date
        const dayMatch = slot.day.toLowerCase() === requestedDay.toLowerCase() ||
            slot.date === requestedDay;

        // Match by start hour
        const timeMatch = slot.startTime.getHours() === requestedParsed.hours &&
            slot.startTime.getMinutes() === requestedParsed.minutes;

        return dayMatch && timeMatch;
    }) || null;
}

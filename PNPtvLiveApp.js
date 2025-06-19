const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Environment variables
const WEBEX_ACCESS_TOKEN = process.env.WEBEX_ACCESS_TOKEN;
const PERSONAL_ROOM_URL = process.env.PERSONAL_ROOM_URL;
const ROOM_TITLE = process.env.ROOM_TITLE || 'My Personal Room';

// WebEx API configuration
const webexAPI = axios.create({
  baseURL: 'https://webexapis.com/v1',
  headers: {
    'Authorization': `Bearer ${WEBEX_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Home route - Dashboard
app.get('/', async (req, res) => {
  try {
    const roomStatus = await getRoomStatus();
    const meetings = await getUpcomingMeetings();

    res.render('dashboard', {
      roomTitle: ROOM_TITLE,
      personalRoomUrl: PERSONAL_ROOM_URL,
      roomStatus,
      meetings,
      timestamp: new Date().toLocaleString()
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.render('dashboard', {
      roomTitle: ROOM_TITLE,
      personalRoomUrl: PERSONAL_ROOM_URL,
      roomStatus: { active: false, error: 'Failed to get room status' },
      meetings: [],
      timestamp: new Date().toLocaleString()
    });
  }
});

// API: Get room status
app.get('/api/room-status', async (req, res) => {
  try {
    const status = await getRoomStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to get room status' });
  }
});

// API: Send invitation
app.post('/api/invite', async (req, res) => {
  try {
    const { email, message } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    await webexAPI.post('/messages', {
      toPersonEmail: email,
      text: `Hello! Join my WebEx personal room: ${PERSONAL_ROOM_URL}\n\n${message || 'See you there!'}`
    });

    res.json({ success: true, message: 'Invitation sent successfully' });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ success: false, error: 'Failed to send invitation' });
  }
});

// API: Schedule meeting
app.post('/api/schedule-meeting', async (req, res) => {
  try {
    const { title, start, duration, invitees } = req.body;
    if (!start || !duration) {
      return res.status(400).json({ success: false, error: 'Start time and duration are required' });
    }

    const endTime = new Date(new Date(start).getTime() + duration * 60000).toISOString();
    const inviteeList = invitees
      ? invitees.split(',').map(email => ({ email: email.trim() })).filter(e => e.email)
      : [];

    const meeting = await webexAPI.post('/meetings', {
      title: title || 'Personal Room Meeting',
      start,
      end: endTime,
      invitees: inviteeList,
      personalRoomId: 'personal_room'
    });

    res.json({ success: true, meeting: meeting.data });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule meeting' });
  }
});

// Helper: Get room status
async function getRoomStatus() {
  try {
    // Get current user info (to check personal room)
    await webexAPI.get('/people/me');

    // Get active meetings
    const meetings = await webexAPI.get('/meetings', {
      params: { current: true, max: 10 }
    });

    const activeMeetings = meetings.data.items.filter(
      meeting => meeting.state === 'active' || meeting.state === 'lobby'
    );

    return {
      active: activeMeetings.length > 0,
      participantCount: activeMeetings.reduce(
        (total, meeting) => total + (meeting.participants?.length || 0), 0
      ),
      meetings: activeMeetings.map(meeting => ({
        title: meeting.title,
        startTime: meeting.start,
        participants: meeting.participants?.length || 0
      }))
    };
  } catch (error) {
    console.error('Error getting room status:', error);
    return { active: false, error: error.message || 'Unknown error' };
  }
}

// Helper: Get upcoming meetings
async function getUpcomingMeetings() {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const meetings = await webexAPI.get('/meetings', {
      params: {
        from: now.toISOString(),
        to: tomorrow.toISOString(),
        max: 10
      }
    });

    return meetings.data.items.map(meeting => ({
      id: meeting.id,
      title: meeting.title,
      start: meeting.start,
      duration: Math.round((new Date(meeting.end) - new Date(meeting.start)) / 60000),
      joinUrl: meeting.webLink
    }));
  } catch (error) {
    console.error('Error getting upcoming meetings:', error);
    return [];
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WebEx Dashboard running on port ${PORT}`);
  console.log(`🔗 Personal room: ${PERSONAL_ROOM_URL}`);
});
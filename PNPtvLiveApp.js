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

// Variables de entorno necesarias
const WEBEX_ACCESS_TOKEN = process.env.WEBEX_ACCESS_TOKEN;
const PERSONAL_ROOM_URL = process.env.PERSONAL_ROOM_URL;
const ROOM_TITLE = process.env.ROOM_TITLE || 'Mi Sala Personal';

// Configuración de WebEx API
const webexAPI = axios.create({
  baseURL: 'https://webexapis.com/v1',
  headers: {
    'Authorization': `Bearer ${WEBEX_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Ruta principal - Dashboard
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
      roomStatus: { active: false, error: 'Error al obtener estado' },
      meetings: [],
      timestamp: new Date().toLocaleString()
    });
  }
});

// API para obtener estado de la sala
app.get('/api/room-status', async (req, res) => {
  try {
    const status = await getRoomStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API para enviar invitación
app.post('/api/invite', async (req, res) => {
  try {
    const { email, message } = req.body;
    
    const invitation = await webexAPI.post('/messages', {
      toPersonEmail: email,
      text: `¡Hola! Te invito a unirte a mi sala personal de WebEx: ${PERSONAL_ROOM_URL}\n\n${message || 'Nos vemos ahí!'}`
    });
    
    res.json({ success: true, message: 'Invitación enviada correctamente' });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ success: false, error: 'Error al enviar invitación' });
  }
});

// API para crear reunión programada
app.post('/api/schedule-meeting', async (req, res) => {
  try {
    const { title, start, duration, invitees } = req.body;
    
    const meeting = await webexAPI.post('/meetings', {
      title: title || 'Reunión en Sala Personal',
      start,
      end: new Date(new Date(start).getTime() + duration * 60000).toISOString(),
      invitees: invitees ? invitees.split(',').map(email => ({ email: email.trim() })) : [],
      personalRoomId: 'personal_room'
    });
    
    res.json({ success: true, meeting: meeting.data });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    res.status(500).json({ success: false, error: 'Error al programar reunión' });
  }
});

// Funciones auxiliares
async function getRoomStatus() {
  try {
    // Obtener información del usuario para verificar sala personal
    const user = await webexAPI.get('/people/me');
    
    // Obtener reuniones activas
    const meetings = await webexAPI.get('/meetings', {
      params: {
        current: true,
        max: 10
      }
    });
    
    const activeMeetings = meetings.data.items.filter(meeting => 
      meeting.state === 'active' || meeting.state === 'lobby'
    );
    
    return {
      active: activeMeetings.length > 0,
      participantCount: activeMeetings.reduce((total, meeting) => 
        total + (meeting.participants?.length || 0), 0),
      meetings: activeMeetings.map(meeting => ({
        title: meeting.title,
        startTime: meeting.start,
        participants: meeting.participants?.length || 0
      }))
    };
  } catch (error) {
    console.error('Error getting room status:', error);
    return { active: false, error: error.message };
  }
}

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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 WebEx Dashboard corriendo en puerto ${PORT}`);
  console.log(`🔗 Sala personal: ${PERSONAL_ROOM_URL}`);
});

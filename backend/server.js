const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --- CONFIGURATION ---

// CORS Configuration for both Express (HTTP) and Socket.IO
app.use(cors({
  origin: "*", // For production, restrict this to your frontend's URL
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

const io = socketIo(server, {
  cors: {
    origin: "*", // For production, restrict this to your frontend's URL
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


// --- DATABASE CONNECTION ---

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas successfully');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });


// --- API ROUTES ---

// Import other routes
const roomRoutes = require('./routes/rooms');
app.use('/api/rooms', roomRoutes);

// FIXED: Removed the first, duplicate /api/execute endpoint.
// This is the single, improved version, placed in the correct order.
app.post('/api/execute', async (req, res) => {
  const { source_code, language_id, stdin } = req.body;

  if (!source_code || !language_id) {
    return res.status(400).json({
      success: false,
      message: 'Code and language_id are required'
    });
  }

  try {
    const submissionData = {
      language_id: parseInt(language_id),
      // Judge0 expects source_code and stdin to be base64 encoded for reliability
      source_code:code,
      stdin: stdinl,
    };

    // Submit to Judge0
    const submitResponse = await axios.post('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=false', submissionData, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
      }
    });

    const token = submitResponse.data.token;
    if (!token) {
      throw new Error("Failed to get submission token from Judge0");
    }

    // Poll for result
    let result;
    let attempts = 0;
    const maxAttempts = 15;
    const pollDelay = 1500;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollDelay));

      const resultResponse = await axios.get(`https://judge0-ce.p.rapidapi.com/submissions/${token}?base64_encoded=true&fields=*`, {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
        }
      });

      result = resultResponse.data;
      // Status codes: 1=In Queue, 2=Processing. Anything > 2 is a final state.
      if (result.status.id > 2) {
        break;
      }
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(408).json({
        success: false,
        message: 'Code execution timed out.'
      });
    }
    
    // Decode base64 outputs from Judge0
    const decodedResult = {
      stdout: result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf8') : null,
      stderr: result.stderr ? Buffer.from(result.stderr, 'base64').toString('utf8') : null,
      compile_output: result.compile_output ? Buffer.from(result.compile_output, 'base64').toString('utf8') : null,
      status: result.status,
      time: result.time,
      memory: result.memory
    };

    res.json({
      success: true,
      result: decodedResult
    });

  } catch (error) {
    console.error('Code execution error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to execute code.',
      error: error.response?.data || error.message
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});


// --- SOCKET.IO LOGIC ---

// NOTE: This is in-memory state. It will be lost on server restart.
// For production, this should be replaced with a distributed store like Redis.
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    socket.userName = userName;
    socket.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        code: '// Welcome to CodeSync!',
        language: 63, // Default to JavaScript
        users: new Map(),
        createdAt: new Date()
      });
    }

    const room = rooms.get(roomId);
    const userColor = generateUserColor(userName);
    const isCreator = room.users.size === 0; // First user is the creator
    socket.isCreator = isCreator;
    
    room.users.set(socket.id, { id: socket.id, name: userName, color: userColor, isCreator });

    // Send current state to the new user
    socket.emit('room-state', {
      code: room.code,
      language: room.language,
      users: Array.from(room.users.values())
    });

    // Notify others
    socket.to(roomId).emit('user-joined', {
      user: { id: socket.id, name: userName, color: userColor, isCreator },
      users: Array.from(room.users.values())
    });
  });

  socket.on('code-change', ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
      socket.to(roomId).emit('code-update', { code });
    }
  });

  socket.on('language-change', ({ roomId, language }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).language = language;
      socket.to(roomId).emit('language-update', { language });
    }
  });

  socket.on('close-room', ({ roomId }) => {
    if (socket.isCreator && rooms.has(roomId)) {
      io.to(roomId).emit('room-closed', { message: 'The host has closed the room.' });
      rooms.delete(roomId);
      console.log(`Room ${roomId} closed by creator ${socket.userName}`);
    }
  });

  // Disconnect logic to handle users leaving
  const handleDisconnect = () => {
    if (socket.roomId && rooms.has(socket.roomId)) {
        const room = rooms.get(socket.roomId);
        room.users.delete(socket.id);

        if (room.users.size === 0) {
            rooms.delete(socket.roomId);
            console.log(`Room ${socket.roomId} is now empty and has been deleted.`);
        } else {
            // If the creator leaves, you might want to assign a new one
            // Or simply notify others
            socket.to(socket.roomId).emit('user-left', {
                userId: socket.id,
                userName: socket.userName,
                users: Array.from(room.users.values())
            });
        }
    }
    console.log(`User disconnected: ${socket.id}`);
  };

  socket.on('disconnect', handleDisconnect);
  socket.on('leave-room', handleDisconnect);

  // WebRTC Signaling
  socket.on('webrtc-offer', (payload) => socket.to(payload.to).emit('webrtc-offer', { offer: payload.offer, from: socket.id }));
  socket.on('webrtc-answer', (payload) => socket.to(payload.to).emit('webrtc-answer', { answer: payload.answer, from: socket.id }));
  socket.on('webrtc-ice-candidate', (payload) => socket.to(payload.to).emit('webrtc-ice-candidate', { candidate: payload.candidate, from: socket.id }));
});

function generateUserColor(userName) {
  // ... (unchanged)
}

// Cleanup inactive rooms periodically
setInterval(() => {
  // ... (unchanged)
}, 60 * 60 * 1000);


// --- SERVER INITIALIZATION ---

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
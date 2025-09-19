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

// FIXED: Properly encode source_code and stdin to base64
app.post('/api/execute', async (req, res) => {
  const { source_code, language_id, stdin } = req.body;
   
  if (!source_code || !language_id) {
    return res.status(400).json({
      success: false,
      message: 'Code and language_id are required'
    });
  }

  try {
    // Ensure source_code is properly encoded as UTF-8, then base64
    const sourceCodeBuffer = Buffer.from(source_code, 'utf8');
    const stdinBuffer = stdin ? Buffer.from(stdin, 'utf8') : Buffer.from('', 'utf8');

    const submissionData = {
      language_id: parseInt(language_id),
      // Judge0 expects source_code and stdin to be base64 encoded for reliability
      source_code: sourceCodeBuffer.toString('base64'),
      stdin: stdinBuffer.toString('base64'),
    };

    console.log('Submitting to Judge0:', {
      language_id: submissionData.language_id,
      source_code_length: submissionData.source_code.length,
      stdin_length: submissionData.stdin.length
    });

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

    console.log('Got submission token:', token);

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
      console.log('Polling attempt', attempts + 1, 'Status:', result.status.description);
      
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

    console.log('Execution completed:', {
      status: decodedResult.status.description,
      hasStdout: !!decodedResult.stdout,
      hasStderr: !!decodedResult.stderr,
      time: decodedResult.time,
      memory: decodedResult.memory
    });

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

// FIXED: Track voice chat participants per room
const voiceChatParticipants = new Map(); // roomId -> Set of {socketId, userName}

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
      users: Array.from(room.users.values()).map(user => ({
        ...user,
        isCurrentUser: user.id === socket.id
      }))
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
      io.to(roomId).emit('room-closed', { 
        message: 'The room has been closed', 
        closedBy: socket.userName 
      });
      rooms.delete(roomId);
      console.log(`Room ${roomId} closed by creator ${socket.userName}`);
    }
  });

  // FIXED: Enhanced voice chat join handler
  socket.on('join-voice-chat', ({ roomId, userName }) => {
    console.log(`${userName} joined voice chat in room ${roomId}`);
    
    // Initialize room voice participants if not exists
    if (!voiceChatParticipants.has(roomId)) {
      voiceChatParticipants.set(roomId, new Set());
    }
    
    const roomParticipants = voiceChatParticipants.get(roomId);
    
    // Get existing participants (exclude the joining user)
    const existingParticipants = Array.from(roomParticipants)
      .filter(p => p.socketId !== socket.id)
      .map(p => ({ userId: p.socketId, userName: p.userName }));
    
    // Send existing participants to the new user
    socket.emit('voice-chat-participants', {
      participants: existingParticipants
    });
    
    // Add new user to participants
    roomParticipants.add({ socketId: socket.id, userName: userName });
    
    // Notify other users in the room that this user joined voice chat
    socket.to(roomId).emit('user-joined-voice', {
      userId: socket.id,
      userName: userName
    });
    
    console.log(`Voice chat participants in ${roomId}:`, roomParticipants.size);
  });

  socket.on('leave-voice-chat', ({ roomId, userName }) => {
    console.log(`${userName} left voice chat in room ${roomId}`);
    
    if (voiceChatParticipants.has(roomId)) {
      const roomParticipants = voiceChatParticipants.get(roomId);
      roomParticipants.forEach(p => {
        if (p.socketId === socket.id) {
          roomParticipants.delete(p);
        }
      });
      
      // Clean up empty rooms
      if (roomParticipants.size === 0) {
        voiceChatParticipants.delete(roomId);
      }
    }
    
    // Notify other users in the room that this user left voice chat
    socket.to(roomId).emit('user-left-voice', {
      userId: socket.id,
      userName: userName
    });
  });

  // WebRTC Signaling Handlers
  socket.on('webrtc-offer', ({ roomId, offer, to, fromUser }) => {
    console.log(`WebRTC offer from ${fromUser} to ${to} in room ${roomId}`);
    
    // Forward the offer to the specific peer
    socket.to(to).emit('webrtc-offer', {
      offer: offer,
      from: socket.id,
      fromUser: fromUser
    });
  });

  socket.on('webrtc-answer', ({ roomId, answer, to }) => {
    console.log(`WebRTC answer to ${to} in room ${roomId}`);
    
    // Forward the answer to the specific peer
    socket.to(to).emit('webrtc-answer', {
      answer: answer,
      from: socket.id
    });
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate, to }) => {
    console.log(`ICE candidate to ${to} in room ${roomId}`);
    
    // Forward the ICE candidate to the specific peer
    socket.to(to).emit('webrtc-ice-candidate', {
      candidate: candidate,
      from: socket.id
    });
  });

  // FIXED: Enhanced disconnect handler
  const handleDisconnect = () => {
    console.log(`User ${socket.id} disconnected`);
    
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.users.delete(socket.id);

      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
        console.log(`Room ${socket.roomId} is now empty and has been deleted.`);
      } else {
        // Notify others that user left
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.id,
          userName: socket.userName,
          users: Array.from(room.users.values())
        });
      }
    }

    // FIXED: Clean up voice chat participants
    voiceChatParticipants.forEach((participants, roomId) => {
      participants.forEach(p => {
        if (p.socketId === socket.id) {
          participants.delete(p);
          // Notify voice chat participants about disconnection
          socket.to(roomId).emit('user-left-voice', {
            userId: socket.id,
            userName: socket.userName || 'Unknown User'
          });
        }
      });
      
      // Clean up empty rooms
      if (participants.size === 0) {
        voiceChatParticipants.delete(roomId);
      }
    });
  };

  socket.on('disconnect', handleDisconnect);
  socket.on('leave-room', handleDisconnect);
});

function generateUserColor(userName) {
  // Simple hash function to generate consistent colors for users
  let hash = 0;
  for (let i = 0; i < userName.length; i++) {
    hash = userName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate HSL color with good saturation and lightness
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

// Cleanup inactive rooms periodically
setInterval(() => {
  const now = new Date();
  const roomsToDelete = [];
  
  rooms.forEach((room, roomId) => {
    // Delete rooms older than 24 hours with no users
    if (room.users.size === 0 && (now - room.createdAt) > 24 * 60 * 60 * 1000) {
      roomsToDelete.push(roomId);
    }
  });
  
  roomsToDelete.forEach(roomId => {
    rooms.delete(roomId);
    console.log(`Cleaned up inactive room: ${roomId}`);
  });
}, 60 * 60 * 1000); // Run every hour


// In your socket connection handler (usually in server.js or similar)
io.on('connection', (socket) => {
  // ... your existing handlers ...

  // Whiteboard drawing event
  socket.on('whiteboard-draw', (data) => {
    const { roomId, x, y, prevX, prevY, color, size } = data;
    
    // Broadcast the drawing data to all other users in the room
    socket.to(roomId).emit('whiteboard-draw', {
      x,
      y,
      prevX,
      prevY,
      color,
      size
    });
  });

  // Whiteboard clear event
  socket.on('whiteboard-clear', (data) => {
    const { roomId } = data;
    
    // Broadcast the clear command to all other users in the room
    socket.to(roomId).emit('whiteboard-clear');
  });

  // ... rest of your existing handlers ...
});

// --- SERVER INITIALIZATION ---

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
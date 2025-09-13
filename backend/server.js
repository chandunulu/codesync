const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS Configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://c0desync.netlify.app/",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "https://c0desync.netlify.app/",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB Atlas successfully');
  console.log('Database:', mongoose.connection.db.databaseName);
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Import routes
const roomRoutes = require('./routes/rooms');
app.use('/api/rooms', roomRoutes);

// Code execution endpoint
app.post('/api/execute', async (req, res) => {
  const { source_code, language_id, stdin } = req.body;
    console.log(source_code, language_id, stdin)
  if (!source_code || !language_id) {
    return res.status(400).json({
      success: false,
      message: 'Code and language_id are required'
    });
  }
     const code=source_code
  try {
    // Submit to Judge0
    const submitResponse = await axios.post('https://judge0-ce.p.rapidapi.com/submissions', {
      source_code: code,
      language_id: parseInt(language_id),
      stdin: stdin ? Buffer.from(stdin).toString('base64') : '',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
      }
    });
    console.log(submitResponse)
    const token = submitResponse.data.token;

    // Poll for result with better error handling
    let result;
    let attempts = 0;
    const maxAttempts = 15; // Increased attempts

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay
      
      try {
        const resultResponse = await axios.get(`https://judge0-ce.p.rapidapi.com/submissions/${token}`, {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
          }
        });

        result = resultResponse.data;
        
        if (result.status.id > 2) break;
        attempts++;
      } catch (pollError) {
        console.error('Polling error:', pollError);
        attempts++;
        if (attempts >= maxAttempts) throw pollError;
      }
    }

    if (attempts >= maxAttempts) {
      return res.json({
        success: false,
        message: 'Code execution timeout'
      });
    }

    // Decode outputs
    const decodedResult = {
      stdout: result.stdout ,
      stderr: result.stderr,
      compile_output: result.compile_output,
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
      message: 'Failed to execute code',
      error: error.response?.data || error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Socket.IO connection handling
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, userName, isCreator }) => {
    // Leave any previous rooms
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }

    socket.join(roomId);
    socket.userName = userName;
    socket.roomId = roomId;
    socket.isCreator = isCreator;
    socket.currentRoom = roomId;

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        code: '// Welcome to CodeSync!\n// Start coding together!\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();',
        language: 63,
        users: new Map(),
        createdAt: new Date()
      });
    }

    const room = rooms.get(roomId);
    const userColor = generateUserColor(userName);
    
    // Add user to room
    room.users.set(socket.id, {
      id: socket.id,
      name: userName,
      color: userColor,
      isCreator: isCreator,
      joinedAt: new Date()
    });

    // Send current room state to the joining user
    socket.emit('room-state', {
      code: room.code,
      language: room.language,
      users: Array.from(room.users.values()).map(u => ({
        ...u,
        isCurrentUser: u.id === socket.id
      }))
    });

    // Notify others about the new user (but not the user themselves)
    socket.to(roomId).emit('user-joined', {
      user: { 
        id: socket.id, 
        name: userName, 
        color: userColor, 
        isCreator: isCreator 
      },
      users: Array.from(room.users.values()).map(u => ({
        ...u,
        isCurrentUser: false // For other users, none is current user
      }))
    });

    console.log(`${userName} joined room ${roomId}. Total users: ${room.users.size}`);
  });

  socket.on('code-change', ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
      // Only broadcast to others, not back to sender
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
      socket.to(roomId).emit('room-closed', {
        message: 'Room has been closed',
        closedBy: socket.userName
      });
      rooms.delete(roomId);
      console.log(`Room ${roomId} closed by ${socket.userName}`);
    }
  });

  // WebRTC signaling handlers
  socket.on('webrtc-offer', ({ roomId, offer, to }) => {
    console.log(`Relaying offer from ${socket.id} to ${to}`);
    socket.to(to).emit('webrtc-offer', {
      offer,
      from: socket.id,
      fromUser: socket.userName
    });
  });

  socket.on('webrtc-answer', ({ roomId, answer, to }) => {
    console.log(`Relaying answer from ${socket.id} to ${to}`);
    socket.to(to).emit('webrtc-answer', {
      answer,
      from: socket.id
    });
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate, to }) => {
    console.log(`Relaying ICE candidate from ${socket.id} to ${to}`);
    socket.to(to).emit('webrtc-ice-candidate', {
      candidate,
      from: socket.id
    });
  });

  socket.on('disconnect', () => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.users.delete(socket.id);

      // Notify others about user leaving
      socket.to(socket.roomId).emit('user-left', {
        userId: socket.id,
        userName: socket.userName,
        users: Array.from(room.users.values()).map(u => ({
          ...u,
          isCurrentUser: false
        }))
      });

      // Clean up empty rooms
      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
        console.log(`Room ${socket.roomId} deleted - no users left`);
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });

  // Handle explicit leave room
  socket.on('leave-room', ({ roomId }) => {
    if (socket.roomId === roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users.delete(socket.id);
      
      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        userName: socket.userName,
        users: Array.from(room.users.values()).map(u => ({
          ...u,
          isCurrentUser: false
        }))
      });
      
      socket.leave(roomId);
      socket.roomId = null;
      socket.currentRoom = null;
      
      if (room.users.size === 0) {
        rooms.delete(roomId);
      }
    }
  });
});

function generateUserColor(userName) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
    '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD',
    '#00D2D3', '#FF9F43', '#C44569', '#F8B500'
  ];
  
  let hash = 0;
  for (let i = 0; i < userName.length; i++) {
    hash = userName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

// Cleanup inactive rooms periodically
setInterval(() => {
  const now = Date.now();
  const ROOM_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  
  rooms.forEach((room, roomId) => {
    if (room.users.size === 0 && (now - room.createdAt.getTime()) > ROOM_TIMEOUT) {
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  });
}, 60 * 60 * 1000); // Run every hour

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`Port ${PORT} in use, trying another port...`);
    const newPort = Math.floor(Math.random() * 1000) + 5001;
    server.listen(newPort, () => {
      console.log(`Server running on fallback port ${newPort}`);
    });
  } else {
    console.error('Server error:', err);
  }
});

// Code execution endpoint
app.post('/api/execute', async (req, res) => {
  const { code, language_id, stdin, base64_encoded = false } = req.body;

  if (!code || !language_id) {
    return res.status(400).json({
      success: false,
      message: 'Code and language_id are required'
    });
  }

  try {
    // Prepare submission data based on base64_encoded flag
    const submissionData = {
      language_id: parseInt(language_id),
      base64_encoded: base64_encoded
    };

    // Handle code encoding
    if (base64_encoded) {
      submissionData.source_code = Buffer.from(code).toString('base64');
      submissionData.stdin = stdin ? Buffer.from(stdin).toString('base64') : '';
    } else {
      submissionData.source_code = code;
      submissionData.stdin = stdin || '';
    }

    console.log('Submitting to Judge0:', {
      language_id: submissionData.language_id,
      base64_encoded: submissionData.base64_encoded,
      code_length: code.length
    });

    // Submit to Judge0
    const submitResponse = await axios.post('https://judge0-ce.p.rapidapi.com/submissions', submissionData, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
      }
    });

    const token = submitResponse.data.token;
    console.log('Submission token:', token);

    // Poll for result with better error handling
    let result;
    let attempts = 0;
    const maxAttempts = 20; // Increased attempts
    const pollDelay = 1000; // Start with 1 second

    while (attempts < maxAttempts) {
      // Progressive delay - start fast, then slow down
      const delay = Math.min(pollDelay + (attempts * 200), 3000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        const resultResponse = await axios.get(`https://judge0-ce.p.rapidapi.com/submissions/${token}`, {
          headers: {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
          },
          params: {
            base64_encoded: base64_encoded,
            fields: '*'
          }
        });

        result = resultResponse.data;
        console.log(`Attempt ${attempts + 1}: Status ${result.status.id} (${result.status.description})`);
        
        // Status codes: 1=In Queue, 2=Processing, 3=Accepted, 4=Wrong Answer, 5=Time Limit Exceeded, etc.
        if (result.status.id > 2) break;
        attempts++;
      } catch (pollError) {
        console.error('Polling error:', pollError.response?.data || pollError.message);
        attempts++;
        if (attempts >= maxAttempts) throw pollError;
      }
    }

    if (attempts >= maxAttempts) {
      return res.json({
        success: false,
        message: 'Code execution timeout - the submission is taking too long to process'
      });
    }

    // Process the result based on base64_encoded flag
    let decodedResult;
    
    if (base64_encoded) {
      // Decode base64 outputs
      decodedResult = {
        stdout: result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf8') : null,
        stderr: result.stderr ? Buffer.from(result.stderr, 'base64').toString('utf8') : null,
        compile_output: result.compile_output ? Buffer.from(result.compile_output, 'base64').toString('utf8') : null,
        status: result.status,
        time: result.time,
        memory: result.memory,
        exit_code: result.exit_code
      };
    } else {
      // Use results as-is for non-base64 mode
      decodedResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        compile_output: result.compile_output,
        status: result.status,
        time: result.time,
        memory: result.memory,
        exit_code: result.exit_code
      };
    }

    // Clean up null values and provide better error messages
    const finalResult = {
      ...decodedResult,
      stdout: decodedResult.stdout || '',
      stderr: decodedResult.stderr || '',
      compile_output: decodedResult.compile_output || ''
    };

    console.log('Execution completed:', {
      status: finalResult.status.description,
      time: finalResult.time,
      memory: finalResult.memory,
      hasOutput: !!finalResult.stdout,
      hasErrors: !!finalResult.stderr
    });

    res.json({
      success: true,
      result: finalResult
    });

  } catch (error) {
    console.error('Code execution error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to execute code';
    
    if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed. Please check API configuration.';
    } else if (error.response?.status >= 500) {
      errorMessage = 'Judge0 service is temporarily unavailable.';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to code execution service.';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
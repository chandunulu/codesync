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

// Code execution endpoint
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

// Health check endpoint
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

// Track voice chat participants per room
const voiceChatParticipants = new Map(); // roomId -> Set of {socketId, userName}
const connectionTimeouts = new Map(); // Track connection timeouts
const MAX_RECONNECTION_TIME = 30000; // 30 seconds

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Room management events
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

    console.log(`${userName} joined room ${roomId}`);
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

  // Updated close-room handler with proper creator check
  socket.on('close-room', ({ roomId }) => {
    if (socket.isCreator && rooms.has(roomId)) {
      io.to(roomId).emit('room-closed', { 
        message: 'The room has been closed', 
        closedBy: socket.userName 
      });
      rooms.delete(roomId);
      
      // Clean up voice chat participants for this room
      if (voiceChatParticipants.has(roomId)) {
        voiceChatParticipants.delete(roomId);
      }
      
      console.log(`Room ${roomId} closed by creator ${socket.userName}`);
    }
  });

  // NEW: Remove user event handler (creator only)
  socket.on('remove-user', ({ roomId, userName }) => {
    if (!socket.isCreator || !rooms.has(roomId)) {
      socket.emit('error-message', { message: 'Not authorized to remove users' });
      return;
    }

    const room = rooms.get(roomId);
    let userToRemove = null;
    let socketToRemove = null;

    // Find the user to remove
    for (const [socketId, user] of room.users) {
      if (user.name === userName && !user.isCreator) {
        userToRemove = user;
        socketToRemove = socketId;
        break;
      }
    }

    if (userToRemove && socketToRemove) {
      // Remove the user from room
      room.users.delete(socketToRemove);
      
      // Get the socket instance and make them leave
      const targetSocket = io.sockets.sockets.get(socketToRemove);
      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.emit('removed-from-room', {
          message: 'You have been removed from the room',
          removedBy: socket.userName
        });
        
        // Clean up voice chat if they were in it
        if (voiceChatParticipants.has(roomId)) {
          const roomParticipants = voiceChatParticipants.get(roomId);
          for (const participant of roomParticipants) {
            if (participant.socketId === socketToRemove) {
              roomParticipants.delete(participant);
              break;
            }
          }
          
          // Notify voice chat participants
          socket.to(roomId).emit('user-left-voice', {
            userId: socketToRemove,
            userName: userName
          });
        }
      }

      // Notify remaining users
      socket.to(roomId).emit('user-removed', {
        userName: userName,
        users: Array.from(room.users.values())
      });

      console.log(`${userName} was removed from room ${roomId} by ${socket.userName}`);
    } else {
      socket.emit('error-message', { message: 'User not found or cannot remove creator' });
    }
  });

  // Voice chat events
  socket.on('join-voice-chat', ({ roomId, userName }) => {
    console.log(`${userName} (${socket.id}) joined voice chat in room ${roomId}`);
    
    // Clear any existing timeout for this socket
    if (connectionTimeouts.has(socket.id)) {
      clearTimeout(connectionTimeouts.get(socket.id));
      connectionTimeouts.delete(socket.id);
    }

    // Initialize room voice participants if not exists
    if (!voiceChatParticipants.has(roomId)) {
      voiceChatParticipants.set(roomId, new Set());
    }
    
    const roomParticipants = voiceChatParticipants.get(roomId);
    
    // Remove any existing entry for this socket (in case of reconnection)
    for (const participant of roomParticipants) {
      if (participant.socketId === socket.id) {
        roomParticipants.delete(participant);
        break;
      }
    }

    // Get existing participants (exclude the joining user)
    const existingParticipants = Array.from(roomParticipants)
      .filter(p => p.socketId !== socket.id)
      .map(p => ({ userId: p.socketId, userName: p.userName }));
    
    console.log(`Sending ${existingParticipants.length} existing participants to ${userName}`);
    
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
    
    console.log(`Voice chat participants in ${roomId}:`, Array.from(roomParticipants).map(p => p.userName));
  });

  socket.on('leave-voice-chat', ({ roomId, userName }) => {
    console.log(`${userName} (${socket.id}) left voice chat in room ${roomId}`);
    
    if (voiceChatParticipants.has(roomId)) {
      const roomParticipants = voiceChatParticipants.get(roomId);
      
      // Remove the user from participants
      for (const participant of roomParticipants) {
        if (participant.socketId === socket.id) {
          roomParticipants.delete(participant);
          break;
        }
      }
      
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
    console.log(`WebRTC offer from ${fromUser} (${socket.id}) to ${to} in room ${roomId}`);

    // Validate offer data
    if (!offer || typeof offer !== 'object') {
      console.error('Invalid offer data received');
      socket.emit('webrtc-error', {
        type: 'invalid-offer',
        message: 'Invalid offer data received',
        targetId: to
      });
      return;
    }
    
    // Validate that the target socket is in the same room
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket && targetSocket.rooms.has(roomId)) {
      // Forward the offer to the specific peer
      socket.to(to).emit('webrtc-offer', {
        offer: offer,
        from: socket.id,
        fromUser: fromUser
      });
      console.log(`Offer forwarded successfully to ${to}`);
    } else {
      console.error(`Target socket ${to} not found or not in room ${roomId}`);
      // Optionally notify the sender that the target is not available
      socket.emit('webrtc-error', {
        type: 'target-not-found',
        message: `Target user ${to} is not available`,
        targetId: to
      });
    }
  });

  socket.on('webrtc-answer', ({ roomId, answer, to }) => {
    console.log(`WebRTC answer from ${socket.id} to ${to} in room ${roomId}`);

    // Validate answer data
    if (!answer || typeof answer !== 'object') {
      console.error('Invalid answer data received');
      socket.emit('webrtc-error', {
        type: 'invalid-answer',
        message: 'Invalid answer data received',
        targetId: to
      });
      return;
    }
    
    // Validate that the target socket is in the same room
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket && targetSocket.rooms.has(roomId)) {
      // Forward the answer to the specific peer
      socket.to(to).emit('webrtc-answer', {
        answer: answer,
        from: socket.id
      });
      console.log(`Answer forwarded successfully to ${to}`);
    } else {
      console.error(`Target socket ${to} not found or not in room ${roomId}`);
      socket.emit('webrtc-error', {
        type: 'target-not-found',
        message: `Target user ${to} is not available`,
        targetId: to
      });
    }
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate, to }) => {
    // Validate candidate data
    if (!candidate || typeof candidate !== 'object') {
      console.error('Invalid ICE candidate data received');
      return; // ICE candidates can fail silently
    }
    
    console.log(`ICE candidate from ${socket.id} to ${to} in room ${roomId}`);
    
    // Validate that the target socket is in the same room
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket && targetSocket.rooms.has(roomId)) {
      // Forward the ICE candidate to the specific peer
      socket.to(to).emit('webrtc-ice-candidate', {
        candidate: candidate,
        from: socket.id
      });
      console.log(`ICE candidate forwarded successfully to ${to}`);
    } else {
      console.error(`Target socket ${to} not found or not in room ${roomId}`);
      // ICE candidates can fail silently as they're sent frequently
    }
  });

  // Add connection quality monitoring
  socket.on('webrtc-connection-state', ({ roomId, targetId, state }) => {
    console.log(`WebRTC connection state from ${socket.id} to ${targetId}: ${state}`);

    if (state === 'failed' || state === 'disconnected') {
      // Notify both peers about the connection failure
      socket.to(targetId).emit('webrtc-connection-failed', {
        from: socket.id,
        state: state
      });

      // Set a timeout for reconnection attempts
      const timeoutId = setTimeout(() => {
        console.log(`Connection timeout reached for ${socket.id} -> ${targetId}`);
        // Clean up the connection on both ends
        socket.emit('webrtc-cleanup-peer', { peerId: targetId });
        socket.to(targetId).emit('webrtc-cleanup-peer', { peerId: socket.id });
      }, MAX_RECONNECTION_TIME);

      connectionTimeouts.set(`${socket.id}-${targetId}`, timeoutId);
    } else if (state === 'connected') {
      // Clear any existing timeout for successful connection
      const timeoutKey = `${socket.id}-${targetId}`;
      if (connectionTimeouts.has(timeoutKey)) {
        clearTimeout(connectionTimeouts.get(timeoutKey));
        connectionTimeouts.delete(timeoutKey);
      }
    }
  });

  // Whiteboard events
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

  socket.on('whiteboard-clear', (data) => {
    const { roomId } = data;
    
    // Broadcast the clear command to all other users in the room
    socket.to(roomId).emit('whiteboard-clear');
  });

  // Chat events (if you have chat functionality)
  socket.on('chat-message', ({ roomId, message, userName }) => {
    const messageData = {
      id: Date.now(),
      message,
      userName,
      timestamp: new Date().toISOString(),
      userId: socket.id
    };
    
    // Broadcast message to all users in the room (including sender for confirmation)
    io.to(roomId).emit('chat-message', messageData);
    console.log(`Chat message in room ${roomId} from ${userName}: ${message}`);
  });

  // Cursor sharing events (if you have cursor sharing)
  socket.on('cursor-move', ({ roomId, x, y, userName }) => {
    socket.to(roomId).emit('cursor-move', {
      x,
      y,
      userName,
      userId: socket.id
    });
  });

  // File sharing events (if you have file sharing)
  socket.on('file-share', ({ roomId, fileName, fileData, fileType, userName }) => {
    const fileShareData = {
      id: Date.now(),
      fileName,
      fileData,
      fileType,
      userName,
      userId: socket.id,
      timestamp: new Date().toISOString()
    };
    
    socket.to(roomId).emit('file-shared', fileShareData);
    console.log(`File shared in room ${roomId} by ${userName}: ${fileName}`);
  });

  // UPDATED: Enhanced disconnect handler with creator transfer
  const handleDisconnect = (reason) => {
    console.log(`User ${socket.id} (${socket.userName}) disconnected. Reason: ${reason || 'unknown'}`);

    // Clear any connection timeouts for this socket
    connectionTimeouts.forEach((timeout, key) => {
      if (key.includes(socket.id)) {
        clearTimeout(timeout);
        connectionTimeouts.delete(key);
      }
    });
    
    // Handle regular room cleanup
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      const wasCreator = socket.isCreator;
      
      room.users.delete(socket.id);

      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
        console.log(`Room ${socket.roomId} is now empty and has been deleted.`);
      } else {
        // Handle creator transfer if the disconnected user was the creator
        if (wasCreator && room.users.size > 0) {
          // Find the user who joined earliest (first in the map) to promote
          const remainingUsers = Array.from(room.users.values());
          const newCreator = remainingUsers[0];
          newCreator.isCreator = true;
          
          // Update the socket instance
          const newCreatorSocket = io.sockets.sockets.get(newCreator.id);
          if (newCreatorSocket) {
            newCreatorSocket.isCreator = true;
          }
          
          console.log(`Promoted ${newCreator.name} to room creator in room ${socket.roomId}`);
          
          // Notify all users about the new creator
          io.to(socket.roomId).emit('creator-changed', {
            newCreator: newCreator.name,
            message: `${newCreator.name} is now the room creator`,
            users: remainingUsers
          });
        }

        // Notify others that user left
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.id,
          userName: socket.userName,
          users: Array.from(room.users.values())
        });
      }
    }

    // Clean up voice chat participants
    voiceChatParticipants.forEach((participants, roomId) => {
      const participantToRemove = Array.from(participants).find(p => p.socketId === socket.id);
      if (participantToRemove) {
        participants.delete(participantToRemove);
        
        // Notify voice chat participants about disconnection
        socket.to(roomId).emit('user-left-voice', {
          userId: socket.id,
          userName: socket.userName || 'Unknown User'
        });
        
        console.log(`Removed ${socket.userName} from voice chat in room ${roomId}`);
      }
      
      // Clean up empty voice chat rooms
      if (participants.size === 0) {
        voiceChatParticipants.delete(roomId);
        console.log(`Cleaned up empty voice chat room: ${roomId}`);
      }
    });
  };

  socket.on('disconnect', handleDisconnect);
  socket.on('leave-room', () => handleDisconnect('leave-room'));

  // Handle connection errors
  if (socket.roomId) {
    socket.to(socket.roomId).emit('user-left-voice', {
      userId: socket.id,
      userName: socket.userName || 'Unknown User'
    });
  }
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Utility functions
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

// Periodic cleanup tasks
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
    // Also clean up any orphaned voice chat participants
    if (voiceChatParticipants.has(roomId)) {
      voiceChatParticipants.delete(roomId);
    }
    console.log(`Cleaned up inactive room: ${roomId}`);
  });
  
  // Log current stats
  console.log(`Active rooms: ${rooms.size}, Voice chat rooms: ${voiceChatParticipants.size}`);
}, 60 * 60 * 1000); // Run every hour

// Log server statistics every 5 minutes
setInterval(() => {
  const connectedSockets = io.sockets.sockets.size;
  const activeRooms = rooms.size;
  const voiceChatRooms = voiceChatParticipants.size;
  
  console.log(`📊 Server Stats - Connected: ${connectedSockets}, Rooms: ${activeRooms}, Voice Chats: ${voiceChatRooms}`);
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  
  // Notify all connected clients about server shutdown
  io.emit('server-shutdown', {
    message: 'Server is shutting down for maintenance',
    timestamp: new Date().toISOString()
  });
  
  // Close all connections
  io.close(() => {
    console.log('👋 All connections closed');
    
    // Close database connection
    mongoose.connection.close(() => {
      console.log('📦 Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// --- SERVER INITIALIZATION ---

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log(`🔧 CORS enabled for all origins (configure for production)`);
});
const express = require('express');
const Room = require('../models/Room');
const router = express.Router();

const validateRoomInput = (req, res, next) => {
  const { roomID } = req.body;
  
  if (!roomID || typeof roomID !== 'string' || roomID.trim().length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Room ID is required and must be a non-empty string" 
    });
  }
  
  req.body.roomID = roomID.trim().toUpperCase();
  next();
};

router.post('/create-room', validateRoomInput, async (req, res) => {
  const { roomID, creator, name } = req.body;
  
  try {
    if (!creator || typeof creator !== 'string' || creator.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Creator name is required and must be a non-empty string" 
      });
    }

    const existing = await Room.findOne({ roomID });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: "Room ID already exists. Please choose a different ID." 
      });
    }

    const newRoom = new Room({ 
      roomID, 
      creator: creator.trim(),
      name: name ? name.trim() : `${creator.trim()}'s Room`,
      participants: [creator.trim()],
      isActive: true
    });
    
    await newRoom.save();

    res.status(201).json({ 
      success: true, 
      message: "Room created successfully",
      data: {
        roomID: newRoom.roomID,
        creator: newRoom.creator,
        name: newRoom.name,
        createdAt: newRoom.createdAt
      }
    });
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create room. Please try again." 
    });
  }
});

router.get('/check-room/:roomID', async (req, res) => {
  const { roomID } = req.params;
  
  try {
    if (!roomID || roomID.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Room ID is required" 
      });
    }

    const room = await Room.findOne({ 
      roomID: roomID.trim().toUpperCase(),
      isActive: true 
    });
    
    if (room) {
      res.json({ 
        success: true,
        data: {
          roomID: room.roomID,
          creator: room.creator,
          name: room.name,
          participantCount: room.participants.length,
          exists: true,
          isActive: room.isActive
        }
      });
    } else {
      res.status(404).json({ 
        success: false, 
        message: "Room not found or inactive",
        data: { exists: false }
      });
    }
  } catch (err) {
    console.error("Error checking room:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error checking room status" 
    });
  }
});

router.post('/join-room', async (req, res) => {
  const { roomID, userName } = req.body;
  
  try {
    if (!roomID || !userName) {
      return res.status(400).json({
        success: false,
        message: "Room ID and username are required"
      });
    }

    const room = await Room.findOne({ 
      roomID: roomID.trim().toUpperCase(),
      isActive: true 
    });
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found or inactive"
      });
    }

    if (!room.participants.includes(userName.trim())) {
      room.participants.push(userName.trim());
      await room.save();
    }

    res.json({
      success: true,
      message: "Successfully joined room",
      data: {
        roomID: room.roomID,
        creator: room.creator,
        name: room.name,
        isCreator: room.creator === userName.trim()
      }
    });
  } catch (err) {
    console.error("Error joining room:", err);
    res.status(500).json({
      success: false,
      message: "Failed to join room"
    });
  }
});

router.post('/close-room', async (req, res) => {
  const { roomID, creator } = req.body;
  
  try {
    if (!roomID || !creator) {
      return res.status(400).json({
        success: false,
        message: "Room ID and creator name are required"
      });
    }

    const room = await Room.findOne({ 
      roomID: roomID.trim().toUpperCase(),
      creator: creator.trim(),
      isActive: true 
    });
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found or you're not the creator"
      });
    }

    room.isActive = false;
    await room.save();

    res.json({
      success: true,
      message: "Room closed successfully"
    });
  } catch (err) {
    console.error("Error closing room:", err);
    res.status(500).json({
      success: false,
      message: "Failed to close room"
    });
  }
});

router.get('/room/:roomID', async (req, res) => {
  const { roomID } = req.params;
  
  try {
    if (!roomID || roomID.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Room ID is required" 
      });
    }

    const room = await Room.findOne({ 
      roomID: roomID.trim().toUpperCase(),
      isActive: true 
    });
    
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: "Room not found" 
      });
    }

    res.json({ 
      success: true,
      data: room
    });
  } catch (err) {
    console.error("Error fetching room:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching room details" 
    });
  }
});

router.post('/update-activity/:roomID', async (req, res) => {
  const { roomID } = req.params;
  
  try {
    const room = await Room.findOne({ 
      roomID: roomID.trim().toUpperCase(),
      isActive: true 
    });
    
    if (room) {
      room.lastActivity = new Date();
      await room.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: "Room not found" });
    }
  } catch (err) {
    console.error("Error updating room activity:", err);
    res.status(500).json({ success: false, message: "Error updating activity" });
  }
});
module.exports = router;
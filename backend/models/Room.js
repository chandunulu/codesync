const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomID: {
    type: String,
    required: [true, 'Room ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
    minlength: [4, 'Room ID must be at least 4 characters'],
    maxlength: [12, 'Room ID must be at most 12 characters']
  },
  creator: {
    type: String,
    required: [true, 'Creator name is required'],
    trim: true,
    minlength: [2, 'Creator name must be at least 2 characters'],
    maxlength: [50, 'Creator name must be at most 50 characters']
  },
  name: {
    type: String,
    default: function() {
      return `${this.creator}'s Room`;
    },
    trim: true,
    maxlength: [100, 'Room name must be at most 100 characters']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  participants: [{
    type: String,
    trim: true,
    maxlength: [50, 'Participant name must be at most 50 characters']
  }],
  code: {
    type: String,
    default: '// Welcome to CodeSync!\n// Start coding together!\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();'
  },
  language: {
    type: Number,
    default: 63
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

roomSchema.index({ roomID: 1, isActive: 1 });
roomSchema.index({ lastActivity: 1, isActive: 1 });

roomSchema.pre('save', function(next) {
  this.lastActivity = new Date();
  next();
});

roomSchema.statics.cleanupInactiveRooms = async function() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const result = await this.deleteMany({ 
      $or: [
        { lastActivity: { $lt: twentyFourHoursAgo }, isActive: false },
        { lastActivity: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      ]
    });
    console.log(`Cleaned up ${result.deletedCount} inactive rooms`);
    return result;
  } catch (error) {
    console.error('Error cleaning up rooms:', error);
    throw error;
  }
};

roomSchema.pre('save', function(next) {
  if (this.roomID) {
    this.roomID = this.roomID.trim().toUpperCase();
    
    if (!/^[A-Z0-9]+$/.test(this.roomID)) {
      const error = new Error('Room ID can only contain letters and numbers');
      error.name = 'ValidationError';
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('Room', roomSchema);
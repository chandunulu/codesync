import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function LandingPage() {
  const navigate = useNavigate();

  // UI state
  const [activeBlock, setActiveBlock] = useState('create');
  const [loading, setLoading] = useState(false);
  const [roomIdDisplay, setRoomIdDisplay] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  // Form fields
  const [creatorName, setCreatorName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [userName, setUserName] = useState('');

  const generateRoomId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const validateUserName = (name) => {
    return name && name.trim().length >= 2;
  };

  const validateRoomId = (roomId) => {
    return roomId && roomId.length >= 4;
  };

  function toggleBlock(type) {
    setActiveBlock(type);
  }

  function showNotification(message, type = 'success') {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
  }

  const createRoom = async () => {
    if (!validateUserName(creatorName)) {
      showNotification('Please enter your name (at least 2 characters)', 'error');
      return;
    }

    setLoading(true);

    try {
      const roomId = generateRoomId();
      
      const response = await axios.post(`${process.env.REACT_APP_API_URL  }/api/rooms/create-room`, {
        roomID: roomId,
        creator: creatorName.trim(),
        name: roomName.trim() || `${creatorName.trim()}'s Room`
      });

      if (response.data.success) {
        setRoomIdDisplay(roomId);
        showNotification('Room created successfully!');
        
        // Navigate to the room
        setTimeout(() => {
          navigate(`/room/${roomId}`, { 
            state: { 
              userName: creatorName.trim(),
              isCreator: true 
            } 
          });
        }, 1500);
      } else {
        showNotification(response.data.message || 'Failed to create room', 'error');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      showNotification(
        error.response?.data?.message || 'Failed to create room. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    const rid = joinRoomId.trim().toUpperCase();
    if (!validateRoomId(rid)) {
      showNotification('Please enter a valid room ID', 'error');
      return;
    }

    if (!validateUserName(userName)) {
      showNotification('Please enter your name (at least 2 characters)', 'error');
      return;
    }

    setLoading(true);

    try {
      // Check if room exists first
      const checkResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms/check-room/${rid}`);
      
      if (!checkResponse.data.success) {
        showNotification('Room not found or is inactive', 'error');
        setLoading(false);
        return;
      }

      // Join the room
      const joinResponse = await axios.post(`${process.env.REACT_APP_API_URL }/api/rooms/join-room`, {
        roomID: rid,
        userName: userName.trim()
      });

      if (joinResponse.data.success) {
        showNotification(`Joining room ${rid}...`);
        
        setTimeout(() => {
          navigate(`/room/${rid}`, { 
            state: { 
              userName: userName.trim(),
              isCreator: joinResponse.data.data.isCreator 
            } 
          });
        }, 1000);
      } else {
        showNotification(joinResponse.data.message || 'Failed to join room', 'error');
      }
    } catch (error) {
      console.error('Error joining room:', error);
      showNotification(
        error.response?.data?.message || 'Failed to join room. Please check the room ID.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; }
    .logo { font-weight: 700; color: #2563eb; }
    .room-block.expanded { flex-grow: 1.5; transform: scale(1.02); }
    .room-block.collapsed { flex-grow: 0.8; opacity: 0.7; transform: scale(0.98); }
    .spinner { 
      border: 3px solid #f3f3f3; 
      border-top: 3px solid #2563eb; 
      border-radius: 50%; 
      width: 24px; 
      height: 24px; 
      animation: spin 1s linear infinite; 
    }
    @keyframes spin { 
      0% { transform: rotate(0deg); } 
      100% { transform: rotate(360deg); } 
    }
    .notification { 
      position: fixed; 
      top: 2rem; 
      right: 2rem; 
      transform: translateX(120%); 
      transition: transform 0.4s ease-in-out; 
      z-index: 1000; 
    }
    .notification.show { 
      transform: translateX(0); 
    }
    .feature-card {
      transition: all 0.3s ease;
    }
    .feature-card:hover {
      transform: translateY(-5px);
    }
  `;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen flex items-center justify-center p-4">
      <style>{css}</style>
      
      <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-3xl p-8 sm:p-12 shadow-2xl w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="logo text-5xl mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            CodeSync
          </h1>
          <p className="text-gray-600 text-xl mb-6">
            Real-time collaborative coding with voice & video chat
          </p>
          
          {/* Features Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="feature-card bg-blue-50 p-4 rounded-xl">
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-sm font-semibold text-gray-700">Real-time Sync</div>
            </div>
            <div className="feature-card bg-green-50 p-4 rounded-xl">
              <div className="text-2xl mb-2">🎤</div>
              <div className="text-sm font-semibold text-gray-700">Voice Chat</div>
            </div>
            <div className="feature-card bg-purple-50 p-4 rounded-xl">
              <div className="text-2xl mb-2">📹</div>
              <div className="text-sm font-semibold text-gray-700">Video Chat</div>
            </div>
            <div className="feature-card bg-orange-50 p-4 rounded-xl">
              <div className="text-2xl mb-2">💻</div>
              <div className="text-sm font-semibold text-gray-700">50+ Languages</div>
            </div>
          </div>
        </div>

        {/* Main Action Blocks */}
        <div className="flex flex-col lg:flex-row gap-8 my-8 min-h-[450px]">
          {/* Create Room Block */}
          <div
            className={`room-block p-8 flex flex-col border-2 rounded-2xl cursor-pointer transition-all duration-300 ${
              activeBlock === 'create' 
                ? 'expanded border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-2xl' 
                : 'collapsed bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => toggleBlock('create')}
          >
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🚀</div>
              <h2 className="text-2xl font-bold text-gray-800">Create New Room</h2>
              <p className="text-gray-600 mt-2">Start a new coding session</p>
            </div>
            
            {activeBlock === 'create' && (
              <div className="flex flex-col gap-4 text-left" onClick={(e) => e.stopPropagation()}>
                <p className="text-gray-600 text-sm text-center mb-4">
                  Create a room and invite your team to collaborate in real-time
                </p>
                
                <div className="space-y-3">
                  <input
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Enter your name"
                    maxLength={50}
                  />
                  
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Room name (optional)"
                    maxLength={100}
                  />
                  
                  <button
                    className="w-full p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      createRoom();
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Creating Room...' : 'Create Room & Join'}
                  </button>
                </div>
                
                {roomIdDisplay && (
                  <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-xl text-center">
                    <div className="text-green-600 font-semibold mb-2">🎉 Room Created!</div>
                    <div className="text-lg font-mono font-bold text-green-800">
                      ID: {roomIdDisplay}
                    </div>
                    <div className="text-sm text-green-600 mt-1">Redirecting...</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Join Room Block */}
          <div
            className={`room-block p-8 flex flex-col border-2 rounded-2xl cursor-pointer transition-all duration-300 ${
              activeBlock === 'join' 
                ? 'expanded border-green-500 bg-gradient-to-br from-green-50 to-green-100 shadow-2xl' 
                : 'collapsed bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => toggleBlock('join')}
          >
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🔗</div>
              <h2 className="text-2xl font-bold text-gray-800">Join Existing Room</h2>
              <p className="text-gray-600 mt-2">Connect with your team</p>
            </div>
            
            {activeBlock === 'join' && (
              <div className="flex flex-col gap-4 text-left" onClick={(e) => e.stopPropagation()}>
                <p className="text-gray-600 text-sm text-center mb-4">
                  Enter the room ID shared by your teammate to join their session
                </p>
                
                <div className="space-y-3">
                  <input
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none transition-colors font-mono text-center text-lg"
                    placeholder="Enter room ID (e.g., ABC12345)"
                    maxLength={8}
                  />
                  
                  <input
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none transition-colors"
                    placeholder="Enter your name"
                    maxLength={50}
                  />
                  
                  <button
                    className="w-full p-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-bold hover:from-green-700 hover:to-green-800 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      joinRoom();
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Joining Room...' : 'Join Room'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <div className="spinner" />
            <p className="text-gray-600 font-medium">
              {activeBlock === 'create' ? 'Setting up your room...' : 'Connecting to room...'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>Collaborate in real-time • Voice & Video Chat • 50+ Programming Languages</p>
        </div>
      </div>

      {/* Notification */}
      <div 
        className={`notification p-4 rounded-xl shadow-lg text-white font-semibold ${
          notification.show ? 'show' : ''
        } ${
          notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}
      >
        {notification.message}
      </div>
    </div>
  );
}

export default LandingPage;
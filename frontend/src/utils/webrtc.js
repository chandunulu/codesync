class WebRTCManager {
  constructor(socket, roomId, userName) {
    this.socket = socket;
    this.roomId = roomId;
    this.userName = userName;
    
    // Peer connections map
    this.peerConnections = new Map();
    this.remoteStreams = new Map();
    
    // Local media
    this.localStream = null;
    this.audioEnabled = false;
    this.videoEnabled = false;
    
    // Callbacks
    this.onRemoteStreamCallback = null;
    this.onPeerRemovedCallback = null;
    this.onConnectionStateCallback = null;
    
    // ICE configuration
    this.iceConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { 
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };
    
    // Store pending ICE candidates
    this.pendingIceCandidates = new Map();
    
    // Setup socket listeners for WebRTC signaling
    this.setupSignalingListeners();
    
    console.log('WebRTCManager initialized for room:', roomId);
  }

  setupSignalingListeners() {
    // Clean up existing listeners first
    this.cleanupSignalingListeners();
    
    // Listen for existing voice chat participants
    this.socket.on('voice-chat-participants', async ({ participants }) => {
      console.log('Received existing voice chat participants:', participants);
      
      // Add a small delay to ensure local stream is ready
      await this.waitForLocalStream();
      
      for (const { userId, userName } of participants) {
        if (userId !== this.socket.id) {
          console.log('Creating connection to existing participant:', userName);
          await this.createPeerConnection(userId, userName, true); // true = we initiate
        }
      }
    });
    
    // Listen for new users joining voice chat
    this.socket.on('user-joined-voice', async ({ userId, userName }) => {
      console.log('User joined voice chat:', userName);
      await this.waitForLocalStream();
      await this.createPeerConnection(userId, userName, true); // true = initiator
    });
    
    // Listen for users leaving voice chat
    this.socket.on('user-left-voice', ({ userId, userName }) => {
      console.log('User left voice chat:', userName);
      this.removePeerConnection(userId);
    });

    // Handle WebRTC offer
    this.socket.on('webrtc-offer', async ({ offer, from, fromUser }) => {
      console.log('Received WebRTC offer from:', fromUser);
      await this.handleOffer(offer, from, fromUser);
    });

    // Handle WebRTC answer
    this.socket.on('webrtc-answer', async ({ answer, from }) => {
      console.log('Received WebRTC answer from:', from);
      await this.handleAnswer(answer, from);
    });

    // Handle ICE candidates
    this.socket.on('webrtc-ice-candidate', async ({ candidate, from }) => {
      console.log('Received ICE candidate from:', from);
      await this.handleIceCandidate(candidate, from);
    });
  }

  cleanupSignalingListeners() {
    this.socket.off('voice-chat-participants');
    this.socket.off('user-joined-voice');
    this.socket.off('user-left-voice');
    this.socket.off('webrtc-offer');
    this.socket.off('webrtc-answer');
    this.socket.off('webrtc-ice-candidate');
  }

  // Wait for local stream to be available
  async waitForLocalStream(maxAttempts = 50) {
    let attempts = 0;
    while (!this.localStream && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!this.localStream) {
      console.warn('Local stream not available after waiting');
    }
    
    return this.localStream;
  }

  async initializeMedia(videoEnabled = false, audioEnabled = true) {
    try {
      console.log('Initializing media - Video:', videoEnabled, 'Audio:', audioEnabled);
      
      const constraints = {
        audio: audioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } : false,
        video: videoEnabled ? {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15 }
        } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioEnabled = audioEnabled;
      this.videoEnabled = videoEnabled;

      // Initially mute audio (user needs to unmute manually)
      if (this.localStream.getAudioTracks().length > 0) {
        this.localStream.getAudioTracks()[0].enabled = false;
      }

      console.log('Local media initialized successfully');
      console.log('Audio tracks:', this.localStream.getAudioTracks().length);
      console.log('Video tracks:', this.localStream.getVideoTracks().length);
      
      // Notify server that user joined voice chat
      this.socket.emit('join-voice-chat', {
        roomId: this.roomId,
        userName: this.userName
      });

      return this.localStream;
    } catch (error) {
      console.error('Failed to initialize media:', error);
      throw new Error('Could not access microphone/camera. Please check permissions.');
    }
  }

  async createPeerConnection(peerId, peerName, isInitiator = false) {
    if (this.peerConnections.has(peerId)) {
      console.log('Peer connection already exists for:', peerId);
      return;
    }

    console.log('Creating peer connection for:', peerName, 'Initiator:', isInitiator);

    const peerConnection = new RTCPeerConnection(this.iceConfiguration);
    this.peerConnections.set(peerId, { connection: peerConnection, name: peerName });

    // Initialize pending ICE candidates for this peer
    this.pendingIceCandidates.set(peerId, []);

    // Add local stream tracks to peer connection
    if (this.localStream) {
      console.log('Adding local tracks to peer connection for:', peerName);
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track:', track.kind, 'enabled:', track.enabled);
        peerConnection.addTrack(track, this.localStream);
      });
    } else {
      console.warn('No local stream available when creating peer connection for:', peerName);
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream from:', peerName);
      console.log('Remote stream tracks:', event.streams[0].getTracks().length);
      
      const [remoteStream] = event.streams;
      this.remoteStreams.set(peerId, remoteStream);
      
      // Log track details
      remoteStream.getTracks().forEach(track => {
        console.log('Remote track:', track.kind, 'enabled:', track.enabled, 'muted:', track.muted);
      });
      
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(peerId, peerName, remoteStream);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to:', peerId);
        this.socket.emit('webrtc-ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate,
          to: peerId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerName}:`, peerConnection.connectionState);
      
      if (this.onConnectionStateCallback) {
        this.onConnectionStateCallback(peerId, peerName, peerConnection.connectionState);
      }

      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        this.removePeerConnection(peerId);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerName}:`, peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === 'failed') {
        console.log('ICE connection failed, attempting restart for:', peerName);
        peerConnection.restartIce();
      }
    };

    // Add ICE gathering state change handler
    peerConnection.onicegatheringstatechange = () => {
      console.log(`ICE gathering state with ${peerName}:`, peerConnection.iceGatheringState);
    };

    // If initiator, create and send offer
    if (isInitiator) {
      try {
        console.log('Creating offer for:', peerName);
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        console.log('Setting local description for:', peerName);
        await peerConnection.setLocalDescription(offer);
        
        console.log('Sending offer to:', peerName);
        this.socket.emit('webrtc-offer', {
          roomId: this.roomId,
          offer: offer,
          to: peerId,
          fromUser: this.userName
        });
      } catch (error) {
        console.error('Error creating offer for', peerName, ':', error);
      }
    }
  }

  async handleOffer(offer, from, fromUser) {
    try {
      console.log('Handling offer from:', fromUser);
      
      // Ensure we have local stream before handling offer
      await this.waitForLocalStream();
      
      // Create peer connection if it doesn't exist
      if (!this.peerConnections.has(from)) {
        await this.createPeerConnection(from, fromUser, false);
      }

      const peerConnection = this.peerConnections.get(from).connection;
      
      console.log('Setting remote description for:', fromUser);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Process any pending ICE candidates
      await this.processPendingIceCandidates(from);
      
      console.log('Creating answer for:', fromUser);
      const answer = await peerConnection.createAnswer();
      
      console.log('Setting local description for answer to:', fromUser);
      await peerConnection.setLocalDescription(answer);
      
      console.log('Sending answer to:', fromUser);
      this.socket.emit('webrtc-answer', {
        roomId: this.roomId,
        answer: answer,
        to: from
      });
    } catch (error) {
      console.error('Error handling offer from', fromUser, ':', error);
    }
  }

  async handleAnswer(answer, from) {
    try {
      const peerData = this.peerConnections.get(from);
      if (!peerData) {
        console.error('No peer connection found for answer from:', from);
        return;
      }

      console.log('Setting remote description for answer from:', from);
      await peerData.connection.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process any pending ICE candidates
      await this.processPendingIceCandidates(from);
      
      console.log('Answer processed successfully for:', from);
    } catch (error) {
      console.error('Error handling answer from', from, ':', error);
    }
  }

  async handleIceCandidate(candidate, from) {
    try {
      const peerData = this.peerConnections.get(from);
      if (!peerData) {
        console.error('No peer connection found for ICE candidate from:', from);
        return;
      }

      const peerConnection = peerData.connection;
      
      // If remote description is not set, queue the candidate
      if (!peerConnection.remoteDescription) {
        console.log('Queueing ICE candidate for:', from);
        this.pendingIceCandidates.get(from).push(candidate);
        return;
      }

      console.log('Adding ICE candidate from:', from);
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('ICE candidate added successfully for:', from);
    } catch (error) {
      console.error('Error handling ICE candidate from', from, ':', error);
    }
  }

  async processPendingIceCandidates(peerId) {
    const pendingCandidates = this.pendingIceCandidates.get(peerId) || [];
    const peerConnection = this.peerConnections.get(peerId)?.connection;
    
    if (!peerConnection || pendingCandidates.length === 0) {
      return;
    }
    
    console.log('Processing', pendingCandidates.length, 'pending ICE candidates for:', peerId);
    
    for (const candidate of pendingCandidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding pending ICE candidate:', error);
      }
    }
    
    // Clear pending candidates
    this.pendingIceCandidates.set(peerId, []);
  }

  removePeerConnection(peerId) {
    console.log('Removing peer connection:', peerId);
    
    const peerData = this.peerConnections.get(peerId);
    if (peerData) {
      peerData.connection.close();
      this.peerConnections.delete(peerId);
    }

    if (this.remoteStreams.has(peerId)) {
      this.remoteStreams.delete(peerId);
    }

    if (this.pendingIceCandidates.has(peerId)) {
      this.pendingIceCandidates.delete(peerId);
    }

    if (this.onPeerRemovedCallback) {
      this.onPeerRemovedCallback(peerId);
    }
  }

  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        console.log('Audio toggled:', audioTrack.enabled ? 'enabled' : 'disabled');
        return audioTrack.enabled;
      }
    }
    return false;
  }

  async toggleVideo() {
    if (!this.localStream) {
      console.error('No local stream available');
      return false;
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    
    if (videoTrack) {
      // If video track exists, toggle it
      videoTrack.enabled = !videoTrack.enabled;
      this.videoEnabled = videoTrack.enabled;
      console.log('Video toggled:', videoTrack.enabled ? 'enabled' : 'disabled');
      return videoTrack.enabled;
    } else if (!this.videoEnabled) {
      // If no video track and video is disabled, try to add video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15 }
          }
        });

        const newVideoTrack = videoStream.getVideoTracks()[0];
        if (newVideoTrack) {
          this.localStream.addTrack(newVideoTrack);
          
          // Add the new track to all existing peer connections
          for (const [peerId, { connection }] of this.peerConnections) {
            try {
              connection.addTrack(newVideoTrack, this.localStream);
              
              // Create new offer since we added a track
              if (connection.signalingState === 'stable') {
                const offer = await connection.createOffer();
                await connection.setLocalDescription(offer);
                
                this.socket.emit('webrtc-offer', {
                  roomId: this.roomId,
                  offer: offer,
                  to: peerId,
                  fromUser: this.userName
                });
              }
            } catch (error) {
              console.error('Error adding video track to peer connection:', error);
            }
          }

          this.videoEnabled = true;
          console.log('Video enabled');
          return true;
        }
      } catch (error) {
        console.error('Failed to enable video:', error);
        return false;
      }
    }

    return this.videoEnabled;
  }

  getAudioLevel() {
    if (!this.localStream) return 0;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled) return 0;

    // This is a simplified implementation
    // For real audio level detection, you'd need to use Web Audio API
    return Math.random() * 100; // Placeholder
  }

  setOnRemoteStream(callback) {
    this.onRemoteStreamCallback = callback;
  }

  setOnPeerRemoved(callback) {
    this.onPeerRemovedCallback = callback;
  }

  setOnConnectionState(callback) {
    this.onConnectionStateCallback = callback;
  }

  getConnectionStats() {
    const stats = {
      totalConnections: this.peerConnections.size,
      connections: []
    };

    this.peerConnections.forEach(({ connection, name }, peerId) => {
      stats.connections.push({
        peerId,
        name,
        connectionState: connection.connectionState,
        iceConnectionState: connection.iceConnectionState
      });
    });

    return stats;
  }

  async getDetailedStats(peerId) {
    const peerData = this.peerConnections.get(peerId);
    if (!peerData) return null;

    try {
      const stats = await peerData.connection.getStats();
      const detailedStats = {
        peerId,
        name: peerData.name,
        connectionState: peerData.connection.connectionState,
        iceConnectionState: peerData.connection.iceConnectionState,
        bytesReceived: 0,
        bytesSent: 0,
        packetsLost: 0,
        roundTripTime: 0
      };

      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          detailedStats.bytesReceived += report.bytesReceived || 0;
          detailedStats.packetsLost += report.packetsLost || 0;
        } else if (report.type === 'outbound-rtp') {
          detailedStats.bytesSent += report.bytesSent || 0;
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          detailedStats.roundTripTime = report.currentRoundTripTime || 0;
        }
      });

      return detailedStats;
    } catch (error) {
      console.error('Error getting detailed stats:', error);
      return null;
    }
  }

  disconnect() {
    console.log('Disconnecting WebRTC Manager');

    // Notify server that user left voice chat
    this.socket.emit('leave-voice-chat', {
      roomId: this.roomId,
      userName: this.userName
    });

    // Close all peer connections
    this.peerConnections.forEach((peerData, peerId) => {
      peerData.connection.close();
    });
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.pendingIceCandidates.clear();

    // Stop local media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }

    // Remove socket listeners
    this.cleanupSignalingListeners();

    this.audioEnabled = false;
    this.videoEnabled = false;

    console.log('WebRTC Manager disconnected');
  }

  // Utility methods
  isAudioEnabled() {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? audioTrack.enabled : false;
  }

  isVideoEnabled() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    return videoTrack ? videoTrack.enabled : false;
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream(peerId) {
    return this.remoteStreams.get(peerId);
  }

  getAllRemoteStreams() {
    return Array.from(this.remoteStreams.entries()).map(([peerId, stream]) => ({
      peerId,
      stream,
      name: this.peerConnections.get(peerId)?.name || 'Unknown'
    }));
  }

  // Check if WebRTC is supported
  static isSupported() {
    return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Get available media devices
  static async getAvailableDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(device => device.kind === 'audioinput'),
        videoInputs: devices.filter(device => device.kind === 'videoinput'),
        audioOutputs: devices.filter(device => device.kind === 'audiooutput')
      };
    } catch (error) {
      console.error('Error getting available devices:', error);
      return { audioInputs: [], videoInputs: [], audioOutputs: [] };
    }
  }
}

export default WebRTCManager;
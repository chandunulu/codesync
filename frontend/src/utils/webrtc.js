class WebRTCManager {
  constructor(socket, roomId, userName) {
    this.socket = socket;
    this.roomId = roomId;
    this.userName = userName;
    this.localStream = null;
    this.peerConnections = new Map();
    this.remoteStreams = new Map();
    
    // Callback functions
    this.onRemoteStreamCallback = null;
    this.onPeerRemovedCallback = null;
    
    // Media constraints
    this.audioEnabled = false;
    this.videoEnabled = false;
    
    // ICE servers configuration - Enhanced with more STUN servers
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stunserver.org' },
      { urls: 'stun:stun.schlund.de' }
    ];
    
    // Bind methods
    this.handleOffer = this.handleOffer.bind(this);
    this.handleAnswer = this.handleAnswer.bind(this);
    this.handleIceCandidate = this.handleIceCandidate.bind(this);
    
    // Setup socket listeners
    this.setupSocketListeners();
    
    console.log('WebRTC Manager initialized for room:', roomId);
  }
  
  setupSocketListeners() {
    // Clean up any existing listeners
    this.socket.off('voice-chat-participants');
    this.socket.off('user-joined-voice');
    this.socket.off('user-left-voice');
    this.socket.off('webrtc-error');
    
    // Listen for voice chat participants
    this.socket.on('voice-chat-participants', ({ participants }) => {
      console.log('Received voice chat participants:', participants);
      // Create peer connections for existing participants
      participants.forEach(participant => {
        if (participant.userId !== this.socket.id) {
          this.createPeerConnection(participant.userId, participant.userName, true);
        }
      });
    });
    
    // Listen for new users joining voice chat
    this.socket.on('user-joined-voice', ({ userId, userName }) => {
      console.log('User joined voice chat:', userName);
      if (userId !== this.socket.id) {
        // Create peer connection and send offer
        this.createPeerConnection(userId, userName, true);
      }
    });
    
    // Listen for users leaving voice chat
    this.socket.on('user-left-voice', ({ userId, userName }) => {
      console.log('User left voice chat:', userName);
      this.removePeerConnection(userId);
    });
    
    // WebRTC error handling
    this.socket.on('webrtc-error', ({ type, message, targetId }) => {
      console.error('WebRTC error:', type, message, targetId);
      if (targetId && this.peerConnections.has(targetId)) {
        this.removePeerConnection(targetId);
      }
    });
  }
  
  async initializeMedia(video = false, audio = true) {
    try {
      console.log('Initializing media with video:', video, 'audio:', audio);
      
      // Stop existing streams first
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      
      const constraints = {
        video: video ? {
          width: { min: 320, ideal: 640, max: 1280 },
          height: { min: 240, ideal: 480, max: 720 },
          frameRate: { min: 15, ideal: 24, max: 30 },
          facingMode: 'user'
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        } : false
      };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioEnabled = audio;
      this.videoEnabled = video;
      
      console.log('Media initialized successfully', {
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length
      });
      
      // Add tracks to existing peer connections
      this.peerConnections.forEach(({ connection }) => {
        this.localStream.getTracks().forEach(track => {
          const existingSender = connection.getSenders().find(sender => 
            sender.track && sender.track.kind === track.kind
          );
          
          if (existingSender) {
            existingSender.replaceTrack(track).catch(console.error);
          } else {
            connection.addTrack(track, this.localStream);
          }
        });
      });
      
      // Join voice chat on server
      this.socket.emit('join-voice-chat', {
        roomId: this.roomId,
        userName: this.userName
      });
      
      return this.localStream;
    } catch (error) {
      console.error('Failed to initialize media:', error);
      
      // Provide more specific error messages
      if (error.name === 'NotFoundError') {
        throw new Error('No camera or microphone found. Please check your devices.');
      } else if (error.name === 'NotAllowedError') {
        throw new Error('Camera/microphone access denied. Please allow permissions and try again.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Camera/microphone is already in use by another application.');
      } else if (error.name === 'OverconstrainedError') {
        throw new Error('Camera/microphone constraints could not be satisfied.');
      } else {
        throw new Error('Failed to access camera/microphone: ' + error.message);
      }
    }
  }
  
  createPeerConnection(peerId, peerName, shouldCreateOffer = false) {
    if (this.peerConnections.has(peerId)) {
      console.log('Peer connection already exists for:', peerId);
      return this.peerConnections.get(peerId).connection;
    }
    
    console.log('Creating peer connection for:', peerName, peerId, 'shouldCreateOffer:', shouldCreateOffer);
    
    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10
    });
    
    // Add local stream tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind, track.id);
        peerConnection.addTrack(track, this.localStream);
      });
    }
    
    // Handle ICE candidates
    peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to:', peerName);
        this.socket.emit('webrtc-ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate,
          to: peerId
        });
      } else {
        console.log('All ICE candidates sent for:', peerName);
      }
    });
    
    // Handle remote stream
    peerConnection.addEventListener('track', (event) => {
      console.log('Received remote track from:', peerName, event.track.kind);
      const [remoteStream] = event.streams;
      
      // Log stream info
      console.log('Remote stream tracks:', {
        audio: remoteStream.getAudioTracks().length,
        video: remoteStream.getVideoTracks().length
      });
      
      this.remoteStreams.set(peerId, remoteStream);
      
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(peerId, peerName, remoteStream);
      }
    });
    
    // Enhanced connection state monitoring
    peerConnection.addEventListener('connectionstatechange', () => {
      const state = peerConnection.connectionState;
      console.log('Connection state changed for', peerName, ':', state);
      
      if (state === 'connected') {
        console.log('Successfully connected to:', peerName);
      } else if (['failed', 'closed', 'disconnected'].includes(state)) {
        console.log('Connection lost for:', peerName, 'state:', state);
        setTimeout(() => {
          if (peerConnection.connectionState === state) {
            this.removePeerConnection(peerId);
          }
        }, 5000); // Give 5 seconds for recovery
      }
    });
    
    // Handle ICE connection state changes
    peerConnection.addEventListener('iceconnectionstatechange', () => {
      const iceState = peerConnection.iceConnectionState;
      console.log('ICE connection state for', peerName, ':', iceState);
      
      if (iceState === 'failed') {
        console.log('ICE connection failed for:', peerName, 'attempting restart');
        peerConnection.restartIce();
      }
    });
    
    // Monitor signaling state
    peerConnection.addEventListener('signalingstatechange', () => {
      console.log('Signaling state for', peerName, ':', peerConnection.signalingState);
    });
    
    // Handle data channel errors
    peerConnection.addEventListener('error', (error) => {
      console.error('Peer connection error for', peerName, ':', error);
    });
    
    this.peerConnections.set(peerId, { connection: peerConnection, name: peerName });
    
    // Create offer if this peer should initiate
    if (shouldCreateOffer) {
      // Small delay to ensure connection is properly set up
      setTimeout(() => {
        this.createOffer(peerId, peerName);
      }, 100);
    }
    
    return peerConnection;
  }
  
  async createOffer(peerId, peerName) {
    const peerData = this.peerConnections.get(peerId);
    if (!peerData) {
      console.error('No peer connection found for:', peerId);
      return;
    }
    
    try {
      console.log('Creating offer for:', peerName);
      const offer = await peerData.connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerData.connection.setLocalDescription(offer);
      
      console.log('Sending offer to:', peerName, 'SDP length:', offer.sdp.length);
      this.socket.emit('webrtc-offer', {
        roomId: this.roomId,
        offer: offer,
        to: peerId,
        fromUser: this.userName
      });
    } catch (error) {
      console.error('Failed to create offer for', peerName, ':', error);
      this.removePeerConnection(peerId);
    }
  }
  
  async handleOffer(offer, fromPeerId, fromUserName) {
    console.log('Handling offer from:', fromUserName, fromPeerId, 'SDP length:', offer.sdp?.length);
    
    try {
      // Create peer connection if it doesn't exist
      const peerConnection = this.createPeerConnection(fromPeerId, fromUserName, false);
      const peerData = this.peerConnections.get(fromPeerId);
      
      if (!peerData) {
        console.error('Failed to create peer connection for:', fromPeerId);
        return;
      }
      
      // Check if we're in a valid state to handle the offer
      if (peerData.connection.signalingState !== 'stable' && peerData.connection.signalingState !== 'have-local-offer') {
        console.warn('Invalid signaling state for offer:', peerData.connection.signalingState);
        return;
      }
      
      // Set remote description
      await peerData.connection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('Set remote description for offer from:', fromUserName);
      
      // Create answer
      const answer = await peerData.connection.createAnswer();
      await peerData.connection.setLocalDescription(answer);
      
      console.log('Sending answer to:', fromUserName, 'SDP length:', answer.sdp.length);
      this.socket.emit('webrtc-answer', {
        roomId: this.roomId,
        answer: answer,
        to: fromPeerId
      });
    } catch (error) {
      console.error('Failed to handle offer from', fromUserName, ':', error);
      this.removePeerConnection(fromPeerId);
    }
  }
  
  async handleAnswer(answer, fromPeerId) {
    console.log('Handling answer from:', fromPeerId, 'SDP length:', answer.sdp?.length);
    
    const peerData = this.peerConnections.get(fromPeerId);
    if (!peerData) {
      console.error('No peer connection found for answer from:', fromPeerId);
      return;
    }
    
    try {
      // Check signaling state
      if (peerData.connection.signalingState !== 'have-local-offer') {
        console.warn('Invalid signaling state for answer:', peerData.connection.signalingState);
        return;
      }
      
      await peerData.connection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('Set remote description for answer from:', fromPeerId);
    } catch (error) {
      console.error('Failed to handle answer from', fromPeerId, ':', error);
      this.removePeerConnection(fromPeerId);
    }
  }
  
  async handleIceCandidate(candidate, fromPeerId) {
    const peerData = this.peerConnections.get(fromPeerId);
    if (!peerData) {
      console.error('No peer connection found for ICE candidate from:', fromPeerId);
      return;
    }
    
    try {
      // Only add ICE candidates if we have a remote description
      if (peerData.connection.remoteDescription) {
        await peerData.connection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate from:', fromPeerId);
      } else {
        console.warn('Received ICE candidate before remote description from:', fromPeerId);
      }
    } catch (error) {
      console.error('Failed to add ICE candidate from', fromPeerId, ':', error);
      // Don't remove connection for ICE candidate errors as they're common
    }
  }
  
  removePeerConnection(peerId) {
    const peerData = this.peerConnections.get(peerId);
    if (peerData) {
      console.log('Removing peer connection for:', peerData.name);
      peerData.connection.close();
      this.peerConnections.delete(peerId);
    }
    
    if (this.remoteStreams.has(peerId)) {
      // Stop remote stream tracks
      const remoteStream = this.remoteStreams.get(peerId);
      remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStreams.delete(peerId);
    }
    
    if (this.onPeerRemovedCallback) {
      this.onPeerRemovedCallback(peerId);
    }
  }
  
  toggleAudio() {
    if (!this.localStream) {
      console.warn('No local stream available for audio toggle');
      return false;
    }
    
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const newState = !audioTracks[0].enabled;
      audioTracks.forEach(track => {
        track.enabled = newState;
      });
      this.audioEnabled = newState;
      console.log('Audio toggled:', newState ? 'enabled' : 'disabled');
      return newState;
    }
    
    console.warn('No audio tracks found');
    return false;
  }
  
  async toggleVideo() {
    if (!this.localStream) {
      console.warn('No local stream available for video toggle');
      return false;
    }
    
    const videoTracks = this.localStream.getVideoTracks();
    
    if (this.videoEnabled && videoTracks.length > 0) {
      // Disable video
      console.log('Disabling video...');
      videoTracks.forEach(track => {
        track.enabled = false;
        track.stop();
      });
      
      // Remove video tracks from stream
      videoTracks.forEach(track => {
        this.localStream.removeTrack(track);
      });
      
      this.videoEnabled = false;
      console.log('Video disabled');
      return false;
    } else {
      // Enable video
      console.log('Enabling video...');
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { min: 320, ideal: 640, max: 1280 },
            height: { min: 240, ideal: 480, max: 720 },
            frameRate: { min: 15, ideal: 24, max: 30 },
            facingMode: 'user'
          },
          audio: false
        });
        
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          this.localStream.addTrack(videoTrack);
          
          // Add video track to all peer connections
          this.peerConnections.forEach(({ connection }) => {
            const videoSender = connection.getSenders().find(sender => 
              sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
              videoSender.replaceTrack(videoTrack).catch(console.error);
            } else {
              connection.addTrack(videoTrack, this.localStream);
            }
          });
          
          this.videoEnabled = true;
          console.log('Video enabled');
          return true;
        }
      } catch (error) {
        console.error('Failed to enable video:', error);
        return false;
      }
    }
    
    return false;
  }
  
  setOnRemoteStream(callback) {
    this.onRemoteStreamCallback = callback;
  }
  
  setOnPeerRemoved(callback) {
    this.onPeerRemovedCallback = callback;
  }
  
  getLocalStream() {
    return this.localStream;
  }
  
  getRemoteStreams() {
    return this.remoteStreams;
  }
  
  getPeerConnections() {
    return this.peerConnections;
  }
  
  disconnect() {
    console.log('Disconnecting WebRTC Manager');
    
    // Notify server about leaving voice chat
    this.socket.emit('leave-voice-chat', {
      roomId: this.roomId,
      userName: this.userName
    });
    
    // Close all peer connections
    this.peerConnections.forEach((peerData, peerId) => {
      peerData.connection.close();
    });
    this.peerConnections.clear();
    
    // Stop and clean up local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    
    // Stop and clean up remote streams
    this.remoteStreams.forEach(stream => {
      stream.getTracks().forEach(track => track.stop());
    });
    this.remoteStreams.clear();
    
    // Remove socket listeners
    this.socket.off('voice-chat-participants');
    this.socket.off('user-joined-voice');
    this.socket.off('user-left-voice');
    this.socket.off('webrtc-error');
    
    // Reset states
    this.audioEnabled = false;
    this.videoEnabled = false;
    
    console.log('WebRTC Manager disconnected');
  }
  
  // Debug method to check connection states
  getConnectionStates() {
    const states = {};
    this.peerConnections.forEach((peerData, peerId) => {
      states[peerId] = {
        connection: peerData.connection.connectionState,
        ice: peerData.connection.iceConnectionState,
        signaling: peerData.connection.signalingState,
        name: peerData.name
      };
    });
    return states;
  }
  
  // Static utility methods remain the same...
  static isWebRTCSupported() {
    return !!(
      window.RTCPeerConnection ||
      window.webkitRTCPeerConnection ||
      window.mozRTCPeerConnection
    ) && !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
  }
  
  static async getMediaDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      throw new Error('Media devices enumeration not supported');
    }
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(device => device.kind === 'audioinput'),
        videoInputs: devices.filter(device => device.kind === 'videoinput'),
        audioOutputs: devices.filter(device => device.kind === 'audiooutput')
      };
    } catch (error) {
      console.error('Failed to enumerate media devices:', error);
      throw error;
    }
  }
  
  static async checkMediaPermissions() {
    try {
      const permissions = await Promise.all([
        navigator.permissions.query({ name: 'microphone' }),
        navigator.permissions.query({ name: 'camera' })
      ]);
      
      return {
        microphone: permissions[0].state,
        camera: permissions[1].state
      };
    } catch (error) {
      console.warn('Could not check media permissions:', error);
      return {
        microphone: 'unknown',
        camera: 'unknown'
      };
    }
  }
}

export default WebRTCManager;
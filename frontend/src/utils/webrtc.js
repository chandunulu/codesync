class WebRTCManager {
  constructor(socket, roomId, userName) {
    this.socket = socket;
    this.roomId = roomId;
    this.userName = userName;
    this.peers = new Map();
    this.localStream = null;
    this.isVideoEnabled = false;
    this.isAudioEnabled = false;

    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // Add TURN servers for better connectivity
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    };
    
    // Callbacks for UI updates
    this.onRemoteStream = null;
    this.onPeerDisconnected = null;
    this.onConnectionStateChange = null;
  }

  // Initialize WebRTC socket listeners
  initializeWebRTCListeners() {
    if (!this.socket) return;

    console.log('Setting up WebRTC listeners');

    // Handle user joining (initiate connection)
    this.socket.on('user-joined', ({ user }) => {
      if (user.id !== this.socket.id && !this.peers.has(user.id) && this.localStream) {
        console.log(`User ${user.name} joined, initiating connection`);
        setTimeout(() => this.createOffer(user.id, user.name), 1000);
      }
    });

    // Handle user leaving
    this.socket.on('user-left', ({ userId }) => {
      console.log(`User ${userId} left, removing peer`);
      this.removePeer(userId);
    });

    // Handle WebRTC offer
    this.socket.on('webrtc-offer', async ({ offer, from, fromName }) => {
      console.log(`Received offer from ${fromName} (${from})`);
      await this.handleOffer(offer, from, fromName);
    });

    // Handle WebRTC answer
    this.socket.on('webrtc-answer', async ({ answer, from }) => {
      console.log(`Received answer from ${from}`);
      await this.handleAnswer(answer, from);
    });

    // Handle ICE candidates
    this.socket.on('webrtc-ice-candidate', async ({ candidate, from }) => {
      console.log(`Received ICE candidate from ${from}`);
      await this.handleIceCandidate(candidate, from);
    });
  }

  async initializeMedia(video = false, audio = true) {
    try {
      const constraints = {
        video: video ? { 
          width: { ideal: 640, max: 1280 }, 
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 30 }
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } : false
      };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isVideoEnabled = video;
      this.isAudioEnabled = audio;

      console.log('Local media initialized:', {
        video: this.isVideoEnabled,
        audio: this.isAudioEnabled,
        tracks: this.localStream.getTracks().length
      });
      
      // Set up WebRTC listeners after media is initialized
      this.initializeWebRTCListeners();
      
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      // Try fallback options
      if (video && audio) {
        console.log('Retrying with audio only...');
        return await this.initializeMedia(false, true);
      }
      throw error;
    }
  }

  async toggleVideo() {
    if (!this.localStream) return false;
    
    if (this.isVideoEnabled) {
      // Turn off video
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.stop();
        this.localStream.removeTrack(track);
      });
      
      // Remove video track from all peer connections
      this.peers.forEach(peer => {
        const videoSender = peer.pc.getSenders().find(sender => 
          sender.track && sender.track.kind === 'video'
        );
        if (videoSender) {
          peer.pc.removeTrack(videoSender);
        }
      });
      
      this.isVideoEnabled = false;
      console.log('Video disabled');
    } else {
      // Turn on video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640, max: 1280 }, 
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 15, max: 30 }
          } 
        });
        
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);
        this.isVideoEnabled = true;

        // Add the new video track to all existing peer connections
        this.peers.forEach(peer => {
          peer.pc.addTrack(videoTrack, this.localStream);
        });
        
        console.log('Video enabled');
      } catch (error) {
        console.error('Error enabling video:', error);
        return false;
      }
    }
    return this.isVideoEnabled;
  }

  toggleAudio() {
    if (!this.localStream) return false;
    
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      audioTracks[0].enabled = !audioTracks[0].enabled;
      this.isAudioEnabled = audioTracks[0].enabled;
      console.log(`Audio ${this.isAudioEnabled ? 'enabled' : 'disabled'}`);
    }
    return this.isAudioEnabled;
  }

  async createOffer(peerId, peerName) {
    if (!this.localStream) {
      console.log('No local stream available for offer');
      return;
    }

    if (this.peers.has(peerId)) {
      console.log(`Peer ${peerId} already exists, skipping offer creation`);
      return;
    }

    console.log(`Creating offer for ${peerName} (${peerId})`);

    const peerConnection = new RTCPeerConnection(this.configuration);
    this.peers.set(peerId, {
      pc: peerConnection,
      name: peerName,
      stream: null
    });

    // Add local stream tracks
    this.localStream.getTracks().forEach(track => {
      console.log(`Adding track: ${track.kind}`);
      peerConnection.addTrack(track, this.localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        console.log('Sending ICE candidate');
        this.socket.emit('webrtc-ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate,
          to: peerId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Connection state for ${peerName}: ${state}`);
      
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(peerId, peerName, state);
      }
      
      if (state === 'failed' || state === 'disconnected') {
        console.log(`Removing failed peer: ${peerId}`);
        setTimeout(() => this.removePeer(peerId), 2000); // Give it time to recover
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${peerName}: ${peerConnection.iceConnectionState}`);
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`Received remote stream from ${peerName}`, event.streams[0]);
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.stream = event.streams[0];
        if (this.onRemoteStream) {
          this.onRemoteStream(peerId, peerName, event.streams[0]);
        }
      }
    };

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);
      console.log('Offer created and set as local description');

      if (this.socket) {
        this.socket.emit('webrtc-offer', {
          roomId: this.roomId,
          offer: offer,
          to: peerId,
          fromName: this.userName
        });
      }
    } catch (error) {
      console.error('Error creating offer:', error);
      this.removePeer(peerId);
    }
  }

  async handleOffer(offer, peerId, peerName) {
    if (!this.localStream) {
      console.log('No local stream available for answer');
      return;
    }

    if (this.peers.has(peerId)) {
      console.log(`Peer ${peerId} already exists, skipping offer handling`);
      return;
    }

    console.log(`Handling offer from ${peerName} (${peerId})`);

    const peerConnection = new RTCPeerConnection(this.configuration);
    this.peers.set(peerId, {
      pc: peerConnection,
      name: peerName,
      stream: null
    });

    // Add local stream tracks
    this.localStream.getTracks().forEach(track => {
      console.log(`Adding track: ${track.kind}`);
      peerConnection.addTrack(track, this.localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        console.log('Sending ICE candidate');
        this.socket.emit('webrtc-ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate,
          to: peerId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Connection state for ${peerName}: ${state}`);
      
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(peerId, peerName, state);
      }
      
      if (state === 'failed' || state === 'disconnected') {
        console.log(`Removing failed peer: ${peerId}`);
        setTimeout(() => this.removePeer(peerId), 2000);
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${peerName}: ${peerConnection.iceConnectionState}`);
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`Received remote stream from ${peerName}`, event.streams[0]);
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.stream = event.streams[0];
        if (this.onRemoteStream) {
          this.onRemoteStream(peerId, peerName, event.streams[0]);
        }
      }
    };

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('Remote description set');

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('Answer created and set as local description');

      if (this.socket) {
        this.socket.emit('webrtc-answer', {
          roomId: this.roomId,
          answer: answer,
          to: peerId
        });
      }
    } catch (error) {
      console.error('Error handling offer:', error);
      this.removePeer(peerId);
    }
  }

  async handleAnswer(answer, peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      console.log(`No peer found for answer from ${peerId}`);
      return;
    }

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`Remote description set for peer ${peerId}`);
    } catch (error) {
      console.error('Error handling answer:', error);
      this.removePeer(peerId);
    }
  }

  async handleIceCandidate(candidate, peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      console.log(`No peer found for ICE candidate from ${peerId}`);
      return;
    }

    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`ICE candidate added for peer ${peerId}`);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      console.log(`Removing peer: ${peerId}`);
      
      // Close the peer connection
      peer.pc.close();
      
      // Stop remote stream tracks
      if (peer.stream) {
        peer.stream.getTracks().forEach(track => track.stop());
      }
      
      // Remove from peers map
      this.peers.delete(peerId);
      
      // Notify UI
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected(peerId);
      }
      
      console.log(`Peer ${peerId} removed`);
    }
  }

  // Get all connected peers
  getConnectedPeers() {
    const connectedPeers = [];
    this.peers.forEach((peer, peerId) => {
      if (peer.pc.connectionState === 'connected') {
        connectedPeers.push({
          id: peerId,
          name: peer.name,
          stream: peer.stream
        });
      }
    });
    return connectedPeers;
  }

  // Cleanup method
  cleanup() {
    console.log('Cleaning up WebRTC manager');
    
    // Close all peer connections
    this.peers.forEach((peer, peerId) => {
      this.removePeer(peerId);
    });
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    
    // Remove socket listeners
    if (this.socket) {
      this.socket.off('user-joined');
      this.socket.off('user-left');
      this.socket.off('webrtc-offer');
      this.socket.off('webrtc-answer');
      this.socket.off('webrtc-ice-candidate');
    }
    
    this.isVideoEnabled = false;
    this.isAudioEnabled = false;
  }

  // Disconnect method - alias for cleanup to maintain compatibility
  disconnect() {
    this.cleanup();
  }

  // Get local stream status
  getStreamStatus() {
    return {
      hasStream: !!this.localStream,
      videoEnabled: this.isVideoEnabled,
      audioEnabled: this.isAudioEnabled,
      videoTracks: this.localStream ? this.localStream.getVideoTracks().length : 0,
      audioTracks: this.localStream ? this.localStream.getAudioTracks().length : 0
    };
  }
}

export default WebRTCManager;
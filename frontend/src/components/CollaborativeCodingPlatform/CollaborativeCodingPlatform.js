import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import WebRTCManager from '../../utils/webrtc';
import axios from 'axios';
import Editor, { loader } from '@monaco-editor/react';

// Configure Monaco Editor CDN
loader.config({ 
  paths: { 
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' 
  } 
});

// SVG Icons
const Icon = ({ children, size = 20, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

const PlayIcon = ({ size }) => <Icon size={size}><polygon points="5 3 19 12 5 21 5 3" /></Icon>;
const UsersIcon = ({ size }) => <Icon size={size}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
const MicIcon = ({ size }) => <Icon size={size}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></Icon>;
const MicOffIcon = ({ size }) => <Icon size={size}><line x1="2" x2="22" y1="2" y2="22" /><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" /><path d="M5 10v2a7 7 0 0 0 12 5" /><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 .44 1.56" /><path d="M10.41 9.96 12 12.01V19" /><line x1="12" x2="12" y1="19" y2="22" /></Icon>;
const VideoIcon = ({ size }) => <Icon size={size}><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" ry="2" /></Icon>;
const VideoOffIcon = ({ size }) => <Icon size={size}><path d="M16 16.11V16a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2" /><path d="m22 8-6 4 6 4V8Z" /><line x1="2" x2="22" y1="2" y2="22" /></Icon>;
const CopyIcon = ({ size }) => <Icon size={size}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>;
const SettingsIcon = ({ size }) => <Icon size={size}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Icon>;
const DownloadIcon = ({ size }) => <Icon size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></Icon>;

// Enhanced language configurations with Monaco language mapping
const LANGUAGES = [
  { id: 45, name: 'Assembly (NASM 2.14.02)', extension: 'asm', monaco: 'asm' },
  { id: 46, name: 'Bash (5.0.0)', extension: 'sh', monaco: 'shell' },
  { id: 47, name: 'Basic (FBC 1.07.1)', extension: 'bas', monaco: 'vb' },
  { id: 75, name: 'C (Clang 7.0.1)', extension: 'c', monaco: 'c' },
  { id: 76, name: 'C++ (Clang 7.0.1)', extension: 'cpp', monaco: 'cpp' },
  { id: 48, name: 'C (GCC 7.4.0)', extension: 'c', monaco: 'c' },
  { id: 52, name: 'C++ (GCC 7.4.0)', extension: 'cpp', monaco: 'cpp' },
  { id: 49, name: 'C (GCC 8.3.0)', extension: 'c', monaco: 'c' },
  { id: 53, name: 'C++ (GCC 8.3.0)', extension: 'cpp', monaco: 'cpp' },
  { id: 50, name: 'C (GCC 9.2.0)', extension: 'c', monaco: 'c' },
  { id: 54, name: 'C++ (GCC 9.2.0)', extension: 'cpp', monaco: 'cpp' },
  { id: 86, name: 'Clojure (1.10.1)', extension: 'clj', monaco: 'clojure' },
  { id: 51, name: 'C# (Mono 6.6.0.161)', extension: 'cs', monaco: 'csharp' },
  { id: 77, name: 'COBOL (GnuCOBOL 2.2)', extension: 'cob', monaco: 'cobol' },
  { id: 55, name: 'Common Lisp (SBCL 2.0.0)', extension: 'lisp', monaco: 'lisp' },
  { id: 56, name: 'D (DMD 2.089.1)', extension: 'd', monaco: 'd' },
  { id: 57, name: 'Elixir (1.9.4)', extension: 'ex', monaco: 'elixir' },
  { id: 58, name: 'Erlang (OTP 22.2)', extension: 'erl', monaco: 'erlang' },
  { id: 44, name: 'Executable', extension: 'exe', monaco: 'plaintext' },
  { id: 87, name: 'F# (.NET Core SDK 3.1.202)', extension: 'fs', monaco: 'fsharp' },
  { id: 59, name: 'Fortran (GFortran 9.2.0)', extension: 'f90', monaco: 'fortran' },
  { id: 60, name: 'Go (1.13.5)', extension: 'go', monaco: 'go' },
  { id: 88, name: 'Groovy (3.0.3)', extension: 'groovy', monaco: 'groovy' },
  { id: 61, name: 'Haskell (GHC 8.8.1)', extension: 'hs', monaco: 'haskell' },
  { id: 62, name: 'Java (OpenJDK 13.0.1)', extension: 'java', monaco: 'java' },
  { id: 63, name: 'JavaScript (Node.js 12.14.0)', extension: 'js', monaco: 'javascript' },
  { id: 78, name: 'Kotlin (1.3.70)', extension: 'kt', monaco: 'kotlin' },
  { id: 64, name: 'Lua (5.3.5)', extension: 'lua', monaco: 'lua' },
  { id: 89, name: 'Multi-file program', extension: 'zip', monaco: 'plaintext' },
  { id: 79, name: 'Objective-C (Clang 7.0.1)', extension: 'm', monaco: 'objective-c' },
  { id: 65, name: 'OCaml (4.09.0)', extension: 'ml', monaco: 'ocaml' },
  { id: 66, name: 'Octave (5.1.0)', extension: 'm', monaco: 'matlab' },
  { id: 67, name: 'Pascal (FPC 3.0.4)', extension: 'pas', monaco: 'pascal' },
  { id: 85, name: 'Perl (5.28.1)', extension: 'pl', monaco: 'perl' },
  { id: 68, name: 'PHP (7.4.1)', extension: 'php', monaco: 'php' },
  { id: 43, name: 'Plain Text', extension: 'txt', monaco: 'plaintext' },
  { id: 69, name: 'Prolog (GNU Prolog 1.4.5)', extension: 'pl', monaco: 'prolog' },
  { id: 70, name: 'Python (2.7.17)', extension: 'py', monaco: 'python' },
  { id: 71, name: 'Python (3.8.1)', extension: 'py', monaco: 'python' },
  { id: 80, name: 'R (4.0.0)', extension: 'r', monaco: 'r' },
  { id: 72, name: 'Ruby (2.7.0)', extension: 'rb', monaco: 'ruby' },
  { id: 73, name: 'Rust (1.40.0)', extension: 'rs', monaco: 'rust' },
  { id: 81, name: 'Scala (2.13.2)', extension: 'scala', monaco: 'scala' },
  { id: 82, name: 'SQL (SQLite 3.27.2)', extension: 'sql', monaco: 'sql' },
  { id: 83, name: 'Swift (5.2.3)', extension: 'swift', monaco: 'swift' },
  { id: 74, name: 'TypeScript (3.7.4)', extension: 'ts', monaco: 'typescript' },
  { id: 84, name: 'Visual Basic.Net (vbnc 0.0.0.5943)', extension: 'vb', monaco: 'vb' }
];

// Default code templates for different languages
const getDefaultCode = (languageId) => {
  const templates = {
    63: `// Welcome to CodeSync!
// Start coding together!

console.log("Hello, World!");

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci of 10:", fibonacci(10));`,
    
    71: `# Welcome to CodeSync!
# Start coding together!

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

def main():
    print("Hello, World!")
    print(f"Fibonacci of 10: {fibonacci(10)}")

if __name__ == "__main__":
    main()`,
    
    62: `// Welcome to CodeSync!
// Start coding together!

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        System.out.println("Fibonacci of 10: " + fibonacci(10));
    }
    
    public static int fibonacci(int n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
}`,
    
    48: `// Welcome to CodeSync!
// Start coding together!

#include <stdio.h>

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    printf("Hello, World!\\n");
    printf("Fibonacci of 10: %d\\n", fibonacci(10));
    return 0;
}`,
    
    52: `// Welcome to CodeSync!
// Start coding together!

#include <iostream>
using namespace std;

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    cout << "Hello, World!" << endl;
    cout << "Fibonacci of 10: " << fibonacci(10) << endl;
    return 0;
}`
  };
  
  return templates[languageId] || `// Welcome to CodeSync!
// Start coding together!

// Write your code here...`;
};

// Base64 decode utility
const base64Decode = (str) => {
  try {
    return atob(str);
  } catch (e) {
    return str; // Return original if not base64
  }
};

function CollaborativeCodingPlatform() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = location.state?.userName || 'Anonymous';
  
  // Socket and WebRTC refs
  const socketRef = useRef(null);
  const webRTCRef = useRef(null);
  const codeChangeTimeoutRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  
  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [language, setLanguage] = useState(63); // JavaScript by default
  const [users, setUsers] = useState([]);
  const [, setCurrentUser] = useState(null);
  
  // Media states
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  
  // UI states
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [notification, setNotification] = useState({ show: false, message: '' });
  
  // Editor states
  const [isEditorReady, setIsEditorReady] = useState(false);
  
  // Refs
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});

  const showAppNotification = useCallback((message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 3000);
  }, []);

  // Initialize default code when language changes
  useEffect(() => {
    if (!hasJoinedRef.current && !code) {
      setCode(getDefaultCode(language));
    }
  }, [language, code]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (webRTCRef.current) {
      webRTCRef.current.disconnect();
      webRTCRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (codeChangeTimeoutRef.current) {
      clearTimeout(codeChangeTimeoutRef.current);
    }
    hasJoinedRef.current = false;
  }, []);

  const setupSocketListeners = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Remove all existing listeners to prevent duplicates
    socket.removeAllListeners();

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('room-state', ({ code: roomCode, language: roomLanguage, users: roomUsers }) => {
      console.log('Received room state:', { codeLength: roomCode?.length, language: roomLanguage, userCount: roomUsers?.length });
      if (roomCode !== undefined) {
        setCode(roomCode);
        // Update Monaco editor if ready
        if (editorRef.current && isEditorReady) {
          editorRef.current.setValue(roomCode);
        }
      }
      if (roomLanguage !== undefined) setLanguage(roomLanguage);
      if (roomUsers) {
        setUsers(roomUsers);
        const currentUserData = roomUsers.find(u => u.isCurrentUser);
        if (currentUserData) {
          setCurrentUser({ name: currentUserData.name, isCreator: currentUserData.isCreator });
        }
      }
    });

    socket.on('user-joined', ({ user, users: updatedUsers }) => {
      console.log('User joined:', user.name);
      if (updatedUsers) {
        setUsers(updatedUsers);
      }
      showAppNotification(`${user.name} joined the room`);
    });

    socket.on('user-left', ({ userName: leftUserName, users: updatedUsers }) => {
      console.log('User left:', leftUserName);
      if (updatedUsers) {
        setUsers(updatedUsers);
      }
      showAppNotification(`${leftUserName} left the room`);
    });

    socket.on('code-update', ({ code: newCode }) => {
      console.log('Received code update');
      setCode(newCode);
      // Update Monaco editor if ready and not currently focused
      if (editorRef.current && isEditorReady && !editorRef.current.hasTextFocus()) {
        editorRef.current.setValue(newCode);
      }
    });

    socket.on('language-update', ({ language: newLanguage }) => {
      console.log('Received language update:', newLanguage);
      setLanguage(newLanguage);
    });

    socket.on('room-closed', ({ message, closedBy }) => {
      showAppNotification(`${message} by ${closedBy}`, 'error');
      setTimeout(() => {
        navigate('/');
      }, 3000);
    });

    // WebRTC listeners
    socket.on('webrtc-offer', async ({ offer, from, fromUser }) => {
      if (webRTCRef.current) {
        await webRTCRef.current.handleOffer(offer, from, fromUser);
      }
    });

    socket.on('webrtc-answer', async ({ answer, from }) => {
      if (webRTCRef.current) {
        await webRTCRef.current.handleAnswer(answer, from);
      }
    });

    socket.on('webrtc-ice-candidate', async ({ candidate, from }) => {
      if (webRTCRef.current) {
        await webRTCRef.current.handleIceCandidate(candidate, from);
      }
    });
  }, [navigate, showAppNotification, isEditorReady]);

  const initializeRoom = useCallback(async () => {
    if (hasJoinedRef.current) return;
    
    try {
      // Initialize socket connection
      const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
      socketRef.current = io(socketUrl, {
        transports: ['websocket', 'polling']
      });
      
      setupSocketListeners();
      
      // Join room via API first to validate
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await axios.post(`${apiUrl}/api/rooms/join-room`, {
        roomID: roomId,
        userName: userName
      });

      if (response.data.success) {
        const isCreator = response.data.data.isCreator;
        setCurrentUser({ name: userName, isCreator });
        
        // Join socket room
        socketRef.current.emit('join-room', {
          roomId: roomId,
          userName: userName,
          isCreator: isCreator
        });
        
        hasJoinedRef.current = true;
        setIsConnected(true);
        showAppNotification(`Welcome to room ${roomId}!`);
      }
    } catch (error) {
      console.error('Failed to join room:', error);
      showAppNotification('Failed to join room. Redirecting...', 'error');
      setTimeout(() => navigate('/'), 3000);
    }
  }, [roomId, userName, setupSocketListeners, navigate, showAppNotification]);

  useEffect(() => {
    initializeRoom();
    return cleanup;
  }, [initializeRoom, cleanup]);

  const runCode = async () => {
    if (!code.trim()) {
      showAppNotification('Please enter some code to run', 'error');
      return;
    }

    setIsRunning(true);
    setOutput('Running code...\n');
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await axios.post(`${apiUrl}/api/execute`, {
        source_code: code,
        language_id: language,
        stdin: "",
        base64_encoded: false,  // Enable base64 encoding
        wait: true,
        cpu_time_limit: 5,
        memory_limit: 128000
      });

      if (response.data.success) {
        const result = response.data.result;
        let output = '';
        
        if (result.stdout) {
          output +='OUTPUT:\n'+result.stdout+'\n';
        }
        if (result.stderr) {
          output += 'STDERR:\n' + result.stderr + '\n';
        }
        if (result.compile_output) {
          output += 'COMPILE OUTPUT:\n' +result.compile_output+ '\n';
        }
        if (result.message) {
          output += 'MESSAGE:\n' + result.message + '\n';
        }
        
        // Add execution statistics
        if (result.time || result.memory) {
          output += '\n--- Execution Stats ---\n';
          if (result.time) output += `Time: ${result.time}s\n`;
          if (result.memory) output += `Memory: ${result.memory} KB\n`;
          if (result.status?.description) {
            output += `Status: ${result.status.description}\n`;
          }
        }
        
        if (!output.trim())  output = 'Code executed successfully (no output)';
        
        setOutput(output);
      } else {
        setOutput(`Error: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Code execution error:', error);
      setOutput(`Execution Error: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleEditorChange = (value) => {
    if (value !== undefined) {
      console.log(code)
      setCode(value);
      
      // Debounce code changes to avoid excessive socket emissions
      if (codeChangeTimeoutRef.current) {
        clearTimeout(codeChangeTimeoutRef.current);
      }
      
      codeChangeTimeoutRef.current = setTimeout(() => {
        if (socketRef.current && hasJoinedRef.current) {
          socketRef.current.emit('code-change', {
            roomId: roomId,
            code: value
          });
        }
      }, 300); // 300ms debounce
    }
  };

  const handleLanguageChange = (e) => {
    const newLanguage = parseInt(e.target.value);
    setLanguage(newLanguage);
    
    // Emit language change to other users
    if (socketRef.current && hasJoinedRef.current) {
      socketRef.current.emit('language-change', {
        roomId: roomId,
        language: newLanguage
      });
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsEditorReady(true);

    // Configure editor options
    editor.updateOptions({
      fontSize: fontSize,
      fontFamily: 'JetBrains Mono, Fira Code, Monaco, Menlo, "Courier New", monospace',
      lineHeight: 1.5,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: true,
      quickSuggestions: {
        other: true,
        comments: true,
        strings: true
      }
    });

    // Add custom key bindings
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runCode();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveFile();
    });
  };

  const toggleVoiceChat = async () => {
    if (!voiceEnabled) {
      try {
        // Initialize WebRTC
        webRTCRef.current = new WebRTCManager(socketRef.current, roomId, userName);
        
        const stream = await webRTCRef.current.initializeMedia(videoEnabled, true);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        // Set up remote stream handler
        webRTCRef.current.setOnRemoteStream((peerId, peerName, stream) => {
          const videoElement = remoteVideosRef.current[peerId];
          if (videoElement) {
            videoElement.srcObject = stream;
          }
        });
        
        webRTCRef.current.setOnPeerRemoved((peerId) => {
          const videoElement = remoteVideosRef.current[peerId];
          if (videoElement) {
            videoElement.srcObject = null;
          }
          delete remoteVideosRef.current[peerId];
        });
        
        setVoiceEnabled(true);
        setMicMuted(false);
        showAppNotification('Joined voice chat');
      } catch (error) {
        console.error('Failed to join voice chat:', error);
        showAppNotification('Failed to access microphone', 'error');
      }
    } else {
      // Leave voice chat
      if (webRTCRef.current) {
        webRTCRef.current.disconnect();
        webRTCRef.current = null;
      }
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      Object.keys(remoteVideosRef.current).forEach(peerId => {
        const videoElement = remoteVideosRef.current[peerId];
        if (videoElement) {
          videoElement.srcObject = null;
        }
      });
      remoteVideosRef.current = {};
      
      setVoiceEnabled(false);
      setVideoEnabled(false);
      setMicMuted(true);
      showAppNotification('Left voice chat');
    }
  };

  const toggleMic = () => {
    if (webRTCRef.current) {
      const newMutedState = !webRTCRef.current.toggleAudio();
      setMicMuted(newMutedState);
      showAppNotification(newMutedState ? 'Microphone muted' : 'Microphone unmuted');
    }
  };

  const toggleVideo = async () => {
    if (webRTCRef.current) {
      try {
        const videoState = await webRTCRef.current.toggleVideo();
        setVideoEnabled(videoState);
        showAppNotification(videoState ? 'Camera enabled' : 'Camera disabled');
      } catch (error) {
        console.error('Failed to toggle video:', error);
        showAppNotification('Failed to toggle camera', 'error');
      }
    }
  };

  // Copy room ID to clipboard
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      showAppNotification('Room ID copied to clipboard!');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showAppNotification('Room ID copied to clipboard!');
    }
  };

  // Save code to file
  const saveFile = () => {
    const selectedLanguage = LANGUAGES.find(lang => lang.id === language);
    const extension = selectedLanguage?.extension || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codesync_${roomId}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAppNotification('File saved successfully!');
  };

  // Get current language info
  const getCurrentLanguage = () => {
    return LANGUAGES.find(lang => lang.id === language);
  };

  // Update editor font size
  const updateFontSize = (newSize) => {
    setFontSize(newSize);
    if (editorRef.current) {
      editorRef.current.updateOptions({ fontSize: newSize });
    }
  };

  // Leave room
  const leaveRoom = () => {
    cleanup();
    navigate('/');
  };

  const currentLanguage = getCurrentLanguage();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
          notification.type === 'error' 
            ? 'bg-red-500 text-white' 
            : 'bg-green-500 text-white'
        } transition-all duration-300`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white">
              CodeSync
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">
                Room: {roomId}
              </span>
              <button
                onClick={copyRoomId}
                className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-300"
                title="Copy Room ID"
              >
                <CopyIcon size={14} />
              </button>
            </div>
            <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs ${
              isConnected 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Users */}
            <div className="flex items-center gap-2 text-gray-300">
              <UsersIcon size={16} />
              <span className="text-sm">
                {users.length}
              </span>
            </div>

            {/* Voice/Video Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleVoiceChat}
                className={`p-2 rounded transition-colors ${voiceEnabled 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title={voiceEnabled ? 'Leave Voice Chat' : 'Join Voice Chat'}
              >
                <MicIcon size={16} />
              </button>
              
              {voiceEnabled && (
                <>
                  <button
                    onClick={toggleMic}
                    className={`p-2 rounded transition-colors ${micMuted 
                      ? 'bg-red-500 text-white hover:bg-red-600' 
                      : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                    title={micMuted ? 'Unmute' : 'Mute'}
                  >
                    {micMuted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
                  </button>
                  
                  <button
                    onClick={toggleVideo}
                    className={`p-2 rounded transition-colors ${videoEnabled 
                      ? 'bg-green-500 text-white hover:bg-green-600' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title={videoEnabled ? 'Disable Camera' : 'Enable Camera'}
                  >
                    {videoEnabled ? <VideoIcon size={16} /> : <VideoOffIcon size={16} />}
                  </button>
                </>
              )}
            </div>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              title="Settings"
            >
              <SettingsIcon size={16} />
            </button>

            {/* Leave Room */}
            <button
              onClick={leaveRoom}
              className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Users List */}
        {users.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {users.map((user, index) => (
              <div
                key={index}
                className={`px-2 py-0.5 rounded-full text-xs ${
                  user.isCurrentUser 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                {user.name} {user.isCreator && '👑'} {user.isCurrentUser && '(You)'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-300">
                Font Size:
              </label>
              <input
                type="range"
                min="12"
                max="24"
                value={fontSize}
                onChange={(e) => updateFontSize(parseInt(e.target.value))}
                className="w-16"
              />
              <span className="text-xs text-gray-300">
                {fontSize}px
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex h-screen">
        {/* Editor Section */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={handleLanguageChange}
                className="px-3 py-1 rounded bg-gray-700 border-gray-600 text-white text-sm"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.id} value={lang.id}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={saveFile}
                className="px-3 py-1.5 rounded flex items-center gap-2 bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors text-sm"
                title="Save File (Ctrl+S)"
              >
                <DownloadIcon size={14} />
                Save
              </button>
              
              <button
                onClick={runCode}
                disabled={isRunning || !code.trim()}
                className={`px-4 py-1.5 rounded flex items-center gap-2 text-sm ${
                  isRunning || !code.trim()
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                } transition-colors`}
                title="Run Code (Ctrl+Enter)"
              >
                <PlayIcon size={14} />
                {isRunning ? 'Running...' : 'Run Code'}
              </button>
            </div>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 bg-gray-900">
            <Editor
              height="100%"
              language={currentLanguage?.monaco || 'plaintext'}
              theme="vs-dark"
              value={code}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              options={{
                fontSize: fontSize,
                fontFamily: 'JetBrains Mono, Fira Code, Monaco, Menlo, "Courier New", monospace',
                lineHeight: 1.5,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                wordBasedSuggestions: true,
                quickSuggestions: {
                  other: true,
                  comments: true,
                  strings: true
                },
                contextmenu: true,
                selectOnLineNumbers: true,
                roundedSelection: false,
                readOnly: false,
                cursorStyle: 'line',
                // eslint-disable-next-line no-dupe-keys
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* Output Section */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
            <h3 className="text-sm font-medium text-white">
              Output
            </h3>
          </div>
          
          <div className="flex-1 p-4 overflow-auto">
            <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap h-full">
              {output || 'Click "Run Code" to see the output here...'}
            </pre>
          </div>

          {/* Video Chat Area */}
          {voiceEnabled && (
            <div className="border-t border-gray-700 p-3">
              <h4 className="text-xs font-medium mb-2 text-white">
                Video Chat
              </h4>
              
              {/* Local Video */}
              <div className="mb-2">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-20 bg-gray-700 rounded"
                />
                <p className="text-xs text-center mt-1 text-gray-400">You</p>
              </div>

              {/* Remote Videos */}
              {Object.entries(remoteVideosRef.current).map(([peerId]) => (
                <div key={peerId} className="mb-2">
                  <video
                    ref={el => {
                      if (el) remoteVideosRef.current[peerId] = el;
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-20 bg-gray-700 rounded"
                  />
                  <p className="text-xs text-center mt-1 text-gray-400">
                    Remote User
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CollaborativeCodingPlatform;
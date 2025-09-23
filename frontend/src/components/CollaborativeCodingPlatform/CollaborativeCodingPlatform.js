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
const XIcon = ({ size }) => <Icon size={size}><path d="m18 6-12 12" /><path d="m6 6 12 12" /></Icon>;
const PlusIcon = ({ size }) => <Icon size={size}><path d="M5 12h14" /><path d="M12 5v14" /></Icon>;
const PenToolIcon = ({ size }) => <Icon size={size}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></Icon>;
const HistoryIcon = ({ size }) => <Icon size={size}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></Icon>;
const PaletteIcon = ({ size }) => <Icon size={size}><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></Icon>;
const TrashIcon = ({ size }) => <Icon size={size}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c-1 0 2 1 2 2v2" /></Icon>;

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

// Whiteboard Component
const Whiteboard = ({ isOpen, onClose, roomId, socketRef, theme }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [currentSize, setCurrentSize] = useState(2);
  const lastPointRef = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    if (!isOpen || !socketRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 800;
    canvas.height = 600;
    
    // Set background
    ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Configure drawing context
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Socket listeners for collaborative drawing
    socketRef.current.on('whiteboard-draw', ({ x, y, prevX, prevY, color, size }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    
    socketRef.current.on('whiteboard-clear', () => {
      ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.off('whiteboard-draw');
        socketRef.current.off('whiteboard-clear');
      }
    };
  }, [isOpen, theme, socketRef]);
  
  const getCoordinates = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };
  
  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    
    const coords = getCoordinates(e);
    lastPointRef.current = coords;
    
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw a dot for single clicks
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, currentSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = currentColor;
    ctx.fill();
  };
  
  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const coords = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    
    // Emit drawing data to other users
    if (socketRef.current) {
      socketRef.current.emit('whiteboard-draw', {
        roomId,
        x: coords.x,
        y: coords.y,
        prevX: lastPointRef.current.x,
        prevY: lastPointRef.current.y,
        color: currentColor,
        size: currentSize
      });
    }
    
    lastPointRef.current = coords;
  };
  
  const stopDrawing = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
  };
  
  // Touch event handlers
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvasRef.current.dispatchEvent(mouseEvent);
  };
  
  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvasRef.current.dispatchEvent(mouseEvent);
  };
  
  const handleTouchEnd = (e) => {
    const mouseEvent = new MouseEvent("mouseup", {});
    canvasRef.current.dispatchEvent(mouseEvent);
  };
  
  const clearCanvas = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = theme === 'dark' ? '#1f2937' : '#ffffff';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    if (socketRef.current) {
      socketRef.current.emit('whiteboard-clear', { roomId });
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4 max-w-4xl w-full mx-4`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Collaborative Whiteboard
          </h3>
          <button
            onClick={onClose}
            className={`p-2 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
          >
            <XIcon size={20} />
          </button>
        </div>
        
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Color:</label>
            <input
              type="color"
              value={currentColor}
              onChange={(e) => setCurrentColor(e.target.value)}
              className="w-8 h-8 rounded border"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Size:</label>
            <input
              type="range"
              min="1"
              max="20"
              value={currentSize}
              onChange={(e) => setCurrentSize(parseInt(e.target.value))}
              className="w-20"
            />
            <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{currentSize}px</span>
          </div>
          
          <button
            onClick={clearCanvas}
            className={`px-3 py-1 rounded ${theme === 'dark' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors`}
          >
            Clear
          </button>
          
          <button
            onClick={onClose}
            className={`px-3 py-1 rounded ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-500 hover:bg-gray-600'} text-white transition-colors`}
          >
            Close
          </button>
        </div>
        
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="border border-gray-300 cursor-crosshair touch-none"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
    </div>
  );
};

// Code History Component
const CodeHistory = ({ isOpen, onClose, codeHistory, onReplayChange, theme }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1000);
  
  const startReplay = () => {
    if (codeHistory.length === 0) return;
    
    setIsReplaying(true);
    setCurrentStep(0);
    
    const replay = () => {
      let step = 0;
      const interval = setInterval(() => {
        if (step >= codeHistory.length) {
          setIsReplaying(false);
          clearInterval(interval);
          return;
        }
        
        setCurrentStep(step);
        onReplayChange(codeHistory[step].code);
        step++;
      }, replaySpeed);
    };
    
    replay();
  };
  
  const stopReplay = () => {
    setIsReplaying(false);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Code History ({codeHistory.length} changes)
          </h3>
          <button
            onClick={onClose}
            className={`p-2 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
          >
            <XIcon size={20} />
          </button>
        </div>
        
        <div className="flex gap-4 mb-4">
          <button
            onClick={isReplaying ? stopReplay : startReplay}
            disabled={codeHistory.length === 0}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              codeHistory.length === 0 
                ? 'bg-gray-500 cursor-not-allowed' 
                : isReplaying 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
            } text-white transition-colors`}
          >
            <PlayIcon size={16} />
            {isReplaying ? 'Stop Replay' : 'Start Replay'}
          </button>
          
          <div className="flex items-center gap-2">
            <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Speed:</label>
            <select
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(parseInt(e.target.value))}
              className={`px-2 py-1 rounded ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}
            >
              <option value={500}>2x Fast</option>
              <option value={1000}>Normal</option>
              <option value={2000}>0.5x Slow</option>
            </select>
          </div>
          
          {isReplaying && (
            <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} flex items-center`}>
              Step: {currentStep + 1} / {codeHistory.length}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-auto">
          <div className="space-y-2">
            {codeHistory.map((entry, index) => (
              <div
                key={index}
                className={`p-3 rounded border-l-4 ${
                  index === currentStep && isReplaying
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : theme === 'dark'
                      ? 'border-gray-600 bg-gray-700'
                      : 'border-gray-300 bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
                    Change #{index + 1}
                  </span>
                  <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  By: {entry.user} | Length: {entry.code.length} chars
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [language, setLanguage] = useState(63); // JavaScript by default
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState(new Map());
  
  // Media states
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  
  // UI states
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [theme, setTheme] = useState('dark'); // 'dark' or 'light'
  const [notification, setNotification] = useState({ show: false, message: '' });
  
  // New feature states
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [codeHistory, setCodeHistory] = useState([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  
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

    socket.on('room-state', ({ code: roomCode, language: roomLanguage, users: roomUsers, input: roomInput }) => {
      console.log('Received room state:', { codeLength: roomCode?.length, language: roomLanguage, userCount: roomUsers?.length });
      if (roomCode !== undefined) {
        setCode(roomCode);
        // Update Monaco editor if ready
        if (editorRef.current && isEditorReady) {
          editorRef.current.setValue(roomCode);
        }
      }

      if (roomLanguage !== undefined) setLanguage(roomLanguage);
      if (roomInput !== undefined) setInput(roomInput);
      if (roomUsers) {
        setUsers(roomUsers);
        const currentUserData = roomUsers.find(u => u.isCurrentUser);
        if (currentUserData) {
          setCurrentUser({ name: currentUserData.name, isCreator: currentUserData.isCreator });
        }
      }
    });

    socket.on('creator-changed', ({ newCreator, message, users: updatedUsers }) => {
      console.log('Creator changed:', newCreator);
      
      // Update current user if they became the creator
      if (newCreator === userName) {
        setCurrentUser(prev => ({ ...prev, isCreator: true }));
        showAppNotification('You are now the room creator!', 'success');
      } else {
        setCurrentUser(prev => ({ ...prev, isCreator: false }));
        showAppNotification(message, 'info');
      }
      
      // Update users list
      if (updatedUsers) {
        setUsers(updatedUsers.map(user => ({
          ...user,
          isCurrentUser: user.name === userName
        })));
      }
    });

    socket.on('removed-from-room', ({ message, removedBy }) => {
      showAppNotification(`${message} by ${removedBy}`, 'error');
      setTimeout(() => {
        navigate('/');
      }, 3000);
    });

    socket.on('user-removed', ({ userName: removedUserName, users: updatedUsers }) => {
      console.log('User removed:', removedUserName);
      if (updatedUsers) {
        setUsers(updatedUsers.map(user => ({
          ...user,
          isCurrentUser: user.name === userName
        })));
      }
      showAppNotification(`${removedUserName} was removed from the room`, 'warning');
    });

    socket.on('error-message', ({ message }) => {
      showAppNotification(message, 'error');
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

    socket.on('input-update', ({ input: newInput }) => {
      console.log('Received input update');
      setInput(newInput);
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
  }, [navigate, showAppNotification, isEditorReady, userName]);

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
        stdin: input,
        base64_encoded: false,
        wait: true,
        cpu_time_limit: 5,
        memory_limit: 128000
      });

      if (response.data.success) {
        const result = response.data.result;
        let output = '';
        
        if (result.stdout) {
          output += 'OUTPUT:\n' + result.stdout + '\n';
        }
        if (result.stderr) {
          output += 'STDERR:\n' + result.stderr + '\n';
        }
        if (result.compile_output) {
          output += 'COMPILE OUTPUT:\n' + result.compile_output + '\n';
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
        
        if (!output.trim()) output = 'Code executed successfully (no output)';
        
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
      setCode(value);
      
      // Add to history
      setCodeHistory(prev => [
        ...prev,
        {
          code: value,
          timestamp: new Date(),
          user: userName
        }
      ]);
      
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

  const handleInputChange = (value) => {
    setInput(value);
    
    // Emit input change to other users
    if (socketRef.current && hasJoinedRef.current) {
      socketRef.current.emit('input-change', {
        roomId: roomId,
        input: value
      });
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
          console.log('Received remote stream from:', peerName);
          setRemoteUsers(prev => {
            const updated = new Map(prev);
            updated.set(peerId, { name: peerName, stream });
            return updated;
          });
        });
        
        webRTCRef.current.setOnPeerRemoved((peerId) => {
          console.log('Peer removed:', peerId);
          setRemoteUsers(prev => {
            const updated = new Map(prev);
            updated.delete(peerId);
            return updated;
          });
        });
        
        setVoiceEnabled(true);
        setMicMuted(false);
        showAppNotification('Joined voice chat');
      } catch (error) {
        console.error('Failed to join voice chat:', error);
        showAppNotification('Failed to access microphone/camera. Please check permissions.', 'error');
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
      
      setRemoteUsers(new Map());
      
      setVoiceEnabled(false);
      setVideoEnabled(false);
      setMicMuted(true);
      showAppNotification('Left voice chat');
    }
  };

  const toggleMic = () => {
    if (webRTCRef.current) {
      const audioEnabled = webRTCRef.current.toggleAudio();
      setMicMuted(!audioEnabled);
      showAppNotification(audioEnabled ? 'Microphone unmuted' : 'Microphone muted');
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

  // Remove user (creator only)
  const removeUser = (userToRemove) => {
    if (!currentUser?.isCreator || userToRemove === userName) return;
    
    if (socketRef.current) {
      socketRef.current.emit('remove-user', {
        roomId: roomId,
        userName: userToRemove
      });
    }
  };

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    showAppNotification(`Switched to ${newTheme} theme`);
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

  const RemoteVideoComponent = ({ peerId, userData, videoEnabled }) => {
    const videoRef = useRef(null);
    
    useEffect(() => {
      if (videoRef.current && userData.stream) {
        videoRef.current.srcObject = userData.stream;
      }
      return () => {
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    }, [userData.stream]);
    
    return (
      <div className="mb-2 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full rounded ${videoEnabled ? 'h-20' : 'h-12'} ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}
        />
        <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
          {userData.name}
        </div>
      </div>
    );
  };

  // User Management Component
  const UserManagement = ({ isOpen, onClose }) => {
    if (!isOpen || !currentUser?.isCreator) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-4 max-w-md w-full mx-4`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Manage Users (Creator: {currentUser?.name})
            </h3>
            <button
              onClick={onClose}
              className={`p-2 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} transition-colors`}
            >
              <XIcon size={20} />
            </button>
          </div>
          
          <div className="space-y-2">
            {users.map((user, index) => (
              <div
                key={`${user.name}-${index}`}
                className={`flex items-center justify-between p-2 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {user.name}
                  </span>
                  {user.isCreator && <span className="text-yellow-500" title="Room Creator">👑</span>}
                  {user.isCurrentUser && (
                    <span className={`text-blue-500 ml-1 text-sm ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                      (You)
                    </span>
                  )}
                </div>
                
                {!user.isCreator && !user.isCurrentUser && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${user.name} from the room?`)) {
                        removeUser(user.name);
                      }
                    }}
                    className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                    title={`Remove ${user.name}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <div className={`mt-4 p-2 rounded ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              💡 As the creator, you can remove other users from the room. If you leave, the next user will become the creator.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const currentLanguage = getCurrentLanguage();

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
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
      <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              CodeSync
            </h1>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                Room: {roomId}
              </span>
              <button
                onClick={copyRoomId}
                className={`p-1.5 rounded hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} transition-colors ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
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
            <div className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              <UsersIcon size={16} />
              <span className="text-sm">
                {users.length}
              </span>
            </div>

            {/* New Feature Buttons */}
            <button
              onClick={() => setShowWhiteboard(true)}
              className={`p-2 rounded transition-colors ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
              title="Open Whiteboard"
            >
              <PenToolIcon size={16} />
            </button>
            
            <button
              onClick={() => setShowHistory(true)}
              className={`p-2 rounded transition-colors ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
              title="View Code History"
            >
              <HistoryIcon size={16} />
            </button>

            {/* Voice/Video Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleVoiceChat}
                className={`p-2 rounded transition-colors ${voiceEnabled 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : `${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`
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
                      : `${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`
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
              className={`p-2 rounded transition-colors ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
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
                    : `${theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`
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
        <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-3`}>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <label className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
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
              <span className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {fontSize}px
              </span>
            </div>
            
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              <PaletteIcon size={14} />
              {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
            </button>

            {currentUser?.isCreator && (
              <button
                onClick={() => setShowUserManagement(true)}
                className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${theme === 'dark' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
              >
                <UsersIcon size={14} />
                Manage Users
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex h-screen">
        {/* Editor Section */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className={`${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-2 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={handleLanguageChange}
                className={`px-3 py-1 rounded border text-sm ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
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
                className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors text-sm ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
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
                    ? `${theme === 'dark' ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
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
          <div className={`flex-1 ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
            <Editor
              height="100%"
              language={currentLanguage?.monaco || 'plaintext'}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
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
              }}
            />
          </div>
        </div>

        {/* Input/Output Section */}
        <div className={`w-80 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-l flex flex-col`}>
          {/* Input Section */}
          <div className={`${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} border-b`}>
            <div className={`px-4 py-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Input
              </h3>
            </div>
            
            <div className="p-4">
              <textarea
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                className={`w-full h-24 p-2 rounded border text-sm font-mono resize-none ${
                  theme === 'dark' 
                    ? 'bg-gray-900 border-gray-600 text-gray-300 placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                }`}
                placeholder="Enter input for your program here..."
              />
            </div>
          </div>

          {/* Output Section */}
          <div className="flex-1 flex flex-col">
            <div className={`px-4 py-2 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'} border-b`}>
              <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Output
              </h3>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              <pre className={`text-xs font-mono whitespace-pre-wrap h-full ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {output || 'Click "Run Code" to see the output here...'}
              </pre>
            </div>

            {/* Video Chat Area */}
            {voiceEnabled && (
              <div className={`${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} border-t p-3`}>
                <h4 className={`text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Video Chat ({remoteUsers.size + 1} participants)
                </h4>
                
                {/* Local Video */}
                <div className="mb-2 relative">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`w-full rounded ${videoEnabled ? 'h-20' : 'h-12'} ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`}
                  />
                  <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                    You {micMuted && '🔇'}
                  </div>
                </div>

                {/* Remote Videos */}
                {Array.from(remoteUsers.entries()).map(([peerId, userData]) => (
                  <RemoteVideoComponent 
                    key={peerId}
                    peerId={peerId}
                    userData={userData}
                    videoEnabled={videoEnabled}
                  />
                ))}
                {remoteUsers.size === 0 && (
                  <div className={`text-xs text-center py-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    Waiting for others to join voice chat...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Components */}
      <Whiteboard 
        isOpen={showWhiteboard}
        onClose={() => setShowWhiteboard(false)}
        roomId={roomId}
        socketRef={socketRef}
        theme={theme}
      />

      <CodeHistory 
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        codeHistory={codeHistory}
        onReplayChange={(newCode) => {
          setCode(newCode);
          if (editorRef.current && isEditorReady) {
            editorRef.current.setValue(newCode);
          }
        }}
        theme={theme}
      />

      <UserManagement 
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />
    </div>
  );
}

export default CollaborativeCodingPlatform;
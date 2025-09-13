import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import CollaborativeCodingPlatform from './components/CollaborativeCodingPlatform/CollaborativeCodingPlatform';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/room/:roomId" element={<CollaborativeCodingPlatform />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
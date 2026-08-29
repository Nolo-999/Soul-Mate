import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PersonaCreatePage from './pages/PersonaCreatePage';
import MbtiTestPage from './pages/MbtiTestPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';

const Live2DShowcase = lazy(() => import('./pages/Live2DShowcase'));
const MemoriesPage = lazy(() => import('./pages/MemoriesPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PersonaCreatePage />} />
        <Route path="/mbti" element={<MbtiTestPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/memories" element={<Suspense fallback={null}><MemoriesPage /></Suspense>} />
        <Route path="/live2d" element={<Suspense fallback={null}><Live2DShowcase /></Suspense>} />
      </Routes>
    </BrowserRouter>
  );
}

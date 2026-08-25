import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PersonaCreatePage from './pages/PersonaCreatePage';
import MbtiTestPage from './pages/MbtiTestPage';
import ChatPage from './pages/ChatPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PersonaCreatePage />} />
        <Route path="/mbti" element={<MbtiTestPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  );
}

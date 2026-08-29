import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { useSettingsStore } from './stores/settings';

// 初始化主题：读取持久化的 theme，同步到 <body data-theme>
const initialTheme = useSettingsStore.getState().theme;
document.body.setAttribute('data-theme', initialTheme);

// 监听 theme 变化，实时切换 CSS 变量
useSettingsStore.subscribe((state, prev) => {
  if (state.theme !== prev.theme) {
    document.body.setAttribute('data-theme', state.theme);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
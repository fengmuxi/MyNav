import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastContainer } from './components/ui/Toast';
import './index.css';

// 应用入口：挂载 BrowserRouter 以支持 React Router
// 全局 Toast 容器随应用一起挂载，所有页面通过 toast API 推送提示
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer />
    </BrowserRouter>
  </React.StrictMode>,
);

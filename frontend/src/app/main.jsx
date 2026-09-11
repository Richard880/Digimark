import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css'; // Global FontAwesome Icons
import '../styles/index.css'; // Core Tailwind + Custom Glass utilities

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

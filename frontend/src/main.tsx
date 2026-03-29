import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/anti-flash.css'

// Set background immediately to prevent flash
if (document.documentElement) {
  document.documentElement.style.backgroundColor = '#ffffff';
}

const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.style.backgroundColor = '#ffffff';
}

function SplashWrapper() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500); // 2.5 seconds

    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, rgba(255,138,61,0.70), rgba(255,46,122,0.70), rgba(255,194,51,0.70))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        animation: 'fadeOut 0.5s ease-in-out 2s forwards',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '15px'
        }}>
          <img
            src="/logo.png"
            alt="Hello Local Logo"
            style={{
              width: '120px',
              height: '120px',
              objectFit: 'contain',
              marginBottom: '10px'
            }}
          />
          <div style={{
            color: '#FFFFFF',
            fontSize: '32px',
            fontWeight: '700',
            fontFamily: "'Poppins', sans-serif",
            textAlign: 'center',
            textShadow: '0px 2px 4px rgba(0,0,0,0.1)'
          }}>
            Hello Local
          </div>
          <div style={{
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: '400',
            fontFamily: "'Poppins', sans-serif",
            textAlign: 'center',
            opacity: 0.9
          }}>
            India's Own Hyperlocal Marketplace
          </div>
        </div>
      </div>
    );
  }

  return <App />;
}

ReactDOM.createRoot(rootElement!).render(
  <React.StrictMode>
    <SplashWrapper />
  </React.StrictMode>,
)


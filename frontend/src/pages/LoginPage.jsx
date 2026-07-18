import { useState } from "react";
import { User, Lock } from "lucide-react";
import { api, API_BASE } from '../api.js';          // ← import API_BASE
import { generateToken } from '../services/firebase.js';
import pigImage from "../../src/assets/2e388bda-a6fa-4911-bcea-0e3aaa26ed7f-removebg-preview.png";
import backgroundImage from "../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.png";

export function LoginScreen({ onLogin }) {
  const [farmerId, setFarmerId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!farmerId || !password) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.login(farmerId, password);
      localStorage.setItem('token', data.token);
      
      // Register FCM token after login – using dynamic API_BASE
      try {
        const fcmToken = await generateToken();
        if (fcmToken) {
          await fetch(`${API_BASE}/notifications/register-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.token}`,
            },
            body: JSON.stringify({ token: fcmToken }),
          });
          console.log('✅ FCM token registered');
        }
      } catch (fcmErr) {
        console.warn('FCM registration failed (non‑critical):', fcmErr);
      }

      onLogin();
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={backgroundImage}
          alt="Farm Background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Grid layout – full viewport, no bottom padding */}
      <div className="relative z-10 min-h-screen grid grid-rows-[auto_1fr] gap-y-4 sm:gap-y-6 lg:gap-y-8 px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 lg:pt-25">
        {/* Title row */}
        <div className="text-center">
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold"
            style={{
              fontFamily: "'Erica One', cursive",
            }}
          >
            <span style={{ color: "#67bed9" }}>PrepA</span>
            <span style={{ color: "#f77f9f" }}>Pig</span>
          </h1>
        </div>

        {/* Content row – centered vertically and horizontally */}
        <div className="flex flex-col items-center justify-center">
          {/* Pig centered above the card */}
          <div className="relative z-0 mx-auto -mb-57 sm:-mb-8 lg:-mb-10 pointer-events-none">
            <img
              src={pigImage}
              alt="Pig Character"
              className="drop-shadow-xl origin-bottom scale-[1.2] sm:scale-[1.5] lg:scale-[1.8]"
              style={{
                filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.12))",
              }}
            />
          </div>

          {/* Glassmorphic Panel – adjusted top padding */}
          <div
            className="relative z-10 w-full max-w-[340px] pt-8 sm:pt-10 lg:pt-12 pb-6 sm:pb-7 lg:pb-8 px-6 sm:px-7 lg:px-8"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.3)",
              backdropFilter: "blur(40px)",
              borderRadius: "48px",
              border: "1.5px solid rgba(255, 255, 255, 0.5)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.05)",
            }}
          >
            {/* Login Title */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="h-px w-8 bg-[#E91E63]/30" />
              <h2
                className="text-2xl font-bold tracking-wide"
                style={{
                  fontFamily: "'Erica One', cursive",
                  color: "#E91E63",
                }}
              >
                Login
              </h2>
              <div className="h-px w-8 bg-[#E91E63]/30" />
            </div>

            <div className="space-y-4">
              {/* Farmer ID Field */}
              <div>
                <label
                  htmlFor="farmerId"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                  style={{ fontFamily: "'Erica One', cursive" }}
                >
                  Farmer ID
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                    <User className="w-5 h-5 text-[#E91E63]" />
                  </div>
                  <input
                    id="farmerId"
                    type="text"
                    placeholder="Enter your Farmer ID"
                    value={farmerId}
                    onChange={(e) => setFarmerId(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full pl-12 pr-4 py-3.5 text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.6)",
                      borderRadius: "20px",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                </div>
              </div>

              {/* Access Key Field */}
              <div>
                <label
                  htmlFor="accessKey"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                  style={{ fontFamily: "'Erica One', cursive" }}
                >
                  Access Key
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                    <Lock className="w-5 h-5 text-[#E91E63]" />
                  </div>
                  <input
                    id="accessKey"
                    type="password"
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full pl-12 pr-4 py-3.5 text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.6)",
                      borderRadius: "20px",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                </div>
              </div>

              {/* Button */}
              <button
                onClick={handleLogin}
                className="w-full py-4 text-white font-bold uppercase tracking-wide relative active:translate-y-1 transition-transform mt-2"
                style={{
                  backgroundColor: "#E91E63",
                  borderRadius: "20px",
                  boxShadow: "0 8px 0 #AD1457",
                }}
              >
                START TRACKING
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;
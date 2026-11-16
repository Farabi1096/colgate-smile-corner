import React, { useState } from "react";

export default function App() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setUser({ name: data.name, role: data.role, token: data.token });
        localStorage.setItem("merch_token", data.token);
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("Failed to connect to server");
    }
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-2">Colgate Smile Corner</h1>
        <p className="text-gray-500 mb-6 text-sm">Merchandiser Field App</p>
        
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4 bg-white p-6 rounded-2xl shadow-lg border">
          {error && <div className="text-red-500 text-sm font-bold bg-red-50 p-2 rounded">{error}</div>}
          
          <div>
            <input 
              type="tel" 
              placeholder="Phone No (e.g. 017...)" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className="w-full py-3 px-4 border rounded-xl bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500" 
              required 
            />
          </div>
          <div>
            <input 
              type="password" 
              placeholder="4-Digit PIN" 
              value={pin} 
              onChange={(e) => setPin(e.target.value)} 
              className="w-full py-3 px-4 border rounded-xl bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-center tracking-widest" 
              maxLength={4}
              required 
            />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 px-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50">
            {loading ? "Logging in..." : "Secure Login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-white shadow-xl">
      <div className="bg-red-600 p-4 text-white text-center relative">
        <button 
          onClick={() => {setUser(null); localStorage.removeItem("merch_token");}} 
          className="absolute left-4 top-4 text-xs bg-white/20 px-2.5 py-1 rounded-full hover:bg-white/30"
        >
          Logout
        </button>
        <h2 className="text-lg font-bold">কোলগেট স্মাইল কর্ণার</h2>
        <p className="text-xs opacity-90">{user.name} ({user.role})</p>
      </div>
      <div className="p-8 text-center text-gray-600">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
        <p className="font-bold text-gray-800">Welcome to your dashboard, {user.name}!</p>
        <p className="text-sm mt-2">You are securely logged in and connected to the database.</p>
      </div>
    </div>
  );
}
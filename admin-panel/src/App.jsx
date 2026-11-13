import React, { useState } from "react";
export default function App() {
  const [pin, setPin] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Admin Panel Login</h1>
          <p className="text-xs text-gray-500 mb-4">Enter secure PIN to access Colgate Smile Corner Admin</p>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={4} placeholder="••••" className="w-full border rounded-xl p-3 text-center text-lg font-bold tracking-widest mb-4" />
          <button onClick={() => pin === "1234" ? setLoggedIn(true) : alert("Invalid PIN")} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl">Verify PIN</button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow p-6">
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <h1 className="text-xl font-bold text-gray-900">Colgate Smile Corner — Admin Dashboard</h1>
          <button onClick={() => setLoggedIn(false)} className="text-sm bg-gray-200 px-4 py-2 rounded-lg font-bold">Logout</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-xl text-center border"><div className="text-xs text-gray-500 font-bold uppercase">Total Outlets</div><div className="text-2xl font-extrabold text-gray-800 mt-1">0</div></div>
          <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100"><div className="text-xs text-green-600 font-bold uppercase">Total Uploads</div><div className="text-2xl font-extrabold text-green-700 mt-1">0</div></div>
          <div className="bg-blue-50 p-4 rounded-xl text-center border border-blue-100"><div className="text-xs text-blue-600 font-bold uppercase">Display Outlets</div><div className="text-2xl font-extrabold text-blue-700 mt-1">0</div></div>
          <div className="bg-orange-50 p-4 rounded-xl text-center border border-orange-100"><div className="text-xs text-orange-600 font-bold uppercase">Regular Outlets</div><div className="text-2xl font-extrabold text-orange-700 mt-1">0</div></div>
        </div>
      </div>
    </div>
  );
}

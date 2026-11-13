import React, { useState } from "react";
export default function App() {
  const [role, setRole] = useState(null);
  if (!role) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-6">Smile Corner</h1>
        <div className="w-full max-w-xs space-y-3">
          <button onClick={() => setRole("Merchandiser")} className="w-full py-3.5 px-4 border rounded-xl font-bold text-gray-800 hover:border-red-600 hover:bg-red-50">Merchandiser</button>
          <button onClick={() => setRole("Sales Team (TM / SR)")} className="w-full py-3.5 px-4 border rounded-xl font-bold text-gray-800 hover:border-red-600 hover:bg-red-50">Sales Team (TM / SR)</button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen max-w-md mx-auto bg-white shadow-xl">
      <div className="bg-red-600 p-4 text-white text-center relative">
        <button onClick={() => setRole(null)} className="absolute left-4 top-4 text-xs bg-white/20 px-2.5 py-1 rounded-full">Logout</button>
        <h2 className="text-lg font-bold">?????? ?????? ??????</h2>
        <p className="text-xs opacity-90">{role}</p>
      </div>
      <div className="p-5 text-center text-gray-600 text-sm">Field Website Ready — Connected to API</div>
    </div>
  );
}

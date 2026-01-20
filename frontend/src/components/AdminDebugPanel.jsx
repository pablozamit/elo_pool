import React, { useEffect, useState } from 'react';

const AdminDebugPanel = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const handleError = (event) => {
      const message = event.error?.stack || event.message || 'Unknown error';
      setLogs((prev) => [...prev, { message }]);
    };



    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  if (logs.length === 0) {
    return (
      <div className="fixed bottom-4 right-4 bg-black/70 text-white p-4 rounded-md max-w-sm z-50">
        <div className="flex justify-between items-center">
          <span className="font-semibold">Debug</span>
          <button onClick={() => setLogs([])} className="text-xs bg-red-600 px-2 py-1 rounded">Limpiar</button>
        </div>
        <div className="text-xs mt-2">No hay errores</div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/70 text-white p-4 rounded-md max-w-sm max-h-60 overflow-y-auto z-50">
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold">Debug</span>
        <button onClick={() => setLogs([])} className="text-xs bg-red-600 px-2 py-1 rounded">Limpiar</button>
      </div>
      {logs.map((log, idx) => (
        <div key={idx} className="mb-2">
          <pre className="whitespace-pre-wrap text-xs">{log.message}</pre>
          {log.suggestion && (
            <pre className="whitespace-pre-wrap text-green-400 text-xs mt-1">{log.suggestion}</pre>
          )}
        </div>
      ))}
    </div>
  );
};

export default AdminDebugPanel;

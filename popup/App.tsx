import { useEffect, useState } from 'react';
import { sendToBackground } from '../shared/messages';

function App() {
  const [logs, setLogs] = useState<[Date, string][]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;

      if (tabId === undefined) {
        setError("Cannot identify tab ID from popup");
        return;
      }

      const res = await sendToBackground({ action: 'getLogInfo', data: tabId });
      if (res.status === "error") {
        setError("Error at getLogInfo: " + res.error!);
        return;
      }

      setLogs(res.data || []);
    });
  }, []);

  return (
    <div style={{
      width: 300,
      minHeight: 400,
      padding: 16,
      backgroundColor: "#f9fafb",
      fontFamily: "sans-serif",
      overflowY: "auto"
    }}>
      {/* Welcome Message */}
      <h1 style={{
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 12,
        color: "#111827"
      }}>
        Vocab Reminder
      </h1>

      {/* Displaying Log Info */}
      <div>
        {error !== "" ? (
          <p style={{ color: "#dc2626", fontWeight: "500" }}>{error}</p>
        ) : (
          logs.map(([date, message], index) => (
            <div key={index} style={{
              marginBottom: 8,
              padding: 8,
              backgroundColor: "#fff",
              borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{new Date(date).toLocaleString()}</div>
              <div style={{ fontSize: 14 }}>{message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;

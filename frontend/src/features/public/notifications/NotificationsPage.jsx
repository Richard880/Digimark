import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("ALL"); // ALL, ESCROW, MESSAGES

  // Fetch past notification history logs from your backend on mount
  useEffect(() => {
    const fetchNotificationLogs = async () => {
      try {
        // Replace with your actual frontend API client instance or endpoints config
        const response = await axios.get("/api/notifications", { withCredentials: true });
        setNotifications(response.data || []);
      } catch (err) {
        console.error("Failed to compile historical notification entries:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotificationLogs();
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      await axios.post("/api/notifications/mark-all-read", {}, { withCredentials: true });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error("Failed to update read states:", err);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === "ESCROW") return n.type.includes("MPESA") || n.type.includes("ESCROW") || n.type.includes("PAYMENT");
    if (filter === "MESSAGES") return n.type === "NEW_MESSAGE";
    return true;
  });

  return (
    <div className="w-full max-w-4xl mx-auto min-h-[600px] p-4 md:p-8">
      {/* Dynamic Header Block Control Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Notification Center</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            Review your real-time cryptographic logs, escrow allocations, and team operation histories.
          </p>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button
            onClick={handleMarkAllAsRead}
            className="self-start sm:self-center text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl transition cursor-pointer"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Segmented Category Filter Tabs Layout */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl max-w-sm">
        {["ALL", "ESCROW", "MESSAGES"].map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 text-center rounded-lg font-black text-[10px] uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              filter === tab ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Historical Notification Feed Matrix */}
      {isLoading ? (
        <div className="text-center py-20 text-xs font-semibold text-slate-400 animate-pulse">
          Syncing secure platform history channels...
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-3xl bg-slate-50/50 p-6">
          <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
            🔔
          </div>
          <p className="text-sm font-bold text-slate-700">All caught up!</p>
          <p className="text-xs text-slate-400 mt-1">No notifications found matching the chosen filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => {
            const isEscrowAlert = notif.type.includes("MPESA") || notif.type.includes("ESCROW");
            
            return (
              <Link
                key={notif._id}
                to={notif.actionUrl || "#"}
                className={`block p-4 rounded-2xl border transition-all duration-200 text-left relative group ${
                  notif.isRead 
                    ? "bg-white border-slate-100 hover:border-slate-200" 
                    : "bg-gradient-to-r from-emerald-50/20 to-transparent border-emerald-100/70 hover:border-emerald-200"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Category Accent Indicator Circle */}
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                    isEscrowAlert ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                  }`}>
                    {isEscrowAlert ? "💳" : "💬"}
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-xs font-black tracking-tight ${notif.isRead ? "text-slate-800" : "text-slate-900"}`}>
                        {notif.title}
                      </h3>
                      {!notif.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                      {notif.message}
                    </p>
                    <span className="text-[10px] font-semibold text-slate-400 block mt-2">
                      {new Date(notif.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

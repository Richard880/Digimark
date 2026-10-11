import { useEffect, useState, useRef, useMemo } from "react";
import io from "socket.io-client";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth";
import { chatEncryptionService } from "../services/chatEncryption";

const SOCKET_SERVER_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api\/?$/, "");

export default function InboxConversationView() {
  const { auth } = useAuth();
  const loggedInUser = auth?.currentUser;
  const currentUserId = loggedInUser?.uid || loggedInUser?._id; // Supporting firebase/mongo hybrid setups

  // Operational State Matrices
  const [conversations, setConversations] = useState([]);
  const [activeThread, setActiveThread] = useState(null); // Selected Conversation Metadata object
  const [messages, setMessages] = useState([]);
  const [typedMessage, setTypedMessage] = useState("");
  
  const [sharedKey, setSharedKey] = useState(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // Structural Domain References
  const socketRef = useRef(null);
  const scrollAnchorRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Dynamic Computation: Map out partner detail variables safely
  const partnerMetadata = useMemo(() => {
    if (!activeThread) return null;
    const isSender = activeThread.lastMessage?.senderId === currentUserId;
    const partnerId = isSender ? activeThread.lastMessage?.recipientId : activeThread.lastMessage?.senderId;
    return {
      id: partnerId,
      name: activeThread.partnerName || "SokoDigi Trader",
      initials: (activeThread.partnerName || "ST").substring(0, 2).toUpperCase()
    };
  }, [activeThread, currentUserId]);

  // =========================================================================
  // 📡 1. BASELINE SOCKET CONNECTION & LIFECYCLE HOOKS
  // =========================================================================
  useEffect(() => {
    if (!currentUserId) return;

    socketRef.current = io(SOCKET_SERVER_URL, { transports: ["websocket"] });
    socketRef.current.emit("join_inbox", currentUserId);

    // Observer: Live Incoming Messages
    socketRef.current.on("new_message", async (data) => {
      // If the incoming message belongs to our currently open active workspace view thread:
      if (activeThread && (data.from === partnerMetadata?.id)) {
        try {
          const myKeys = await chatEncryptionService.getOrCreateSessionKeyPair(currentUserId);
          // Fetch public key entry profile of partner node from central index directories
          const keyResponse = await apiClient.get(`/users/${data.from}/public-key`);
          const derivedSecret = await chatEncryptionService.deriveSharedSecret(myKeys.privateKey, keyResponse.data.publicKey);
          
          const decryptedBody = await chatEncryptionService.decryptCiphertext(data.content, data.iv, derivedSecret);
          
          setMessages((prev) => [...prev, {
            _id: data._id,
            senderId: data.from,
            recipientId: currentUserId,
            decryptedText: decryptedBody,
            createdAt: data.createdAt
          }]);
        } catch (err) {
          console.error("🔏 Streaming decryption crash:", err);
        }
      }
      // Re-trigger inbox state summaries listing to refresh timestamps and ordering indexes
      loadInboxSummaryListings();
    });

    // Observer: Streaming Typing Status Indicators
    socketRef.current.on("user_typing", (data) => {
      if (activeThread && data.from === partnerMetadata?.id) {
        setIsPartnerTyping(data.isTyping);
      }
    });

    loadInboxSummaryListings();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [currentUserId, activeThread, partnerMetadata?.id]);

    // 🎯 INSERT THIS RIGHT BELOW YOUR MAIN SOCKET USEEFFECT
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const targetUserId = queryParams.get("targetUser");
    const shouldInit = queryParams.get("initMsg");

    if (targetUserId && shouldInit && currentUserId) {
      const initExternalThread = async () => {
        try {
          // Check if this user is already in our sidebar list
          const existingConvo = conversations.find(c => {
            const isSender = c.lastMessage?.senderId === currentUserId;
            const pId = isSender ? c.lastMessage?.recipientId : c.lastMessage?.senderId;
            return pId === targetUserId;
          });

          if (existingConvo) {
            handleSelectConversation(existingConvo);
          } else {
            // Optimistically forge a temporary sidebar row for this new trader
            const mockConvo = {
              _id: `temp_room_${targetUserId}`,
              partnerName: "New Trader (" + targetUserId.substring(0, 6) + "...)",
              updatedAt: new Date().toISOString(),
              lastMessage: {
                senderId: currentUserId,
                recipientId: targetUserId,
                content: "",
                iv: [],
                isRead: true
              }
            };
            setConversations(prev => [mockConvo, ...prev]);
            setActiveThread(mockConvo);
            
            // Establish the secure E2EE crypto pipeline instantly
            const myKeys = await chatEncryptionService.getOrCreateSessionKeyPair(currentUserId);
            const keyResponse = await apiClient.get(`/users/${targetUserId}/public-key`);
            const derivedSecret = await chatEncryptionService.deriveSharedSecret(myKeys.privateKey, keyResponse.data.publicKey);
            setSharedKey(derivedSecret);
            setMessages([]);
          }
        } catch (err) {
          console.error("Failed to optimistically initialize target link:", err);
        }
      };
      initExternalThread();
    }
  }, [window.location.search, conversations.length, currentUserId]);


  
  // Push viewport visibility index down to keep real-time streams readable
  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isPartnerTyping]);

  // =========================================================================
  // 🕒 2. TRANSACTIONAL DATA AGGREGATION LOOKUPS
  // =========================================================================
  const loadInboxSummaryListings = async () => {
    try {
      setIsLoadingInbox(true);
      const response = await apiClient.get(`/chats/inbox/${currentUserId}`);
      if (response.data?.ok) {
        setConversations(response.data.inbox || []);
      }
    } catch (err) {
      console.error("Failed to aggregate user messaging inbox log feeds:", err);
    } finally {
      setIsLoadingInbox(false);
    }
  };

  const handleSelectConversation = async (convo) => {
    try {
      setIsLoadingThread(true);
      setActiveThread(convo);
      setIsPartnerTyping(false);
      setTypedMessage("");

      const isSender = convo.lastMessage?.senderId === currentUserId;
      const targetPartnerId = isSender ? convo.lastMessage?.recipientId : convo.lastMessage?.senderId;

      // 1. Establish Symmetric E2EE Channel Encryption Link
      const myKeys = await chatEncryptionService.getOrCreateSessionKeyPair(currentUserId);
      const keyResponse = await apiClient.get(`/users/${targetPartnerId}/public-key`);
      const derivedSecret = await chatEncryptionService.deriveSharedSecret(myKeys.privateKey, keyResponse.data.publicKey);
      setSharedKey(derivedSecret);

      // 2. Fetch Direct Message History Arrays from MongoDB
      const historyResponse = await apiClient.get(`/chats/history/${currentUserId}/${targetPartnerId}`);
      
      if (historyResponse.data?.ok) {
        const structuralHistory = historyResponse.data.history || [];
        
        // Loop decrypt historical logs on isolated worker cycles
        const decryptedThread = await Promise.all(structuralHistory.map(async (msg) => {
          const textBody = await chatEncryptionService.decryptCiphertext(msg.encryptedBlob, msg.iv, derivedSecret);
          return {
            ...msg,
            decryptedText: textBody
          };
        }));
        
        setMessages(decryptedThread);
      }
    } catch (err) {
      console.error("Failed to load or decrypt conversational channel threads:", err);
    } finally {
      setIsLoadingThread(false);
    }
  };

  // =========================================================================
  // 📤 3. INTERACTIVE PAYLOAD PIPELINE TRANSMISSIONS
  // =========================================================================
  const handleInputChange = (e) => {
    setTypedMessage(e.target.value);
    if (!socketRef.current || !partnerMetadata?.id) return;

    socketRef.current.emit("typing", {
      recipientId: partnerMetadata.id,
      senderId: currentUserId,
      isTyping: true
    });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit("typing", {
        recipientId: partnerMetadata.id,
        senderId: currentUserId,
        isTyping: false
      });
    }, 2000);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!typedMessage.trim() || !sharedKey || !partnerMetadata?.id) return;

    const messageText = typedMessage.trim();
    setTypedMessage(""); // Optimistic text reset

    try {
      // Execute asymmetric encryption calculations
      const cryptographicBlob = await chatEncryptionService.encryptPlaintext(messageText, sharedKey);

      // Transmit live bundle parameters through socket infrastructure tunnels
      socketRef.current.emit("send_encrypted_msg", {
        recipientId: partnerMetadata.id,
        senderId: currentUserId,
        encryptedBlob: cryptographicBlob.ciphertext,
        iv: cryptographicBlob.iv
      });

      // Render onto our local thread layout array immediately
      setMessages((prev) => [...prev, {
        _id: `temp_${Date.now()}`,
        senderId: currentUserId,
        recipientId: partnerMetadata.id,
        decryptedText: messageText,
        createdAt: new Date().toISOString()
      }]);

    } catch (err) {
      console.error("Cryptographic distribution break:", err);
    }
  };

 return (
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-140px)] min-h-[500px] border border-slate-200 bg-white rounded-3xl overflow-hidden shadow-xs grid grid-cols-1 md:grid-cols-12">
      
      {/* 📂 LEFT-HAND CONVERSATION LIST INBOX MATRICES FEED */}
      <div className={`md:col-span-4 border-r border-slate-100 flex flex-col h-full bg-slate-50/50 ${activeThread ? "hidden md:flex" : "flex"}`}>
        {/* 🎯 UPDATED SIDEBAR HEADER: Injected the "Start Chat" dynamic button portal */}
        <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">Messages Inbox</h1>
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">🔏 End-to-End Encrypted Tunnel</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const targetId = prompt("Enter the User ID of the trader you want to message:");
              if (targetId?.trim()) {
                window.location.search = `?targetUser=${targetId.trim()}&initMsg=true`;
              }
            }}
            className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition cursor-pointer"
            title="Start new direct message thread"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoadingInbox && conversations.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400 font-medium">Loading inbox conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-14 px-4 space-y-2">
              <p className="text-sm font-bold text-slate-700">No active messages</p>
              <p className="text-xs text-slate-400 max-w-[200px] mx-auto">Conversations with buyers and suppliers will populate right here.</p>
            </div>
          ) : (
            conversations.map((convo) => {
              const isActive = activeThread?._id === convo._id;
              const hasUnread = convo.lastMessage?.recipientId === currentUserId && !convo.lastMessage?.isRead;
              
              return (
                <button
                  key={convo._id}
                  onClick={() => handleSelectConversation(convo)}
                  className={`w-full text-left p-3.5 rounded-2xl flex items-center gap-3 transition-all duration-200 cursor-pointer ${
                    isActive ? "bg-slate-900 text-white shadow-md shadow-slate-900/5" : "bg-transparent hover:bg-white text-slate-700 hover:shadow-xs"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    isActive ? "bg-emerald-500 text-slate-950" : "bg-slate-200 text-slate-600"
                  }`}>
                    {(convo.partnerName || "ST").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <p className={`text-xs font-bold truncate ${isActive ? "text-white" : "text-slate-900"}`}>
                        {convo.partnerName || "SokoDigi Merchant"}
                      </p>
                      <span className="text-[10px] shrink-0 font-medium text-slate-400">
                        {new Date(convo.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${isActive ? "text-emerald-300/80" : "text-slate-400"} ${hasUnread ? "font-black text-slate-900" : "font-medium"}`}>
                      {hasUnread ? "📢 Sent encrypted file..." : "Secure communication channel"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 💬 RIGHT-HAND INTERACTIVE REAL-TIME MESSAGING INTERFACE CONTEXT CONTAINER */}
      <div className={`md:col-span-8 flex flex-col h-full bg-white ${!activeThread ? "hidden md:flex items-center justify-center text-center p-8" : "flex"}`}>
        {activeThread ? (
          <>
            {/* 🎯 UPDATED HEADER: Display context meta elements alongside the clear data trash icon utility button */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveThread(null)} 
                  className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 mr-1"
                  aria-label="Back to conversations list"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>
                
                <div className="h-9 w-9 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {partnerMetadata.initials}
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-900 tracking-tight">{partnerMetadata.name}</h2>
                  <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    E2EE Connection Confirmed
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (confirm("Are you sure you want to delete this chat history? This will clear local logs and device session caches permanently.")) {
                    try {
                      await chatEncryptionService.clearDeviceVault(currentUserId);
                      alert("Cryptographic session storage wiped clean.");
                      setActiveThread(null);
                      window.location.href = "/messages";
                    } catch (err) {
                      console.error("Wipe operation failed:", err);
                    }
                  }
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Wipe Local Key & Clear Logs"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 0v3M4 7h16"/>
                </svg>
              </button>
            </div>

            {/* CHAT LOG SCREEN COMPONENT INTERFACE LIST */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/30">
              {isLoadingThread ? (
                <div className="flex items-center justify-center h-full text-xs font-semibold text-slate-400">
                  Syncing and decrypting secure communication ledger strings...
                </div>
              ) : (
                <>
                  <div className="mx-auto text-center my-2 max-w-xs">
                    <span className="bg-slate-100 border border-slate-200 text-slate-400 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                      🛡️ Session Verification Verified
                    </span>
                  </div>

                  {messages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    return (
                      <div key={msg._id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <div className={`p-3 rounded-2xl text-xs max-w-md shadow-xs leading-relaxed font-medium break-words ${
                          isMe 
                            ? "bg-slate-900 text-white rounded-br-none" 
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                        }`}>
                          {msg.decryptedText}
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 mt-1 px-1">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}

                  {/* Partner Live Typing Indicator Bubble */}
                  {isPartnerTyping && (
                    <div className="flex flex-col items-start">
                      <div className="p-3 bg-white border border-slate-200 text-slate-400 text-xs rounded-2xl rounded-bl-none shadow-xs font-medium flex items-center gap-1.5">
                        <span>{partnerMetadata.name} is drafting a response</span>
                        <div className="flex gap-0.5">
                          <span className="h-1 w-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="h-1 w-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="h-1 w-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}>



)}
</>
)}

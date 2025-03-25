import { useEffect, useState, useRef } from "react";
import {
  Container,
  Form,
  Button,
  ListGroup,
  Navbar,
  Alert,
} from "react-bootstrap";
import { Send, Download, RotateCw, LogOut, CircleEllipsis } from "lucide-react";
import "../styles/chat.css";
import socket from "../socket";

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [error, setError] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [searchingForPartner, setSearchingForPartner] = useState(false);
  const chatEndRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  useEffect(() => {
    // Check if a partner is already connected
    setPartnerConnected(socket.partner !== undefined);

    // Handle connection errors
    const handleConnect = () => {
      console.log("Connected to server");
      setError(null);
      setReconnecting(false);
      reconnectAttempts.current = 0;

      // When reconnected, emit chatReady to reestablish partnership
      if (messages.length > 0) {
        socket.emit("chatReady");
      }
    };

    const handleConnectError = (err) => {
      console.error("Connection error:", err);
      setError(
        "Unable to connect to the chat server. Please check your internet connection."
      );
      setReconnecting(true);

      // Implement exponential backoff for reconnection attempts
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setTimeout(() => {
          socket.connect();
        }, 1000 * Math.pow(2, reconnectAttempts.current));
      }
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);

    // Partner connection event
    socket.on("partner_found", () => {
      console.log("partner connected...");
      setPartnerConnected(true);
      setChatEnded(false);
      setSearchingForPartner(false);
      setMessages([]); // Clear messages when new partner is found
    });

    // Listen for chatStarted event for new chat sessions
    socket.on("chatStarted", () => {
      console.log("New chat started");
      setSearchingForPartner(false);
    });

    // Message handling
    socket.on("message", (msg) => {
      try {
        if (!msg || typeof msg.text !== "string") {
          console.error("Invalid message format:", msg);
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            text: msg.text,
            sender: "partner",
            timestamp: msg.timestamp || new Date().toLocaleTimeString(),
          },
        ]);
        scrollToBottom();
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });

    socket.on("typing", () => {
      setTyping(true);
      setTimeout(() => setTyping(false), 1000);
    });

    socket.on("partner_disconnected", () => {
      setPartnerConnected(false);
      setChatEnded(true);
      setMessages((prev) => [
        ...prev,
        {
          text: "Partner has left the chat.",
          sender: "system",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    });

    // Error handling
    socket.on("error", (errorMessage) => {
      console.error("Socket error:", errorMessage);
      setError(`Error: ${errorMessage}`);
    });

    // When the component mounts, emit a ready event
    socket.emit("chatReady");

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("partner_found");
      socket.off("chatStarted");
      socket.off("message");
      socket.off("typing");
      socket.off("partner_disconnected");
      socket.off("error");
    };
  }, []);

  const sendMessage = () => {
    if (input.trim()) {
      try {
        const messageData = {
          text: input,
          timestamp: new Date().toLocaleTimeString(),
        };
        socket.emit("message", messageData, (ack) => {
          if (ack && ack.error) {
            console.error("Error sending message:", ack.error);
            setError(`Failed to send message: ${ack.error}`);
          }
        });
        setMessages((prev) => [
          ...prev,
          { text: input, sender: "me", timestamp: messageData.timestamp },
        ]);
        setInput("");
        scrollToBottom();
      } catch (err) {
        console.error("Error in sendMessage:", err);
        setError("Failed to send message. Please try again.");
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    } else {
      try {
        socket.emit("typing");
      } catch (err) {
        console.error("Error emitting typing event:", err);
      }
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const downloadChatHistory = () => {
    try {
      // Format messages for download
      const formattedChat = messages
        .map((msg) => {
          const sender =
            msg.sender === "me"
              ? "You"
              : msg.sender === "partner"
              ? "Partner"
              : "System";
          return `[${msg.timestamp}] ${sender}: ${msg.text}`;
        })
        .join("\n");

      // Create a Blob and download link
      const blob = new Blob([formattedChat], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `chat-history-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error("Error downloading chat:", err);
      setError("Failed to download chat history. Please try again.");
    }
  };

  const startNewChat = () => {
    try {
      // Reset all chat state
      setChatEnded(false);
      setPartnerConnected(false);
      setSearchingForPartner(true);
      setMessages([]);

      // Add a system message
      setMessages([
        {
          text: "Looking for a new partner...",
          sender: "system",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      // Emit startChat event to get a new partner
      socket.emit("startChat");
    } catch (err) {
      console.error("Error starting new chat:", err);
      setError("Failed to start new chat. Please try again.");
    }
  };

  return (
    <Container className="chat-container">
      {/* Chat Header */}
      <Navbar className="chat-header">
        <h4>Chat with a Stranger</h4>
        <div className="header-right">
          {typing && (
            <div className="typing-indicator">
              <CircleEllipsis className="typing-icon" />
              <span>Partner is typing...</span>
            </div>
          )}
          <Button variant="danger" onClick={() => (window.location.href = "/")}>
            Exit
          </Button>
        </div>
      </Navbar>

      {/* Error display */}
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
          {reconnecting && " Attempting to reconnect..."}
        </Alert>
      )}

      {/* Chat Messages */}
      <ListGroup className="chat-box">
        {messages.map((msg, index) => (
          <ListGroup.Item
            key={index}
            className={`chat-bubble ${
              msg.sender === "me"
                ? "me"
                : msg.sender === "partner"
                ? "partner"
                : "system"
            }`}
          >
            <span>{msg.text}</span>
            <small className="timestamp">{msg.timestamp}</small>
          </ListGroup.Item>
        ))}
        {searchingForPartner && (
          <p className="text-muted text-center mt-3">
            Looking for a new partner...
          </p>
        )}
        <div ref={chatEndRef} />
      </ListGroup>

      {/* Chat Ended UI */}
      {chatEnded && messages.length > 0 && (
        <div className="chat-ended mt-3 text-center">
          <p>This chat has ended. Would you like to:</p>
          <Button
            variant="primary"
            onClick={downloadChatHistory}
            className="mx-2"
          >
            <Download size={18} className="mr-2" />
            Download Chat History
          </Button>
          <Button variant="success" onClick={startNewChat} className="mx-2">
            <RotateCw size={18} className="mr-2" />
            Start New Chat
          </Button>
        </div>
      )}

      {/* Chat Input */}
      <Form className="chat-input">
        <Form.Control
          type="text"
          placeholder={
            searchingForPartner
              ? "Looking for a new partner..."
              : partnerConnected
              ? "Type a message..."
              : "Waiting for a partner..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={!partnerConnected || chatEnded || searchingForPartner}
        />
        <Button
          variant="primary"
          onClick={sendMessage}
          disabled={!partnerConnected || chatEnded || searchingForPartner}
        >
          <Send size={18} />
        </Button>
      </Form>
    </Container>
  );
}

export default ChatPage;

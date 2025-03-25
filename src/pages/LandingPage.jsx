import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/landing.css"; // Updated CSS file
import socket from "../socket";

const LandingPage = () => {
  const [waiting, setWaiting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for when a partner is found
    socket.on("chatStarted", () => {
      console.log("✅ Chat started!");
      navigate("/chat"); // Redirect to chat page
    });

    return () => {
      socket.off("chatStarted");
    };
  }, [navigate]);

  const handleStartChat = () => {
    setWaiting(true);
    socket.emit("startChat");
  };

  return (
    <div className="landing-container">
      <div className="landing-content">
        <h1 className="landing-title">Random Chat</h1>
        <p className="landing-description">
          Connect with strangers and have meaningful conversations.
        </p>
        <button
          className={`start-button ${waiting ? "waiting" : ""}`}
          onClick={handleStartChat}
          disabled={waiting}
        >
          {waiting ? (
            <>
              <span className="spinner"></span>
              Waiting for Partner...
            </>
          ) : (
            "Start Chatting"
          )}
        </button>
      </div>
    </div>
  );
};

export default LandingPage;

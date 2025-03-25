import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import process from "process";

const app = express();
app.use(cors()); // Allow all origins

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  // Add reconnection settings
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

let waitingUsers = [];
let activeChats = new Map(); // Track active chats by socket ID

// Add error handling middleware
app.use((err, req, res) => {
  console.error("Express error:", err);
  res.status(500).send("Server error");
});

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Handle connection errors
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
    socket.emit("error", "Connection error occurred");
  });

  socket.on("startChat", () => {
    try {
      console.log(`🔵 User ready to chat: ${socket.id}`);

      // If user is already in a chat, don't add them to waiting
      if (activeChats.has(socket.id)) {
        console.log(`User ${socket.id} is already in a chat`);
        return;
      }

      if (waitingUsers.length > 0) {
        // Ensure we don't pair with ourselves
        const partnerIndex = waitingUsers.findIndex((s) => s.id !== socket.id);

        if (partnerIndex === -1) {
          waitingUsers.push(socket);
          return;
        }

        // Pair with the first user in the queue
        const partnerSocket = waitingUsers.splice(partnerIndex, 1)[0];

        // Double check that both sockets are still connected
        if (!io.sockets.sockets.has(partnerSocket.id)) {
          console.log(`Partner socket ${partnerSocket.id} no longer connected`);
          waitingUsers.push(socket);
          return;
        }

        socket.partner = partnerSocket;
        partnerSocket.partner = socket;

        console.log(`🤝 Partner found: ${socket.id} <-> ${partnerSocket.id}`);

        // Store the chat pair
        activeChats.set(socket.id, partnerSocket.id);
        activeChats.set(partnerSocket.id, socket.id);

        // Notify both users that chat has started
        console.log(
          `🚀 Emitting 'chatStarted' to ${socket.id} and ${partnerSocket.id}`
        );
        socket.emit("chatStarted");
        partnerSocket.emit("chatStarted");
      } else {
        // No users available, add to waiting queue
        waitingUsers.push(socket);
        console.log(
          `🟡 Waiting users:`,
          waitingUsers.map((s) => s.id)
        );
      }
    } catch (error) {
      console.error("Error in startChat:", error);
      socket.emit("error", "Failed to start chat. Please try again.");
    }
  });

  // Handle when a user is ready in the chat page
  socket.on("chatReady", () => {
    try {
      console.log(`🔵 User ready in chat page: ${socket.id}`);

      // Check if the socket is part of an active chat
      const partnerId = activeChats.get(socket.id);
      if (partnerId) {
        const partnerSocket = io.sockets.sockets.get(partnerId);

        if (partnerSocket) {
          // Reassign partner references in case they were lost
          socket.partner = partnerSocket;
          partnerSocket.partner = socket;

          // Emit partner_found event to both users
          socket.emit("partner_found");
          partnerSocket.emit("partner_found");
        } else {
          // Partner socket no longer exists, clean up
          console.log(`Partner socket ${partnerId} no longer exists`);
          activeChats.delete(socket.id);
          activeChats.delete(partnerId);
          socket.emit("partner_disconnected");
        }
      } else if (socket.partner) {
        // Emit partner_found event to both users
        socket.emit("partner_found");
        socket.partner.emit("partner_found");
      }
    } catch (error) {
      console.error("Error in chatReady:", error);
      socket.emit("error", "Failed to initialize chat. Please try again.");
    }
  });

  // Handle messaging with acknowledgment
  socket.on("message", (msg, callback) => {
    try {
      // Validate message
      if (!msg || typeof msg.text !== "string") {
        console.error(`Invalid message format from ${socket.id}:`, msg);
        if (callback) callback({ error: "Invalid message format" });
        return;
      }

      if (socket.partner && io.sockets.sockets.has(socket.partner.id)) {
        console.log(
          `📩 Message from ${socket.id} to ${socket.partner.id}:`,
          msg
        );
        socket.partner.emit("message", msg);
        if (callback) callback({ success: true });
      } else {
        console.log(`⚠️ Message received but no partner:`, msg);
        if (callback) callback({ error: "Partner not found" });
      }
    } catch (error) {
      console.error("Error in message handling:", error);
      if (callback) callback({ error: "Failed to send message" });
    }
  });

  // Typing indicator
  socket.on("typing", () => {
    try {
      if (socket.partner && io.sockets.sockets.has(socket.partner.id)) {
        socket.partner.emit("typing");
      }
    } catch (error) {
      console.error("Error in typing indicator:", error);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    try {
      console.log(`❌ User disconnected: ${socket.id}`);

      // Remove from queue if they disconnect before getting a partner
      waitingUsers = waitingUsers.filter((s) => s !== socket);

      // Notify partner if they had one
      const partnerId = activeChats.get(socket.id);
      if (partnerId) {
        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket) {
          console.log(`⚠️ Notifying ${partnerId} that partner disconnected`);
          partnerSocket.emit("partner_disconnected");
          partnerSocket.partner = null;
        }
      } else if (socket.partner && io.sockets.sockets.has(socket.partner.id)) {
        console.log(
          `⚠️ Notifying ${socket.partner.id} that partner disconnected`
        );
        socket.partner.emit("partner_disconnected");
        socket.partner.partner = null;
      }

      // Clean up chat mappings
      activeChats.delete(socket.id);

      // Implement periodic cleanup of stale connections
      cleanupStaleConnections();
    } catch (error) {
      console.error("Error in disconnect handling:", error);
    }
  });
});

// Function to clean up stale connections
function cleanupStaleConnections() {
  try {
    // Check for any stale connections in the active chats map
    for (const [socketId] of activeChats.entries()) {
      if (!io.sockets.sockets.has(socketId)) {
        console.log(`Cleaning up stale connection: ${socketId}`);
        activeChats.delete(socketId);
      }
    }

    // Clean up waiting users that are no longer connected
    waitingUsers = waitingUsers.filter((socket) => {
      if (!io.sockets.sockets.has(socket.id)) {
        console.log(
          `Removing disconnected user from waiting list: ${socket.id}`
        );
        return false;
      }
      return true;
    });
  } catch (error) {
    console.error("Error in cleanup:", error);
  }
}

// Periodic cleanup every 5 minutes
setInterval(cleanupStaleConnections, 5 * 60 * 1000);

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
});

// Start the server with error handling
const PORT = process.env.PORT || 3000;
try {
  server.listen(PORT, () => console.log("🚀 Server running on port 3000"));
} catch (error) {
  console.error("Failed to start server:", error);
}

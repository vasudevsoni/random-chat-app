import { io } from "socket.io-client";
const socket = io("https://random-chat-app-production.up.railway.app", {
  transports: ["websocket"],
});
export default socket;

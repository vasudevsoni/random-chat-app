import { io } from "socket.io-client";
const socket = io("https://random-chat-app.railway.app/");
export default socket;

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

const app = new Hono();

// Enable CORS for frontend
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.text('WebRTC Signaling Server');
});

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const request = new Request(url.toString(), {
    method: req.method,
    headers: req.headers as HeadersInit,
  });
  
  const response = await app.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value);
  });
  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
});

// WebSocket server for signaling
const wss = new WebSocketServer({ server, path: '/signal' });

// Store rooms with their connected clients
interface Client {
  ws: WebSocket;
  room: string;
  id: string;
}

const rooms = new Map<string, Map<string, Client>>();

wss.on('connection', (ws: WebSocket) => {
  console.log('New WebSocket connection');
  
  let clientId: string | null = null;
  let currentRoom: string | null = null;

  ws.on('message', (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data.type, data);

      switch (data.type) {
        case 'join':
          // Join a room based on passphrase
          const room = data.room;
          const newClientId = data.id;
          clientId = newClientId;
          currentRoom = room;

          if (!rooms.has(room)) {
            rooms.set(room, new Map());
          }

          const roomClients = rooms.get(room)!;
          roomClients.set(newClientId, { ws, room, id: newClientId });

          console.log(`Client ${newClientId} joined room ${room}. Total in room: ${roomClients.size}`);

          // Notify other clients in the room
          roomClients.forEach((client) => {
            if (client.id !== newClientId) {
              client.ws.send(JSON.stringify({
                type: 'user-joined',
                userId: newClientId,
              }));
            }
          });

          // Send current users to the new client
          const existingUsers = Array.from(roomClients.keys()).filter(id => id !== newClientId);
          ws.send(JSON.stringify({
            type: 'room-users',
            users: existingUsers,
          }));
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Forward signaling messages to specific user
          const targetRoom = rooms.get(currentRoom || '');
          if (targetRoom) {
            const targetClient = targetRoom.get(data.targetId);
            if (targetClient) {
              targetClient.ws.send(JSON.stringify({
                ...data,
                fromId: clientId,
              }));
            }
          }
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    
    if (currentRoom && clientId) {
      const roomClients = rooms.get(currentRoom);
      if (roomClients) {
        roomClients.delete(clientId);
        
        // Notify other clients
        roomClients.forEach((client) => {
          client.ws.send(JSON.stringify({
            type: 'user-left',
            userId: clientId,
          }));
        });

        // Clean up empty rooms
        if (roomClients.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const port = 3001;
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`WebSocket signaling on ws://localhost:${port}/signal`);
});

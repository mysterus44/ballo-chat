const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- API ROUTES ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username et password requis' });
  }
  try {
    const user = await db.registerUser(username, password);
    res.json({ success: true, user });
    // Notifier tous qu'un nouvel user existe
    const allUsers = await db.getAllUsers();
    io.emit('users update', allUsers);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: "Ce nom d'utilisateur existe déjà" });
    } else {
      res.status(500).json({ error: "Erreur serveur lors de l'inscription" });
    }
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.authenticateUser(username, password);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'Identifiants incorrects' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

app.put('/api/profile', async (req, res) => {
  const { userId, newUsername, newColor } = req.body;
  try {
    const updatedUser = await db.updateProfile(userId, newUsername, newColor);
    res.json({ success: true, user: updatedUser });
    const allUsers = await db.getAllUsers();
    io.emit('users update', allUsers);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: "Ce pseudo est déjà pris" });
    } else {
      res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
  }
});

// --- SOCKET.IO ---
const connectedUsers = new Map(); // socket.id -> userId
const userSockets = new Map(); // userId -> Set of socket.ids

io.on('connection', (socket) => {

  socket.on('user connected', async (user) => {
    connectedUsers.set(socket.id, user.id);
    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(socket.id);
    
    // Join a room specifically for this user to receive private messages
    socket.join(`user_${user.id}`);
    
    // Diffuser le statut en ligne
    io.emit('user status', { userId: user.id, online: true });
    
    const users = await db.getAllUsers();
    // Identifier qui est en ligne
    const onlineUserIds = Array.from(userSockets.keys());
    socket.emit('users update', users, onlineUserIds);
  });

  socket.on('fetch messages', async (peerId) => {
    const userId = connectedUsers.get(socket.id);
    if (userId && peerId) {
      const history = await db.getPrivateMessages(userId, peerId);
      socket.emit('chat history', history, peerId);
      
      // Marquer les messages reçus de ce peer comme "lus"
      await db.updateMessageStatus(peerId, userId, 'read');
      io.to(`user_${peerId}`).emit('messages read', { byUserId: userId });
    }
  });

  socket.on('chat message', async (data) => {
    // data = { receiverId, content }
    const senderId = connectedUsers.get(socket.id);
    if (senderId && data.receiverId) {
      try {
        const msgId = await db.saveMessage(senderId, data.receiverId, data.content);
        const sender = await db.getAllUsers().then(users => users.find(u => u.id === senderId));
        
        // Statut par défaut
        let status = 'sent';
        // Si le receiver est en ligne, on peut le marquer 'delivered'
        if (userSockets.has(data.receiverId) && userSockets.get(data.receiverId).size > 0) {
           status = 'delivered';
           await db.updateMessageStatus(senderId, data.receiverId, 'delivered');
        }

        const messageData = {
          id: msgId,
          sender_id: senderId,
          receiver_id: data.receiverId,
          username: sender.username,
          color: sender.color,
          avatar: sender.avatar,
          content: data.content,
          status: status,
          timestamp: new Date().toISOString()
        };
        
        // Send to receiver
        io.to(`user_${data.receiverId}`).emit('chat message', messageData);
        // Send back to sender
        io.to(`user_${senderId}`).emit('chat message', messageData);

      } catch (err) {
        console.error('Erreur saveMessage', err);
      }
    }
  });

  socket.on('message read', async (senderIdOfMessage) => {
    const readerId = connectedUsers.get(socket.id);
    if (readerId && senderIdOfMessage) {
      await db.updateMessageStatus(senderIdOfMessage, readerId, 'read');
      io.to(`user_${senderIdOfMessage}`).emit('messages read', { byUserId: readerId });
    }
  });

  socket.on('typing', (data) => {
    // data = { receiverId, isTyping }
    const senderId = connectedUsers.get(socket.id);
    if (senderId && data.receiverId) {
      io.to(`user_${data.receiverId}`).emit('user typing', { 
        userId: senderId, 
        isTypingStatus: data.isTyping 
      });
    }
  });

  socket.on('disconnect', () => {
    const userId = connectedUsers.get(socket.id);
    if (userId) {
      connectedUsers.delete(socket.id);
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          io.emit('user status', { userId: userId, online: false });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});

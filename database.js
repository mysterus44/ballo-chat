const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'database.json');

// Initialisation du fichier JSON
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], messages: [] }, null, 2));
  console.log('Fichier de base de données JSON créé.');
} else {
  console.log('Connecté à la base de données JSON.');
}

const readDB = () => {
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const registerUser = async (username, password) => {
  const db = readDB();
  if (db.users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }
  const hash = await bcrypt.hash(password, 10);
  const colors = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#f43f5e'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const avatar = username.charAt(0).toUpperCase();
  const id = db.users.length > 0 ? db.users[db.users.length - 1].id + 1 : 1;
  
  const newUser = { id, username, password_hash: hash, color, avatar };
  db.users.push(newUser);
  writeDB(db);
  
  return { id, username, color, avatar };
};

const authenticateUser = async (username, password) => {
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user) return null;
  
  const match = await bcrypt.compare(password, user.password_hash);
  if (match) {
    return { id: user.id, username: user.username, color: user.color, avatar: user.avatar };
  }
  return null;
};

const saveMessage = async (senderId, receiverId, content) => {
  const db = readDB();
  const id = db.messages.length > 0 ? db.messages[db.messages.length - 1].id + 1 : 1;
  const newMessage = {
    id,
    sender_id: senderId,
    receiver_id: receiverId,
    content,
    status: 'sent',
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
  };
  db.messages.push(newMessage);
  writeDB(db);
  return id;
};

const getPrivateMessages = async (user1Id, user2Id, limit = 100) => {
  const db = readDB();
  const messages = db.messages.filter(m => 
    (m.sender_id === user1Id && m.receiver_id === user2Id) ||
    (m.sender_id === user2Id && m.receiver_id === user1Id)
  );
  
  // Tri par date
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Limiter le nombre
  const limitedMessages = messages.slice(-limit);
  
  // Formater la sortie comme SQLite le faisait
  return limitedMessages.map(m => {
    const sender = db.users.find(u => u.id === m.sender_id);
    return {
      id: m.id,
      content: m.content,
      timestamp: m.timestamp,
      status: m.status,
      sender_username: sender ? sender.username : 'Unknown',
      sender_color: sender ? sender.color : '#000',
      sender_avatar: sender ? sender.avatar : '?',
      sender_id: m.sender_id,
      receiver_id: m.receiver_id
    };
  });
};

const updateMessageStatus = async (senderId, receiverId, status) => {
  const db = readDB();
  let changes = 0;
  for (let m of db.messages) {
    if (m.sender_id === senderId && m.receiver_id === receiverId && m.status !== 'read') {
      m.status = status;
      changes++;
    }
  }
  if (changes > 0) writeDB(db);
  return changes;
};

const getAllUsers = async () => {
  const db = readDB();
  return db.users.map(u => ({ id: u.id, username: u.username, color: u.color, avatar: u.avatar }));
};

const updateProfile = async (userId, newUsername, newColor) => {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');
  
  user.username = newUsername;
  user.color = newColor;
  user.avatar = newUsername.charAt(0).toUpperCase();
  writeDB(db);
  
  return { id: user.id, username: user.username, color: user.color, avatar: user.avatar };
};

module.exports = {
  db: null,
  registerUser,
  authenticateUser,
  saveMessage,
  getPrivateMessages,
  updateMessageStatus,
  getAllUsers,
  updateProfile
};

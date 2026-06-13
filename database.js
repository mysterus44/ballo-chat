const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur lors de la connexion à la base de données SQLite:', err.message);
  } else {
    console.log('Connecté à la base de données SQLite.');
  }
});

// Initialisation des tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      color TEXT NOT NULL,
      avatar TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read'
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sender_id) REFERENCES users(id),
      FOREIGN KEY(receiver_id) REFERENCES users(id)
    )
  `);
});

// Fonctions Helper
const registerUser = async (username, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      const hash = await bcrypt.hash(password, 10);
      const colors = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#f43f5e'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const avatar = username.charAt(0).toUpperCase();

      db.run(`INSERT INTO users (username, password_hash, color, avatar) VALUES (?, ?, ?, ?)`, 
        [username, hash, color, avatar], 
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, username, color, avatar });
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
};

const authenticateUser = async (username, password) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
      if (err) reject(err);
      if (!row) return resolve(null);
      
      const match = await bcrypt.compare(password, row.password_hash);
      if (match) {
        resolve({ id: row.id, username: row.username, color: row.color, avatar: row.avatar });
      } else {
        resolve(null);
      }
    });
  });
};

const saveMessage = (senderId, receiverId, content) => {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)`, 
      [senderId, receiverId, content], 
      function(err) {
        if (err) reject(err);
        resolve(this.lastID);
      }
    );
  });
};

const getPrivateMessages = (user1Id, user2Id, limit = 100) => {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT messages.id, messages.content, messages.timestamp, messages.status, 
             u_sender.username as sender_username, u_sender.color as sender_color, u_sender.avatar as sender_avatar, messages.sender_id,
             u_receiver.id as receiver_id
      FROM messages
      JOIN users AS u_sender ON messages.sender_id = u_sender.id
      JOIN users AS u_receiver ON messages.receiver_id = u_receiver.id
      WHERE (messages.sender_id = ? AND messages.receiver_id = ?)
         OR (messages.sender_id = ? AND messages.receiver_id = ?)
      ORDER BY messages.timestamp ASC
      LIMIT ?
    `, [user1Id, user2Id, user2Id, user1Id, limit], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

const updateMessageStatus = (senderId, receiverId, status) => {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE messages SET status = ? WHERE sender_id = ? AND receiver_id = ? AND status != 'read'`,
      [status, senderId, receiverId],
      function(err) {
        if (err) reject(err);
        resolve(this.changes);
      }
    );
  });
};

const getAllUsers = () => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT id, username, color, avatar FROM users`, [], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });
};

const updateProfile = (userId, newUsername, newColor) => {
  return new Promise((resolve, reject) => {
    const avatar = newUsername.charAt(0).toUpperCase();
    db.run(`UPDATE users SET username = ?, color = ?, avatar = ? WHERE id = ?`,
      [newUsername, newColor, avatar, userId],
      function(err) {
        if (err) reject(err);
        resolve({ id: userId, username: newUsername, color: newColor, avatar });
      }
    );
  });
}

module.exports = {
  db,
  registerUser,
  authenticateUser,
  saveMessage,
  getPrivateMessages,
  updateMessageStatus,
  getAllUsers,
  updateProfile
};

/**
 * ═══════════════════════════════════════════════════════════════
 * BALLO CHAT — CORE LOGIC & SOCKET.IO (V2: Private Messaging)
 * Créé par : KINGKOUDA
 * ═══════════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Elements ---
  const appWrapper = document.getElementById('app');
  const authModal = document.getElementById('auth-modal');
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const authError = document.getElementById('auth-error');

  const profileModal = document.getElementById('profile-modal');
  const profileForm = document.getElementById('profile-form');
  const editUsernameInput = document.getElementById('edit-username');
  const editColorInput = document.getElementById('edit-color');
  const profileError = document.getElementById('profile-error');
  const closeProfileBtn = document.getElementById('close-profile-btn');
  const settingsBtn = document.getElementById('settings-btn');

  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const chatMessages = document.getElementById('chat-messages');
  const chatBody = document.getElementById('chat-body');
  const typingIndicator = document.getElementById('typing-indicator');
  const contactsList = document.getElementById('contacts-list');
  const peerNameEl = document.getElementById('peer-name');
  const peerStatusEl = document.getElementById('peer-status');
  const headerAvatarEl = document.getElementById('header-avatar');
  const typingAvatarEl = document.getElementById('typing-avatar');
  const emojiBtn = document.getElementById('emoji-btn');
  const emojiPicker = document.getElementById('emoji-picker');
  const emojiGrid = document.getElementById('emoji-grid');
  const sidebar = document.getElementById('sidebar');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const toastContainer = document.getElementById('toast-container');
  const searchInput = document.getElementById('search-contacts');
  const filterBtns = document.querySelectorAll('.filter-btn');

  // --- State ---
  let isTyping = false;
  let typingTimeout;
  let currentUser = null;
  let socket = null;
  let isLoginMode = true; 
  let currentPeerId = null; // Private messaging target
  let usersList = [];
  let onlineUsers = new Set();
  let currentFilter = 'all';

  // --- Audio ---
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'send') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'receive') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);
    }
  }

  // --- UI Helpers ---
  function scrollToBottom() {
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  function formatTime(dateString) {
    const d = new Date(dateString);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="ph-bold ph-info"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease both';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function getStatusIconHTML(status) {
    if (status === 'sent') return '<i class="ph-bold ph-check msg-status sent"></i>';
    if (status === 'delivered') return '<i class="ph-bold ph-checks msg-status delivered"></i>';
    if (status === 'read') return '<i class="ph-bold ph-checks msg-status read"></i>';
    return '';
  }

  // --- Auth Logic ---
  toggleAuthModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    const toggleP = toggleAuthModeBtn.parentElement;
    
    if (isLoginMode) {
      authTitle.textContent = "Bienvenue sur Ballo Chat";
      authSubtitle.textContent = "Connecte-toi pour continuer";
      authSubmitBtn.textContent = "Connexion";
      toggleP.childNodes[0].nodeValue = "Pas encore de compte ? ";
      toggleAuthModeBtn.textContent = "S'inscrire";
    } else {
      authTitle.textContent = "Créer un compte";
      authSubtitle.textContent = "Rejoins la discussion";
      authSubmitBtn.textContent = "Inscription";
      toggleP.childNodes[0].nodeValue = "Déjà un compte ? ";
      toggleAuthModeBtn.textContent = "Se connecter";
    }
    authError.classList.add('hidden');
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) return;

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "Chargement...";

    const endpoint = isLoginMode ? '/api/login' : '/api/register';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (response.ok) {
        currentUser = data.user;
        initApp();
      } else {
        authError.textContent = data.error || "Une erreur est survenue";
        authError.classList.remove('hidden');
      }
    } catch (err) {
      authError.textContent = "Erreur de connexion au serveur.";
      authError.classList.remove('hidden');
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isLoginMode ? "Connexion" : "Inscription";
    }
  });

  // --- Profile Edit Logic ---
  settingsBtn.addEventListener('click', () => {
    editUsernameInput.value = currentUser.username;
    editColorInput.value = currentUser.color;
    profileError.classList.add('hidden');
    profileModal.classList.remove('hidden');
  });

  closeProfileBtn.addEventListener('click', () => {
    profileModal.classList.add('hidden');
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = editUsernameInput.value.trim();
    const newColor = editColorInput.value;
    
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, newUsername, newColor })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        updateMyProfileUI();
        profileModal.classList.add('hidden');
        showToast("Profil mis à jour !");
      } else {
        profileError.textContent = data.error;
        profileError.classList.remove('hidden');
      }
    } catch(err) {
      profileError.textContent = "Erreur serveur";
      profileError.classList.remove('hidden');
    }
  });

  function updateMyProfileUI() {
    const myProfile = document.querySelector('.my-profile');
    myProfile.innerHTML = `
      <div class="contact-avatar" style="--avatar-color:${currentUser.color}">${currentUser.avatar}</div>
      <div class="contact-info">
        <span class="contact-name">${escapeHTML(currentUser.username)}</span>
        <span class="contact-preview">En ligne</span>
      </div>
    `;
  }

  // --- Render Contacts ---
  function renderContacts() {
    contactsList.innerHTML = '';
    const term = searchInput.value.toLowerCase();
    
    usersList.forEach(u => {
      if (u.id === currentUser.id) return;
      const isOnline = onlineUsers.has(u.id);
      
      // Filtres
      if (currentFilter === 'online' && !isOnline) return;
      if (currentFilter === 'offline' && isOnline) return;
      if (term && !u.username.toLowerCase().includes(term)) return;

      const item = document.createElement('div');
      item.className = 'contact-item' + (currentPeerId === u.id ? ' active' : '');
      item.dataset.id = u.id;
      
      const badgeClass = isOnline ? 'online' : 'offline';
      const statusText = isOnline ? 'En ligne' : 'Hors ligne';

      item.innerHTML = `
        <div class="contact-avatar" style="--avatar-color:${u.color}">${u.avatar}</div>
        <div class="contact-info">
          <span class="contact-name">${escapeHTML(u.username)}</span>
          <span class="contact-preview">${statusText}</span>
        </div>
        <span class="contact-badge ${badgeClass}"></span>
      `;

      item.addEventListener('click', () => {
        document.querySelectorAll('.contact-item').forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        
        currentPeerId = u.id;
        peerNameEl.textContent = u.username;
        headerAvatarEl.textContent = u.avatar;
        headerAvatarEl.style.setProperty('--avatar-color', u.color);
        typingAvatarEl.textContent = u.avatar;
        typingAvatarEl.style.setProperty('--avatar-color', u.color);
        
        // Hide welcome overlay and show chat UI
        document.getElementById('welcome-overlay').classList.add('hidden');
        document.getElementById('chat-header').classList.remove('hidden');
        document.getElementById('chat-body').classList.remove('hidden');
        document.getElementById('chat-footer').classList.remove('hidden');
        
        if (isOnline) {
          peerStatusEl.innerHTML = `<span class="status-dot online"></span> En ligne`;
        } else {
          peerStatusEl.innerHTML = `<span class="status-dot offline"></span> Hors ligne`;
        }

        chatMessages.innerHTML = '';
        messageInput.disabled = false;
        
        // Fetch history
        socket.emit('fetch messages', currentPeerId);

        if (window.innerWidth <= 768) {
          toggleMobileSidebar();
        }
      });

      contactsList.appendChild(item);
    });
  }

  // --- Filtres ---
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderContacts();
    });
  });

  searchInput.addEventListener('input', renderContacts);

  // --- Initialiser l'application (Post-Login) ---
  function initApp() {
    authModal.classList.add('hidden');
    appWrapper.classList.remove('hidden');
    updateMyProfileUI();
    
    // Personalize welcome text
    document.getElementById('welcome-title').textContent = `Bienvenue ${currentUser.username} !`;
    
    // Connecter Socket.IO
    socket = io();
    socket.emit('user connected', currentUser);

    socket.on('users update', (users, onlineIds = []) => {
      usersList = users;
      onlineUsers = new Set(onlineIds);
      renderContacts();
      
      // Update header status if a peer is selected
      if (currentPeerId) {
        const isOnline = onlineUsers.has(currentPeerId);
        peerStatusEl.innerHTML = isOnline 
          ? `<span class="status-dot online"></span> En ligne`
          : `<span class="status-dot offline"></span> Hors ligne`;
      }
    });

    socket.on('user status', (data) => {
      if (data.online) onlineUsers.add(data.userId);
      else onlineUsers.delete(data.userId);
      renderContacts();
      
      if (currentPeerId === data.userId) {
        peerStatusEl.innerHTML = data.online 
          ? `<span class="status-dot online"></span> En ligne`
          : `<span class="status-dot offline"></span> Hors ligne`;
      }
    });

    socket.on('chat history', (messages, peerId) => {
      if (peerId !== currentPeerId) return;
      
      chatMessages.innerHTML = `<div class="date-separator"><span>Historique de discussion</span></div>`;
      messages.forEach(msg => {
        appendMessageUI(msg);
      });
      scrollToBottom();
    });

    socket.on('chat message', (msg) => {
      // Is it relevant to current chat?
      if (
        (msg.sender_id === currentPeerId && msg.receiver_id === currentUser.id) ||
        (msg.sender_id === currentUser.id && msg.receiver_id === currentPeerId)
      ) {
        appendMessageUI(msg);
        scrollToBottom();
        
        // If I am the receiver and I have this chat open, send read receipt
        if (msg.sender_id === currentPeerId) {
          socket.emit('message read', currentPeerId);
          playSound('receive');
        } else {
          playSound('send');
        }
      } else if (msg.receiver_id === currentUser.id) {
        // Notification for other chats
        showToast(`Nouveau message de ${msg.username}`);
        playSound('receive');
      }
    });

    // When peer reads my messages
    socket.on('messages read', (data) => {
      if (data.byUserId === currentPeerId) {
        // Update all my sent messages in the current view to 'read'
        document.querySelectorAll('.message.sent .msg-status').forEach(icon => {
          icon.className = 'ph-bold ph-checks msg-status read';
        });
      }
    });

    socket.on('user typing', (data) => {
      if (data.userId === currentPeerId) {
        if (data.isTypingStatus) {
          document.querySelector('.typing-label').textContent = peerNameEl.textContent + " est en train d'écrire…";
          typingIndicator.classList.remove('hidden');
        } else {
          typingIndicator.classList.add('hidden');
        }
        scrollToBottom();
      }
    });
    
    showToast("Connecté au serveur ⚡");
  }

  function appendMessageUI(msg) {
    const isSent = msg.sender_id === currentUser.id;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isSent ? 'sent' : 'received'} animate-in`;
    const time = formatTime(msg.timestamp);
    
    if (isSent) {
      const statusIcon = getStatusIconHTML(msg.status);
      msgDiv.innerHTML = `
        <div class="msg-content">
          <p class="msg-text">${escapeHTML(msg.content)}</p>
          <span class="msg-time">${time} ${statusIcon}</span>
        </div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div class="msg-avatar" style="--avatar-color:${msg.color}" title="${escapeHTML(msg.username)}">${msg.avatar}</div>
        <div class="msg-content">
          <p class="msg-text">${escapeHTML(msg.content)}</p>
          <span class="msg-time">${time}</span>
        </div>
      `;
    }
    chatMessages.appendChild(msgDiv);
  }

  // --- Auto Resize Textarea ---
  function autoResizeInput() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
    if (messageInput.value.trim() === '') {
      messageInput.style.height = 'auto';
    }
  }

  messageInput.addEventListener('input', () => {
    autoResizeInput();
    
    if (messageInput.value.trim().length > 0 && currentPeerId) {
      sendButton.disabled = false;
      if (!isTyping) {
        isTyping = true;
        socket?.emit('typing', { receiverId: currentPeerId, isTyping: true });
      }
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        socket?.emit('typing', { receiverId: currentPeerId, isTyping: false });
      }, 1500);
    } else {
      sendButton.disabled = true;
    }
  });

  // --- Send Message ---
  function handleSend() {
    const text = messageInput.value.trim();
    if (!text || !socket || !currentPeerId) return;

    socket.emit('chat message', { receiverId: currentPeerId, content: text });
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    messageInput.focus();
    sendButton.disabled = true;
    emojiPicker.classList.add('hidden');
    
    isTyping = false;
    socket.emit('typing', { receiverId: currentPeerId, isTyping: false });
  }

  sendButton.addEventListener('click', handleSend);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // --- Emoji Picker ---
  const commonEmojis = ['😀','😂','🥰','😎','🤔','🙌','👍','🔥','🚀','✨','🎉','❤️','👀','💯','✅','👋'];
  commonEmojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn-item';
    btn.textContent = emoji;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      messageInput.value += emoji;
      messageInput.focus();
      autoResizeInput();
      sendButton.disabled = false;
    });
    emojiGrid.appendChild(btn);
  });

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.add('hidden');
    }
  });

  // --- Mobile Sidebar Overlay ---
  const sidebarOverlay = document.createElement('div');
  sidebarOverlay.className = 'sidebar-overlay';
  document.body.appendChild(sidebarOverlay);

  function toggleMobileSidebar() {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('show');
  }

  mobileMenuBtn.addEventListener('click', toggleMobileSidebar);
  sidebarOverlay.addEventListener('click', toggleMobileSidebar);
  toggleSidebarBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      toggleMobileSidebar();
    }
  });

  // Init UI
  messageInput.disabled = true; // Disabled until a peer is selected
  sendButton.disabled = true;
});
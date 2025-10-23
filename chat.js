// Socket.IO setup (allow your frontend origin)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5176",
    methods: ["GET", "POST"]
  }
});



// .............................................................................................

// Get all users (frontend filters out current user locally)
    app.get("/users", async (req, res) => {
      try {
        const users = await collectionUsers.find({})
          .project({
            uid: 1,
            displayName: 1,
            email: 1,
            photoURL: 1
            // NOTE: removed bio as requested
          })
          .toArray();
        res.send(users);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // Search users by query - not used by your current frontend but handy
    app.get("/users/search/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const q = req.query.q || '';
        if (!q) return res.status(400).send({ error: "Search query required" });

        const users = await collectionUsers.find({
          uid: { $ne: uid },
          $or: [
            { displayName: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } }
          ]
        }).project({ uid: 1, displayName: 1, email: 1, photoURL: 1 }).limit(20).toArray();

        res.send(users);
      } catch (err) {
        console.error("Failed to search users:", err);
        res.status(500).send({ error: "Failed to search users" });
      }
    });

    // Get messages between two users (frontend calls /messages/:userId1/:userId2)
    app.get("/messages/:userId1/:userId2", async (req, res) => {
      try {
        const { userId1, userId2 } = req.params;
        const messages = await collectionMessages.find({
          $or: [
            { senderId: userId1, receiverId: userId2 },
            { senderId: userId2, receiverId: userId1 }
          ]
        }).sort({ createdAt: 1 }).toArray();
        res.send(messages);
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        res.status(500).send({ error: "Failed to fetch messages" });
      }
    });

    // Mark messages read (keeps same route semantics)
    app.put("/messages/read", async (req, res) => {
      try {
        const { userId, otherUserId } = req.body;
        if (!userId || !otherUserId) return res.status(400).send({ error: "userId and otherUserId required" });

        await collectionMessages.updateMany(
          { senderId: otherUserId, receiverId: userId, isRead: false },
          { $set: { isRead: true, readAt: new Date() } }
        );

        res.send({ success: true });
      } catch (err) {
        console.error("Failed to mark messages as read:", err);
        res.status(500).send({ error: "Failed to mark messages as read" });
      }
    });

    // conversations endpoint similar to earlier code
    app.get("/conversations/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const conversations = await collectionMessages.aggregate([
          { $match: { $or: [{ senderId: uid }, { receiverId: uid }] } },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: {
                $cond: [{ $eq: ["$senderId", uid] }, "$receiverId", "$senderId"]
              },
              lastMessage: { $first: "$$ROOT" },
              unreadCount: {
                $sum: {
                  $cond: [{ $and: [{ $eq: ["$receiverId", uid] }, { $eq: ["$isRead", false] }] }, 1, 0]
                }
              }
            }
          },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "uid",
              as: "user"
            }
          },
          { $unwind: "$user" },
          {
            $project: {
              "user.uid": 1,
              "user.displayName": 1,
              "user.photoURL": 1,
              "user.email": 1,
              lastMessage: 1,
              unreadCount: 1
            }
          }
        ]).toArray();
        res.send(conversations);
      } catch (err) {
        console.error("Failed to fetch conversations:", err);
        res.status(500).send({ error: "Failed to fetch conversations" });
      }
    });

    // -------------------------
    // Socket.IO real-time chat
    // -------------------------
    const connectedUsers = new Map();

    io.on('connection', (socket) => {
      console.log('Socket connected:', socket.id);

      // When client notifies server of logged-in user
      socket.on('user_connected', (userId) => {
        if (!userId) return;
        connectedUsers.set(userId, socket.id);

        // Broadcast to others that this user is online
        socket.broadcast.emit('user_online', userId);
        console.log(`User ${userId} connected as socket ${socket.id}`);
      });

      // Sending a message
      socket.on('send_message', async (data) => {
        try {
          // normalize / ensure fields (senderId, receiverId required)
          const messageData = {
            senderId: data.senderId,
            receiverId: data.receiverId,
            text: data.text ?? undefined,
            image: data.image ?? undefined,
            isRead: false,
            createdAt: new Date()
          };

          const result = await collectionMessages.insertOne(messageData);
          const savedMessage = { ...messageData, _id: result.insertedId };

          // Emit to receiver if online
          const receiverSocketId = connectedUsers.get(data.receiverId);
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', savedMessage);
          }

          // Confirmation to sender
          socket.emit('message_sent', savedMessage);

          console.log(`Message saved from ${data.senderId} to ${data.receiverId}`);
        } catch (err) {
          console.error("Failed to send message:", err);
          socket.emit('message_error', { error: 'Failed to send message' });
        }
      });

      socket.on('send_message', async (data) => {
  try {
    // normalize / ensure fields
    const messageData = {
      senderId: data.senderId,
      receiverId: data.receiverId,
      text: data.text ?? undefined,
      image: data.image ?? undefined,
      isRead: false,
      createdAt: new Date()
    };

    // Save message in DB
    const result = await collectionMessages.insertOne(messageData);
    const savedMessage = { ...messageData, _id: result.insertedId };

    // Emit to receiver if online
    const receiverSocketId = connectedUsers.get(data.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', savedMessage);
    }

    // Confirmation back to sender
    socket.emit('message_sent', savedMessage);

    console.log(`Message saved from ${data.senderId} to ${data.receiverId}`);

    
  } catch (err) {
    console.error("Failed to send message:", err);
    socket.emit('message_error', { error: 'Failed to send message' });
  }
});

      // Typing indicator
      socket.on('typing_start', (data) => {
        const receiverSocketId = connectedUsers.get(data.receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('user_typing', { senderId: data.senderId, isTyping: true });
        }
      });

      socket.on('typing_stop', (data) => {
        const receiverSocketId = connectedUsers.get(data.receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('user_typing', { senderId: data.senderId, isTyping: false });
        }
      });

      // Mark messages read via socket
      socket.on('mark_messages_read', async (data) => {
        try {
          const { userId, otherUserId } = data;
          await collectionMessages.updateMany(
            { senderId: otherUserId, receiverId: userId, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
          );

          


          const otherUserSocketId = connectedUsers.get(otherUserId);
          if (otherUserSocketId) {
            io.to(otherUserSocketId).emit('messages_read', { readerId: userId });
          }
        } catch (err) {
          console.error("Failed to mark messages read via socket:", err);
        }
      });

      // Disconnect handling
      socket.on('disconnect', () => {
        for (const [userId, socketId] of connectedUsers.entries()) {
          if (socketId === socket.id) {
            connectedUsers.delete(userId);
            socket.broadcast.emit('user_offline', userId);
            console.log(`User ${userId} disconnected`);
            break;
          }
        }
      });
    });
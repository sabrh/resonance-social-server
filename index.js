const express = require("express");
const cors = require("cors");
const multer = require("multer");
const app = express();
const server = http.createServer(app);
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import { Server } from "socket.io";


app.use(cors());
app.use(express.json());

// Multer setup (memory storage for now)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize socket.io server
const io = new Server(server, {
  cors: {origin: "*"}
})

// Store online users
const userSocketMap = {};

// Socket.io connection handler
io.on("connection", (socket)=>{
  const userId = socket.handshake.query.userId;
  console.log("User Connected", userId);

  if(userId) userSocketMap[userId] = socket.id;

  //Emit online users to all connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap))

  socket.on("disconnect", ()=>{
    console.log("User Disconnected", userId);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap))
  })
})

// for Ai

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qk8emwu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Root route
app.get("/", (req, res) => {
  res.send("Resonance server is working");
});

async function run() {
  try {
    // await client.connect();
    console.log("Connected to MongoDB successfully!");

    const collectionUsers = client.db("createPostDB").collection("users");
    const collectionPost = client.db("createPostDB").collection("createPost");
    const collectionNotifications = client.db("createPostDB").collection("notifications"); 
    const collectionStory = client.db("createStoryDB").collection("story");

    // delete story auto

  //  await collectionStory.createIndex({ time: 1 }, { expireAfterSeconds: 86400 });

    // NEW: Notifications collection

   

    // ============================
    // Helper Functions
    // ============================

    // Generate notification message
    function generateNotificationMessage(type, senderName, commentText = "") {
      switch (type) {
        case 'like':
          return `${senderName} liked your post`;
        case 'comment':
          return `${senderName} commented on your post`;
        case 'reply':
          return `${senderName} replied to your comment`;
        default:
          return `${senderName} interacted with your post`;
      }
    }

    // Create notification function
    async function createNotification(notificationData) {
      try {
        const {
          recipientId,
          senderId,
          senderName,
          senderPhoto,
          postId,
          postText,
          type,
          commentText
        } = notificationData;

        // Don't create notification if user is interacting with their own post
        if (recipientId === senderId) return;

        const message = generateNotificationMessage(type, senderName, commentText);

        const notification = {
          recipientId,
          senderId,
          senderName,
          senderPhoto,
          postId,
          postText: postText ? postText.substring(0, 100) : "",
          type,
          message,
          commentText: commentText || "",
          isRead: false,
          createdAt: new Date()
        };

        await collectionNotifications.insertOne(notification);
      } catch (err) {
        console.error("Error creating notification:", err);
      }
    }

    // ============================
    // Users
    // ============================

    // Create user
    app.post("/users", async (req, res) => {
      try {
        const { uid, displayName, email, photoURL } = req.body;
        if (!uid) return res.status(400).send({ error: "uid required" });

        const existing = await collectionUsers.findOne({ uid });
        if (existing) return res.send({ success: true, user: existing });

        const userDoc = {
          uid,
          displayName: displayName || null,
          email: email || null,
          photoURL: photoURL || null,
          banner: null,
          bannerFilename: null,
          bannerMimetype: null,
          followers: [],
          following: [],
          createdAt: new Date(),
          education: null,
          location: null,
          gender: null,
          relationshipStatus: null,
        };

        const result = await collectionUsers.insertOne(userDoc);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "server error" });
      }
    });

    // Get user by uid
    app.get("/users/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const user = await collectionUsers.findOne({ uid });
        if (!user) return res.status(404).send({ error: "User not found" });
        res.send(user);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "server error" });
      }
    });

    // Upload/update banner
    app.post(
      "/users/:uid/banner",
      upload.single("banner"),
      async (req, res) => {
        try {
          const uid = req.params.uid;
          const file = req.file;
          if (!file) return res.status(400).send({ error: "No file uploaded" });

          const bannerBase64 = file.buffer.toString("base64");
          const update = {
            banner: bannerBase64,
            bannerFilename: file.originalname,
            bannerMimetype: file.mimetype,
            updatedAt: new Date(),
          };

          await collectionUsers.updateOne(
            { uid },
            { $set: update },
            { upsert: true }
          );
          res.send({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).send({ error: "upload failed" });
        }
      }
    );

    // Update user details
    app.put("/users/:uid/details", async (req, res) => {
      try {
        const uid = req.params.uid;
        const {
        education,
        location,
        gender,
        relationshipStatus,
        username,
        birthday,
        languages,
        bio,
        occupation,
        company,
        skills,
        socialLinks,
      } = req.body;

        const update = {
        ...(education !== undefined && { education }),
        ...(location !== undefined && { location }),
        ...(gender !== undefined && { gender }),
        ...(relationshipStatus !== undefined && { relationshipStatus }),
        ...(username !== undefined && { username }),
        ...(birthday !== undefined && { birthday }),
        ...(languages !== undefined && { languages }),
        ...(bio !== undefined && { bio }),
        ...(occupation !== undefined && { occupation }),
        ...(company !== undefined && { company }),
        ...(skills !== undefined && { skills }),
        ...(socialLinks !== undefined && { socialLinks }),
        updatedAt: new Date(),
      };

        const result = await collectionUsers.updateOne(
          { uid },
          { $set: update }
        );

        if (result.matchedCount === 0)
          return res.status(404).send({ error: "User not found" });

        res.send({
          success: true,
          message: "User details updated successfully",
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update details" });
      }
    });

    // Follow / Unfollow - FIXED VERSION
    app.put("/users/:targetUid/follow", async (req, res) => {
      try {
        const { targetUid } = req.params;
        const { currentUid } = req.body;

        if (!currentUid) {
          return res.status(400).send({ error: "currentUid required" });
        }

        // Prevent self-follow
        if (targetUid === currentUid) {
          return res.status(400).send({ error: "Cannot follow yourself" });
        }

        const targetUser = await collectionUsers.findOne({ uid: targetUid });
        const currentUser = await collectionUsers.findOne({ uid: currentUid });

        if (!targetUser || !currentUser) {
          return res.status(404).send({ error: "User not found" });
        }

        const isCurrentlyFollowing =
          targetUser.followers?.includes(currentUid) || false;

        if (isCurrentlyFollowing) {
          // UNFOLLOW
          await collectionUsers.updateOne(
            { uid: targetUid },
            { $pull: { followers: currentUid } }
          );
          await collectionUsers.updateOne(
            { uid: currentUid },
            { $pull: { following: targetUid } }
          );
        } else {
          // FOLLOW
          await collectionUsers.updateOne(
            { uid: targetUid },
            {
              $addToSet: { followers: currentUid },
              $set: { updatedAt: new Date() },
            }
          );
          await collectionUsers.updateOne(
            { uid: currentUid },
            {
              $addToSet: { following: targetUid },
              $set: { updatedAt: new Date() },
            }
          );

          // NEW: Create follow notification
          await createNotification({
            recipientId: targetUid,
            senderId: currentUid,
            senderName: currentUser.displayName,
            senderPhoto: currentUser.photoURL,
            postId: null,
            postText: "",
            type: 'follow',
            commentText: ""
          });
        }

        // Get updated counts
        const updatedTarget = await collectionUsers.findOne({ uid: targetUid });
        const updatedCurrent = await collectionUsers.findOne({
          uid: currentUid,
        });

        res.send({
          success: true,
          isFollowing: !isCurrentlyFollowing,
          followersCount: updatedTarget.followers?.length || 0,
          followingCount: updatedCurrent.following?.length || 0,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Follow/unfollow failed" });
      }
    });

    // Newsfeed with proper privacy logic - FIXED VERSION
    app.get("/feed/:uid", async (req, res) => {
      try {
        const { uid } = req.params;

        const currentUser = await collectionUsers.findOne({ uid });
        if (!currentUser)
          return res.status(404).send({ error: "User not found" });

        // Get following list or empty array if none
        const following = currentUser.following || [];

        // Fetch posts with proper privacy logic
        const posts = await collectionPost
          .find({
            $or: [
              { userId: uid }, // User's own posts (all privacy levels)
              {
                userId: { $in: following }, // Following users' posts
                $or: [
                  { privacy: "public" },
                  { privacy: "private" }, // Can see private posts of followed users
                ],
              },
              {
                userId: { $nin: [...following, uid] }, // Non-followed users
                privacy: "public", // Only public posts
              },
            ],
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(posts);
      } catch (err) {
        console.error("Feed error:", err);
        res
          .status(500)
          .send({ error: "Failed to load feed", details: err.message });
      }
    });

    // Profile posts with privacy logic - FIXED VERSION
    app.get("/users/:targetUid/posts", async (req, res) => {
      try {
        const { targetUid } = req.params;
        const { viewerUid } = req.query;

        const targetUser = await collectionUsers.findOne({ uid: targetUid });
        if (!targetUser)
          return res.status(404).send({ error: "User not found" });

        let query = { userId: targetUid }; // Use userId to match your Post schema

        // If viewer is not the target user AND not following, show only public posts
        if (viewerUid && viewerUid !== targetUid) {
          const isFollowing =
            targetUser.followers?.includes(viewerUid) || false;
          if (!isFollowing) {
            query.privacy = "public";
          }
        }

        const userPosts = await collectionPost
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(userPosts);
      } catch (err) {
        console.error("Profile posts error:", err);
        res.status(500).send({
          error: "Failed to load profile posts",
          details: err.message,
        });
      }
    });

    // Search Users
    app.get("/search/users", async (req, res) => {
      try {
        const query = req.query.q; // get search text from ?q=
        if (!query) return res.status(400).send({ error: "Query required" });

        // Search users by name or email (case-insensitive)
        const results = await collectionUsers
          .find({
            $or: [
              { displayName: { $regex: query, $options: "i" } },
              { email: { $regex: query, $options: "i" } },
            ],
          })
          .project({
            uid: 1,
            displayName: 1,
            email: 1,
            photoURL: 1,
            followers: 1,
            following: 1,
          })
          .limit(10)
          .toArray();

        res.send(results);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to search users" });
      }
    });

    // ============================
    // NEW: Notifications APIs
    // ============================

    // Get notifications for a user
    app.get("/notifications/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const notifications = await collectionNotifications
          .find({ recipientId: userId })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();

        res.send(notifications);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch notifications" });
      }
    });

    // Mark notification as read
    app.put("/notifications/:notificationId/read", async (req, res) => {
      try {
        const { notificationId } = req.params;

        await collectionNotifications.updateOne(
          { _id: new ObjectId(notificationId) },
          { $set: { isRead: true } }
        );

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to mark notification as read" });
      }
    });

    // Mark all notifications as read
    app.put("/notifications/:userId/read-all", async (req, res) => {
      try {
        const { userId } = req.params;

        await collectionNotifications.updateMany(
          { recipientId: userId, isRead: false },
          { $set: { isRead: true } }
        );

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to mark notifications as read" });
      }
    });

    // Get unread notification count
    app.get("/notifications/:userId/unread-count", async (req, res) => {
      try {
        const { userId } = req.params;

        const count = await collectionNotifications.countDocuments({
          recipientId: userId,
          isRead: false
        });

        res.send({ count });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to get unread count" });
      }
    });

    // ============================
    // Posts
    // ============================

    // Create a post
    app.post("/socialPost", upload.single("photo"), async (req, res) => {
      try {
        const { text, privacy, userName, userPhoto, userEmail, userId, shared, sharedUserName, sharedUserPhoto, sharedUserText, sharedUserId } = req.body;
        const file = req.file;
        const time = new Date().toLocaleTimeString("en-US", {
          timeZone: "Asia/Dhaka",
        });
        const date = new Date().toLocaleDateString("en-US", {
          timeZone: "Asia/Dhaka",
          day: "2-digit",
          month: "long",
        });

        const newPost = {
          privacy: privacy,
          userId: userId, //added for userId
          userEmail: userEmail,
          text: text,
          userName: userName,
          userPhoto: userPhoto,
          shared: shared,
          sharedUserName: sharedUserName,
          sharedUserPhoto: sharedUserPhoto,
          sharedUserText: sharedUserText,
          sharedUserId: sharedUserId,
          image: file ? file.buffer.toString("base64") : null,
          filename: file?.originalname,
          mimetype: file?.mimetype,
          likes: [],
          comments: [],
          createdAt: time + " - " + date,
          sharedPost: null,
        };

        const result = await collectionPost.insertOne(newPost);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to create post" });
      }
    });

    // Get all posts (for debugging - consider removing in production)
    app.get("/socialPost", async (req, res) => {
      try {
        const posts = await collectionPost.find({}).toArray();
        res.send(posts);

      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });

    // Delete post
    app.delete("/socialPost/:id", async (req, res) => {
      const postId = req.params.id;
      try {
        const result = await collectionPost.deleteOne({
          _id: new ObjectId(postId),
        });
        if (result.deletedCount === 0)
          return res.status(404).send({ message: "Post not found" });
        res.send({ success: true, deletedId: postId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete post" });
      }
    });

    // Like/unlike a post - UPDATED WITH NOTIFICATION
  // React to a post (like/love/haha/sad)
    app.put("/socialPost/:id/react", async (req, res) => {
      const postId = req.params.id;
      const { userId, reactionType, senderName, senderPhoto } = req.body;

      try {
        if (!ObjectId.isValid(postId)) {
          return res.status(400).send({ error: "Invalid post ID" });
        }

        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ message: "Post not found" });

        if (!post.reactions) post.reactions = [];

        // check if user already reacted
        const existingIndex = post.reactions.findIndex(
          (r) => r.userId === userId
        );

        if (existingIndex >= 0) {
          if (
            post.reactions[existingIndex].type === reactionType ||
            reactionType === null
          ) {
            // ✅ same reaction → remove (unreact)
            post.reactions.splice(existingIndex, 1);
          } else {
            // ✅ different reaction → update
            post.reactions[existingIndex].type = reactionType;
          }
        } else if (reactionType) {
          // ✅ add new reaction
          post.reactions.push({
            userId,
            type: reactionType,
            displayName: senderName,
            photoURL: senderPhoto,
          });
        }

        // ✅ update DB
        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { reactions: post.reactions } }
        );

        // ✅ calculate current user reaction (after update)
        const userReaction =
          post.reactions.find((r) => r.userId === userId)?.type || null;

        // send updated info back to frontend
        res.send({
          reactions: post.reactions,
          userReaction,
          reactionsCount: post.reactions.length,
        });
      } catch (err) {
        console.error("Error in /react route:", err);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.get("/socialPost/:id/reactions", async (req, res) => {
      const postId = req.params.id;
      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const reactions = post.reactions || [];

        // সব userId collect করো
        const userIds = reactions.map((r) => r.userId);

        const users = await collectionUsers
          .find({ uid: { $in: userIds } })
          .project({ uid: 1, displayName: 1, photoURL: 1 })
          .toArray();

        // user info এর সাথে reaction type merge করো
        const result = reactions.map((r) => {
          const u = users.find((u) => u.uid === r.userId);
          return { ...u, type: r.type };
        });

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch reactions" });
      }
    });


    // server.js - notifications collection এ এই API টি যোগ করুন

    // Create notification
    // server.js - notifications collection এ এই API টি নিশ্চিত করুন
    app.post("/notifications", async (req, res) => {
      try {
        const {
          recipientId,
          senderId,
          senderName,
          senderPhoto,
          postId,
          postText,
          type,
          commentText
        } = req.body;

        // Don't create notification if user is interacting with their own post
        if (recipientId === senderId) {
          return res.send({ success: true, message: "Self notification skipped" });
        }

        const message = generateNotificationMessage(type, senderName, commentText);

        const notification = {
          recipientId,
          senderId,
          senderName,
          senderPhoto,
          postId,
          postText: postText ? postText.substring(0, 100) : "",
          type,
          message,
          commentText: commentText || "",
          isRead: false,
          createdAt: new Date()
        };

        const result = await collectionNotifications.insertOne(notification);
        res.send({ success: true, notification: { ...notification, _id: result.insertedId } });
      } catch (err) {
        console.error("Error creating notification:", err);
        res.status(500).send({ error: "Failed to create notification" });
      }
    });

    // Helper function
    function generateNotificationMessage(type, senderName, commentText = "") {
      switch (type) {
        case 'like':
          return `${senderName} liked your post`;
        case 'comment':
          return `${senderName} commented on your post`;
        case 'reply':
          return `${senderName} replied to your comment`;
        case 'follow':
          return `${senderName} started following you`;
        case 'share':
          return `${senderName} shared your post`;
        default:
          return `${senderName} interacted with your post`;
      }
    }

    // Helper function (যদি আগে থেকে না থাকে)
    function generateNotificationMessage(type, senderName, commentText = "") {
      switch (type) {
        case 'like':
          return `${senderName} liked your post`;
        case 'comment':
          return `${senderName} commented on your post`;
        case 'reply':
          return `${senderName} replied to your comment`;
        case 'follow':
          return `${senderName} started following you`;
        case 'share':
          return `${senderName} shared your post`;
        default:
          return `${senderName} interacted with your post`;
      }
    }

    // Share a post
    app.post("/socialPost/:id/share", async (req, res) => {
      try {
        const { id } = req.params;
        const { userId, userName, userPhoto, text } = req.body;

        const originalPost = await collectionPost.findOne({
          _id: new ObjectId(id),
        });

        if (!originalPost) {
          return res.status(404).send({ error: "Original post not found" });
        }

        const newPost = {
          userId,
          userName,
          userPhoto,
          text: text || "",
          likes: [],
          comments: [],
          shares: [],
          createdAt: new Date(),
          sharedPost: originalPost._id, // original post reference
        };

        const result = await collectionPost.insertOne(newPost);

        await collectionPost.updateOne(
          { _id: originalPost._id },
          {
            $push: {
              shares: { userId, userName, userPhoto, sharedAt: new Date() },
            },
          }
        );

        // NEW: Create share notification
        if (originalPost.userId !== userId) {
          await createNotification({
            recipientId: originalPost.userId,
            senderId: userId,
            senderName: userName,
            senderPhoto: userPhoto,
            postId: id,
            postText: originalPost.text,
            type: 'share',
            commentText: ""
          });
        }

        const insertedPost = await collectionPost.findOne({
          _id: result.insertedId,
        });

        const populatedPost = {
          ...insertedPost,
          sharedPost: {
            userName: originalPost.userName,
            userPhoto: originalPost.userPhoto,
            text: originalPost.text,
            image: originalPost.image,
            mimetype: originalPost.mimetype,
            filename: originalPost.filename,
            createdAt: originalPost.createdAt,
          },
        };

        res.send({ success: true, post: populatedPost });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to share post" });
      }
    });

    // Add reply (top-level or nested) - UPDATED WITH NOTIFICATION
    app.post("/socialPost/:postId/replies", async (req, res) => {
      const { postId } = req.params;
      const {
        commentId,
        authorPhoto,
        parentReplyId,
        authorName,
        authorEmail,
        text,
      } = req.body;

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const newReply = {
          _id: new ObjectId(),
          authorName,
          authorEmail, // <-- ensure this comes from body
          authorPhoto,
          text,
          createdAt: new Date(),
          replies: [],
        };

        if (parentReplyId) {
          // Nested reply
          post.comments = addNestedReply(
            post.comments,
            commentId,
            parentReplyId,
            newReply
          );
        } else {
          // Top-level reply
          post.comments = post.comments.map((c) =>
            c._id.toString() === commentId
              ? { ...c, replies: [...(c.replies || []), newReply] }
              : c
          );
        }

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { comments: post.comments }, $inc: { commentCount: 1 } }
        );

        // NEW: Create reply notification
        // Find the comment author to notify them
        const originalComment = post.comments.find(c => c._id.toString() === commentId);
        if (originalComment && originalComment.authorEmail !== authorEmail) {
          const commentAuthor = await collectionUsers.findOne({ email: originalComment.authorEmail });
          if (commentAuthor) {
            await createNotification({
              recipientId: commentAuthor.uid,
              senderId: req.body.senderId, // Client should send sender's uid
              senderName: authorName,
              senderPhoto: authorPhoto,
              postId: postId,
              postText: post.text,
              type: 'reply',
              commentText: text
            });
          }
        }

        res.send({ success: true, reply: newReply });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to add reply" });
      }
    });

    // Recursive function to add nested reply
    function addNestedReply(comments, commentId, parentReplyId, newReply) {
      return comments.map((c) => {
        if (c._id.toString() === commentId) {
          return {
            ...c,
            replies: addNestedReplyRecursive(
              c.replies || [],
              parentReplyId,
              newReply
            ),
          };
        }
        return c;
      });
    }

    function addNestedReplyRecursive(replies, targetId, newReply) {
      return replies.map((r) => {
        if (r._id.toString() === targetId.toString()) {
          return { ...r, replies: [...(r.replies || []), newReply] };
        }
        return {
          ...r,
          replies: addNestedReplyRecursive(r.replies || [], targetId, newReply),
        };
      });
    }

    // DELETE a reply (top-level or nested) from a post
    app.delete("/socialPost/:postId/replies/:replyId", async (req, res) => {
      const { postId, replyId } = req.params;

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        // Recursively delete reply
        const updatedComments = deleteReplyRecursive(post.comments, replyId);

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { comments: updatedComments }, $inc: { commentCount: -1 } }
        );

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete reply" });
      }
    });

    // Recursive function to delete nested reply
    function deleteReplyRecursive(comments, targetId) {
      return comments
        .filter((c) => c._id.toString() !== targetId.toString())
        .map((c) => ({
          ...c,
          replies: c.replies ? deleteReplyRecursive(c.replies, targetId) : [],
        }));
    }

    function updateReplyRecursive(comments, targetId, newText, authorEmail) {
      return comments.map((c) => {
        if (c._id.toString() === targetId.toString()) {
          if (c.authorEmail === authorEmail) {
            return { ...c, text: newText };
          }
          return c;
        }
        if (c.replies && c.replies.length > 0) {
          return {
            ...c,
            replies: updateReplyRecursive(
              c.replies,
              targetId,
              newText,
              authorEmail
            ),
          };
        }
        return c;
      });
    }

    app.post("/socialPost/:postId/replies/:replyId", async (req, res) => {
      const { postId, replyId } = req.params;
      const { text, authorName, authorEmail, authorPhoto } = req.body;

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const newReply = {
          _id: new ObjectId(),
          authorName,
          authorEmail,
          authorPhoto,
          text,
          createdAt: new Date(),
          replies: [],
        };

        const updatedComments = addReplyRecursive(
          post.comments,
          replyId,
          newReply
        );

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { comments: updatedComments }, $inc: { commentCount: 1 } }
        );

        res.status(201).send({ reply: newReply });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to add nested reply" });
      }
    });

    app.put("/socialPost/:postId/replies/:replyId", async (req, res) => {
      const { postId, replyId } = req.params;
      const { text, authorEmail } = req.body;

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const updatedComments = updateReplyRecursive(
          post.comments,
          replyId,
          text,
          authorEmail
        );

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { comments: updatedComments } }
        );

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to edit reply" });
      }
    });

    // Edit Comment
    app.put("/socialPost/:postId/comment/:commentId", async (req, res) => {
      const { postId, commentId } = req.params;
      const { text, userEmail } = req.body;

      const post = await collectionPost.findOne({ _id: new ObjectId(postId) });
      const comment = post.comments.find((c) => c._id.toString() === commentId);
      if (!comment) return res.status(404).send({ error: "Comment not found" });

      if (comment.authorEmail !== userEmail)
        return res.status(403).send({ error: "Not authorized" });

      await collectionPost.updateOne(
        { _id: new ObjectId(postId), "comments._id": new ObjectId(commentId) },
        { $set: { "comments.$.text": text } }
      );

      res.send({ success: true });
    });

    // Delete comment
    app.delete("/socialPost/:postId/comment/:commentId", async (req, res) => {
      const { postId, commentId } = req.params;
      const { userEmail } = req.body; // client
      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const comment = post.comments.find(
          (c) => c._id.toString() === commentId
        );
        if (!comment)
          return res.status(404).send({ error: "Comment not found" });

        if (comment.authorEmail !== userEmail && post.userEmail !== userEmail) {
          return res
            .status(403)
            .send({ error: "Not authorized to delete comment" });
        }

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          {
            $pull: {
              comments: { _id: new ObjectId(commentId) },
            },
            $inc: { commentCount: -1 },
          }
        );

        res.send({ success: true, deletedId: commentId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete comment" });
      }
    });

    // Add comment to post - UPDATED WITH NOTIFICATION
    app.post("/socialPost/:id/comments", async (req, res) => {
      const postId = req.params.id;
      const { userName, text, authorEmail, authorPhoto, senderId } = req.body; // Added senderId

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const newComment = {
          _id: new ObjectId(),
          authorName: userName || "Unknown",
          text,
          authorEmail,
          authorPhoto, //
          createdAt: new Date(),
          replies: [],
        };

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $push: { comments: newComment }, $inc: { commentCount: 1 } }
        );

        // NEW: Create comment notification
        if (post.userId !== senderId) { // Don't notify if user comments on their own post
          await createNotification({
            recipientId: post.userId,
            senderId: senderId,
            senderName: userName,
            senderPhoto: authorPhoto,
            postId: postId,
            postText: post.text,
            type: 'comment',
            commentText: text
          });
        }

        res.status(201).send({ comment: newComment });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to add comment" });
      }
    });


  // for story section ......................................................................

  app.post("/story", upload.single("photo"), async (req, res) => {
      try {
        const {  userName, userPhoto,  userId } = req.body;
        const file = req.file;
        const time = new Date().toLocaleTimeString("en-US", {
          timeZone: "Asia/Dhaka",
        });
        const timeC = new Date();
        

        const newStory = {
          userId: userId, //added for userId
          userName: userName,
          userPhoto: userPhoto,
          image: file ? file.buffer.toString("base64") : null,
          filename: file?.originalname,
          mimetype: file?.mimetype,
          likes: [],
          createdAt: time ,
          time:timeC,
        };

        const result = await collectionStory.insertOne(newStory);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to create story" });
      }
    });

    // Get all posts (for debugging - consider removing in production)
    app.get("/story", async (req, res) => {
      try {
        const posts = await collectionStory.find({}).toArray();
        res.send(posts);

      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });

    // Delete post
    app.delete("/story/:id", async (req, res) => {
      const postId = req.params.id;
      try {
        const result = await collectionStory.deleteOne({
          _id: new ObjectId(postId),
        });
        if (result.deletedCount === 0)
          return res.status(404).send({ message: "Post not found" });
        res.send({ success: true, deletedId: postId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete post" });
      }
    });




// Ai chat section............................................................................
// Initialize Gemini client


// New route for chatbot
app.post("/AiChat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    // Use `generateContent` for a single-turn chat
    const result = await model.generateContent(message);
    const reply = result.response.text();

    res.json({ reply });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});



// chat added.................................................................................

// Get all users (frontend filters out current user locally)
// model to store messages in mongodb
const messageSchema = new mongoose.Schema({
  senderId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
  receiverId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
  text: { type: String },
  image: { type: String },
  seen: { type: Boolean, default: false }
}, {timestamps: true});

// cloudinary config for send/receive images
    
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const Message = mongoose.model("Message", messageSchema);
  
app.get("/users", async (req, res) => {
      try {
        const users = await collectionUsers.find({})
          .project({
            uid: 1,
            displayName: 1,
            email: 1,
            photoURL: 1
          })
          .toArray();
        res.send(users);

        // count number of messages not seen
        const unseenMessages ={}
        const promises = filteredUsers.map(async (user) => {
          const messages = await Message.find({senderId: user._id, receiverId: userId, seen: false})
          if(messages.length > 0){
            unseenMessages[user._id] = messages.length;
          }
        })
        await Promise.all(promises);
        res.json({success: true, users: filteredUsers, unseenMessages})
      } catch (err) {
        console.error("Failed to fetch users:", err);
        res.status(500).send({ error: "Failed to fetch users" });

        console.log(err.message);
        res.json({success: false, message: err.message})
      }
    });

    // get all messages for selected user
    const getMessages = async (req, res)=>{
      try {
        const { id: selectedUserId } = req.params;
        const myId = req.user._id;

        const messages = await Message.find({
          $or: [
            {senderId: myId, receiverId: selectedUserId},
            {senderId: selectedUserId, receiverId: myId},
          ]
        })
        await Message.updateMany({senderId: selectedUserId, receiverId: myId},
          {seen: true}
        );
        res.json({success: true, messages})

      } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
      }
    }

    // api to mark message as seen using message id
    const markMessageAsSeen = async(req, res)=>{
      try{
        const { id } = req.params;
        await Message.findByIdAndUpdate(id, {seen: true})
        res.json({success: true})
      } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
      }
    }

    //send message to selected user
    const sendMessage = async (req, res) =>{
      try {
        const {text, image} = req.body;
        const receiverId = req.params.id;
        const senderId = req.user._id;

        let imageUrl;
        if(image) {
          const uploadResponse = await cloudinary.uploader.upload(image);
          imageUrl = uploadResponse.secure_url;
        }

        const newMessage = await Message.create({
          senderId,
          receiverId,
          text,
          image: imageUrl,
        })

        // emit the new message to receiver socket
        const receiverSocketId = userSocketMap[receiverId]
        if (receiverSocketId){
          io.to(receiverSocketId).emit("newMessage", newMessage)
        }

        res.json({success: true, newMessage});

      } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
      }
    }

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

    // message router
    const messageRouter = express.Router();

    messageRouter.get("/users", users);
    messageRouter.get("/:id", getMessages);
    messageRouter.put("mark/:id", markMessageAsSeen);
    messageRouter.post("/send/:id", sendMessage);

    app.use("/api/messages", messageRouter);

    
   

 
// chat end....................................................................................



  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qk8emwu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const collectionUsers = client.db("createPostDB").collection("users");
    const collectionPost = client.db("createPostDB").collection("createPost");

    // Root route
    app.get("/", (req, res) => res.send("Resonance server is working"));

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
        console.log(result);
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

    // Update user bio
    app.put("/users/:uid/details", async (req, res) => {
      try {
        const uid = req.params.uid;
        const { education, location, gender, relationshipStatus } = req.body;

        const update = {
          ...(education && { education }),
          ...(location && { location }),
          ...(gender && { gender }),
          ...(relationshipStatus && { relationshipStatus }),
          updatedAt: new Date(),
        };

        const result = await collectionUsers.updateOne(
          { uid },
          { $set: update }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({
          success: true,
          message: "User details updated successfully",
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update details" });
      }
    });

    // ============================
    // Follow / Unfollow a user
    // ============================
    app.put("/users/:uid/follow", async (req, res) => {
      try {
        const targetUid = req.params.uid; // person to follow/unfollow
        const { currentUid } = req.body; // logged-in user

        if (!currentUid) {
          return res.status(400).send({ error: "currentUid required" });
        }

        // find both users
        const targetUser = await collectionUsers.findOne({ uid: targetUid });
        const currentUser = await collectionUsers.findOne({ uid: currentUid });

        if (!targetUser || !currentUser) {
          return res.status(404).send({ error: "User not found" });
        }

        const isAlreadyFollowing = targetUser.followers?.includes(currentUid);

        if (isAlreadyFollowing) {
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
            { $addToSet: { followers: currentUid } }
          );
          await collectionUsers.updateOne(
            { uid: currentUid },
            { $addToSet: { following: targetUid } }
          );
        }

        // return updated counts
        const updatedTarget = await collectionUsers.findOne({ uid: targetUid });
        res.send({
          success: true,
          isFollowing: !isAlreadyFollowing,
          followersCount: updatedTarget.followers.length,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Follow/unfollow failed" });
      }
    });

    // ============================
    // Posts
    // ============================

    // Create a post
    app.post("/socialPost", upload.single("photo"), async (req, res) => {
      try {
        const { text } = req.body;
        const file = req.file;
        const time = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' });
        const date = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'long' });
        
        console.log(text);

        const newPost = {
          userEmail:text[3],
          text:text[2],
          userName:text[0],
          userPhoto:text[1],
          image: file ? file.buffer.toString("base64") : null,
          filename: file?.originalname,
          mimetype: file?.mimetype,
          likes: [],
          comments: [],
          createdAt: time + " - " + date,
        };

        const result = await collectionPost.insertOne(newPost);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to create post" });
      }
    });

    // Get all posts
    app.get("/socialPost", async (req, res) => {
      try {
        const posts = await collectionPost.find({}).toArray();
        res.send(posts);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });

    // Delete post ............................................................

    app.delete("/socialPost/:id", async (req, res) => {
      const postId = req.params.id;

      try {
        const result = await collectionPost.deleteOne({
          _id: new ObjectId(postId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Post not found" });
        }

        res.send({ success: true, deletedId: postId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete post" });
      }
    });

    // Like/unlike a post
    app.put("/socialPost/:id/like", async (req, res) => {
      const postId = req.params.id;
      const { userId } = req.body;

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ message: "Post not found" });

        const likes = post.likes || [];
        const updatedLikes = likes.includes(userId)
          ? likes.filter((id) => id !== userId)
          : [...likes, userId];

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { likes: updatedLikes } }
        );

        res.send({
          liked: updatedLikes.includes(userId),
          likesCount: updatedLikes.length,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update like" });
      }
    });

    // Add a comment
    app.post("/socialPost/:id/comments", async (req, res) => {
      const postId = req.params.id;
      const { userId, text } = req.body;

      try {
        const newComment = {
          _id: new ObjectId(),
          authorName: userId || "Unknown",
          text,
          createdAt: new Date(),
        };

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $push: { comments: newComment } }
        );

        res.status(201).send({ comment: newComment });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to add comment" });
      }
    });

    console.log("Connected to MongoDB successfully!");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run().catch(console.dir);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

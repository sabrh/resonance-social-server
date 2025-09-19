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
    await client.connect();

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
    app.post("/users/:uid/banner", upload.single("banner"), async (req, res) => {
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

        await collectionUsers.updateOne({ uid }, { $set: update }, { upsert: true });
        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "upload failed" });
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

        const newPost = {
          text,
          image: file ? file.buffer.toString("base64") : null,
          filename: file?.originalname,
          mimetype: file?.mimetype,
          likes: [],
          comments: [],
          createdAt: new Date(),
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

    // Like/unlike a post
    app.put("/socialPost/:id/like", async (req, res) => {
      const postId = req.params.id;
      const { userId } = req.body;

      try {
        const post = await collectionPost.findOne({ _id: new ObjectId(postId) });
        if (!post) return res.status(404).send({ message: "Post not found" });

        const likes = post.likes || [];
        const updatedLikes = likes.includes(userId)
          ? likes.filter((id) => id !== userId)
          : [...likes, userId];

        await collectionPost.updateOne({ _id: new ObjectId(postId) }, { $set: { likes: updatedLikes } });

        res.send({ liked: updatedLikes.includes(userId), likesCount: updatedLikes.length });
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

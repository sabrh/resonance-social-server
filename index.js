const express = require("express");
const cors = require("cors");
const multer = require("multer");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

// Multer setup (memory storage for now)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.send("Resonance server is working");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

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
    const collectionPost = client.db("createPostDB").collection("createPost");

    // Create a post
    app.post("/socialPost", upload.single("photo"), async (req, res) => {
      const text = req.body.text;
      const file = req.file;

      const newQuery = {
        text,
        image: file ? file.buffer.toString("base64") : null,
        filename: file?.originalname,
        mimetype: file?.mimetype,
        likes: [],
        comments: [],
      };

      const result = await collectionPost.insertOne(newQuery);
      res.send({ success: true, insertedId: result.insertedId });
    });

    // Like / Unlike a post
    app.put("/socialPost/:id/like", async (req, res) => {
      const postId = req.params.id;
      const { userId } = req.body;

      try {
        const post = await collectionPost.findOne({ _id: new ObjectId(postId) });
        if (!post) return res.status(404).send({ message: "Post not found" });

        const likes = post.likes || [];
        let updatedLikes;

        if (likes.includes(userId)) {
          // unlike
          updatedLikes = likes.filter((id) => id !== userId);
        } else {
          // like
          updatedLikes = [...likes, userId];
        }

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { likes: updatedLikes } }
        );

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
      

      console.log("PostId:", postId);
      console.log("Body:", req.body);

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

    console.log("Connected to MongoDB successfully!");
  } finally {
    // Do not close the client here, keep server running
  }
}

run().catch(console.dir);

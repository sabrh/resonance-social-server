const express = require("express");
const cors = require("cors");
const multer = require("multer");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// ============== Middleware ==============
app.use(cors());
app.use(express.json());

// Multer setup (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ============== MongoDB Connection ==============
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qk8emwu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

// Root route
app.get("/", (req, res) => res.send("Resonance server is working"));

// ============== Main Server Logic ==============
async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB successfully!");

    const db = client.db("createPostDB");
    const collectionUsers = db.collection("users");
    const collectionPost = db.collection("createPost");

    // ============================
    // USERS SECTION
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
        console.error("Create user error:", err);
        res.status(500).send({ error: "server error" });
      }
    });

    // Get user by uid
    app.get("/users/:uid", async (req, res) => {
      try {
        const user = await collectionUsers.findOne({ uid: req.params.uid });
        if (!user) return res.status(404).send({ error: "User not found" });
        res.send(user);
      } catch (err) {
        console.error("Fetch user error:", err);
        res.status(500).send({ error: "server error" });
      }
    });

    // Upload/update banner
    app.post("/users/:uid/banner", upload.single("banner"), async (req, res) => {
      try {
        const uid = req.params.uid;
        const file = req.file;
        if (!file) return res.status(400).send({ error: "No file uploaded" });

        const update = {
          banner: file.buffer.toString("base64"),
          bannerFilename: file.originalname,
          bannerMimetype: file.mimetype,
          updatedAt: new Date(),
        };

        await collectionUsers.updateOne({ uid }, { $set: update }, { upsert: true });
        res.send({ success: true });
      } catch (err) {
        console.error("Banner upload error:", err);
        res.status(500).send({ error: "upload failed" });
      }
    });

    // Update user details
    app.put("/users/:uid/details", async (req, res) => {
      try {
        const { education, location, gender, relationshipStatus } = req.body;
        const update = {
          ...(education && { education }),
          ...(location && { location }),
          ...(gender && { gender }),
          ...(relationshipStatus && { relationshipStatus }),
          updatedAt: new Date(),
        };

        const result = await collectionUsers.updateOne({ uid: req.params.uid }, { $set: update });
        if (result.matchedCount === 0) return res.status(404).send({ error: "User not found" });

        res.send({ success: true, message: "User details updated successfully" });
      } catch (err) {
        console.error("Update details error:", err);
        res.status(500).send({ error: "Failed to update details" });
      }
    });

    // Follow / Unfollow
    app.put("/users/:uid/follow", async (req, res) => {
      try {
        const targetUid = req.params.uid;
        const { currentUid } = req.body;
        if (!currentUid) return res.status(400).send({ error: "currentUid required" });

        const targetUser = await collectionUsers.findOne({ uid: targetUid });
        const currentUser = await collectionUsers.findOne({ uid: currentUid });
        if (!targetUser || !currentUser)
          return res.status(404).send({ error: "User not found" });

        const isFollowing = targetUser.followers?.includes(currentUid);

        if (isFollowing) {
          await collectionUsers.updateOne({ uid: targetUid }, { $pull: { followers: currentUid } });
          await collectionUsers.updateOne({ uid: currentUid }, { $pull: { following: targetUid } });
        } else {
          await collectionUsers.updateOne({ uid: targetUid }, { $addToSet: { followers: currentUid } });
          await collectionUsers.updateOne({ uid: currentUid }, { $addToSet: { following: targetUid } });
        }

        const updatedTarget = await collectionUsers.findOne({ uid: targetUid });
        res.send({
          success: true,
          isFollowing: !isFollowing,
          followersCount: updatedTarget.followers.length,
        });
      } catch (err) {
        console.error("Follow/unfollow error:", err);
        res.status(500).send({ error: "Follow/unfollow failed" });
      }
    });

    // ============================
    // POSTS SECTION
    // ============================

    // Create a post
    app.post("/socialPost", upload.single("photo"), async (req, res) => {
      try {
        const { text, privacy, userName, userPhoto, userEmail } = req.body;
        const file = req.file;

        const newPost = {
          privacy,
          userEmail,
          text,
          userName,
          userPhoto,
          image: file ? file.buffer.toString("base64") : null,
          filename: file?.originalname,
          mimetype: file?.mimetype,
          likes: [],
          comments: [],
          shares: [],
          createdAt: new Date(), // ✅ store as Date object for sorting
          sharedPost: null,
        };

        const result = await collectionPost.insertOne(newPost);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Create post error:", err);
        res.status(500).send({ error: "Failed to create post" });
      }
    });

    // Get all posts with sharedPostData
    app.get("/socialPost", async (req, res) => {
    try {
      const posts = await collectionPost
        .aggregate(
          [
            {
              $lookup: {
                from: "createPost",
                localField: "sharedPost",
                foreignField: "_id",
                as: "sharedPostData",
              },
            },
            {
              $unwind: {
                path: "$sharedPostData",
                preserveNullAndEmptyArrays: true,
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 100 },
            {
              $project: {
                privacy: 1,
                text: 1,
                image: 1,
                mimetype: 1,
                filename: 1,
                likes: 1,
                shares: 1,
                comments: 1,
                userName: 1,
                userPhoto: 1,
                userEmail: 1,
                createdAt: 1,
                sharedPostData: {
                  userName: 1,
                  userPhoto: 1,
                  text: 1,
                  image: 1,
                  mimetype: 1,
                  filename: 1,
                  createdAt: 1,
                },
              },
            },
          ],
          {
            allowDiskUse: true, 
          }
        )
        .toArray();

      res.send(posts);
    } catch (error) {
      console.error("Aggregation error:", error);
      res.status(500).send({ error: "Failed to fetch posts", details: error.message });
    }
  });


    // Delete post
    app.delete("/socialPost/:id", async (req, res) => {
      try {
        const result = await collectionPost.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Post not found" });
        res.send({ success: true, deletedId: req.params.id });
      } catch (err) {
        console.error("Delete post error:", err);
        res.status(500).send({ error: "Failed to delete post" });
      }
    });

    // Like / Unlike post
    app.put("/socialPost/:id/like", async (req, res) => {
      try {
        const postId = req.params.id;
        const { userId } = req.body;
        const post = await collectionPost.findOne({ _id: new ObjectId(postId) });
        if (!post) return res.status(404).send({ message: "Post not found" });

        const likes = post.likes || [];
        const updatedLikes = likes.includes(userId)
          ? likes.filter((id) => id !== userId)
          : [...likes, userId];

        await collectionPost.updateOne({ _id: new ObjectId(postId) }, { $set: { likes: updatedLikes } });
        res.send({ liked: updatedLikes.includes(userId), likesCount: updatedLikes.length });
      } catch (err) {
        console.error("Like error:", err);
        res.status(500).send({ error: "Failed to update like" });
      }
    });

    // Share post
    app.post("/socialPost/:id/share", async (req, res) => {
      try {
        const { id } = req.params;
        const { userId, userName, userPhoto, text } = req.body;

        const originalPost = await collectionPost.findOne({ _id: new ObjectId(id) });
        if (!originalPost) return res.status(404).send({ error: "Original post not found" });

        const newPost = {
          userEmail: originalPost.userEmail,
          userName,
          userPhoto,
          text: text || "",
          likes: [],
          comments: [],
          shares: [],
          createdAt: new Date(),
          sharedPost: originalPost._id,
        };

        const result = await collectionPost.insertOne(newPost);
        await collectionPost.updateOne(
          { _id: originalPost._id },
          { $push: { shares: { userId, userName, userPhoto, sharedAt: new Date() } } }
        );

        const updatedPost = await collectionPost.findOne({ _id: originalPost._id });
        res.send({
          success: true,
          insertedId: result.insertedId,
          sharesCount: updatedPost.shares?.length || 0,
        });
      } catch (err) {
        console.error("Share error:", err);
        res.status(500).send({ error: "Failed to share post" });
      }
    });

    // Add comment
    app.post("/socialPost/:id/comments", async (req, res) => {
      try {
        const { userName, text } = req.body;
        const newComment = {
          _id: new ObjectId(),
          authorName: userName || "Unknown",
          text,
          createdAt: new Date(),
        };

        await collectionPost.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $push: { comments: newComment } }
        );

        res.status(201).send({ comment: newComment });
      } catch (err) {
        console.error("Comment error:", err);
        res.status(500).send({ error: "Failed to add comment" });
      }
    });
  } catch (err) {
    console.error("Server startup error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => console.log(`Server running on port ${port}`));
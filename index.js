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
    await client.connect();
    console.log("Connected to MongoDB successfully!");

    const collectionUsers = client.db("createPostDB").collection("users");
    const collectionPost = client.db("createPostDB").collection("createPost");

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

    // Follow / Unfollow
    app.put("/users/:uid/follow", async (req, res) => {
      try {
        const targetUid = req.params.uid;
        const { currentUid } = req.body;
        if (!currentUid)
          return res.status(400).send({ error: "currentUid required" });

        const targetUser = await collectionUsers.findOne({ uid: targetUid });
        const currentUser = await collectionUsers.findOne({ uid: currentUid });
        if (!targetUser || !currentUser)
          return res.status(404).send({ error: "User not found" });

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
        console.log("req.body:", req.body);

        const file = req.file;
        const time = new Date().toLocaleTimeString("en-US", {
          timeZone: "Asia/Dhaka",
        });
        const date = new Date().toLocaleDateString("en-US", {
          timeZone: "Asia/Dhaka",
          day: "2-digit",
          month: "long",
        });
        const { userId } = req.body;
        const newPost = {
          userId,
          userEmail,
          userEmail: text[3],
          text: text[2],
          userName: text[0],
          userPhoto: text[1],
          image: file ? file.buffer.toString("base64") : null,
          filename: file?.originalname,
          mimetype: file?.mimetype,
          likes: [],
          comments: [],
          createdAt: time + " - " + date,
          // createdAt: new Date(),

          sharedPost: null,
        };

        const result = await collectionPost.insertOne(newPost);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to create post" });
      }
    });

    // Get all posts
    // app.get("/socialPost", async (req, res) => {
    //   try {
    //     const posts = await collectionPost.find({}).toArray();
    //     res.send(posts);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ error: "Failed to fetch posts" });
    //   }
    // });

    // Get all posts with sharedPostData
    app.get("/socialPost", async (req, res) => {
      try {
        const posts = await collectionPost
          .aggregate([
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
            {
              $project: {
                text: 1,
                image: 1,
                userId: 1,
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
                  //  createdAt: "$sharedPostData.createdAt"  // ✅ include this
                },
              },
            },
          ])
          .toArray();

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

    // // Like/unlike a post
    // app.put("/socialPost/:id/like", async (req, res) => {
    //   const postId = req.params.id;
    //   const { userId, userName, userPhoto } = req.body;

    //   try {
    //     const post = await collectionPost.findOne({
    //       _id: new ObjectId(postId),
    //     });
    //     if (!post) return res.status(404).send({ message: "Post not found" });

    //     const likes = post.likes || [];
    //     let updatedLikes;

    //     if (likes.includes(userId)) {
    //       updatedLikes = likes.filter((id) => id !== userId);
    //     } else {
    //       updatedLikes = [...likes, userId];
    //     }

    //     await collectionPost.updateOne(
    //       { _id: new ObjectId(postId) },
    //       { $set: { likes: updatedLikes } }
    //     );

    //     const likedNow = updatedLikes.includes(userId);
    //     res.send({
    //       liked: likedNow,
    //       likesCount: updatedLikes.length,
    //       likes: updatedLikes,
    //     });
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ error: "Failed to update like" });
    //   }
    // });
    // Like/unlike a post
    app.put("/socialPost/:id/like", async (req, res) => {
      const postId = req.params.id;
      const { userId, userName, userPhoto } = req.body;

      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ message: "Post not found" });

        // likes এখন object array
        // const likes = post.likes || [];
        let likes = (post.likes || []).map((l) =>
          typeof l === "string"
            ? { userId: l, userName: "Unknown", userPhoto: null }
            : l
        );

        let updatedLikes;
        if (likes.find((l) => l.userId === userId)) {
          // Already liked → remove like
          updatedLikes = likes.filter((l) => l.userId !== userId);
        } else {
          // Not liked yet → add like
          updatedLikes = [...likes, { userId, userName, userPhoto }];
        }

        const likedNow = updatedLikes.some((l) => l.userId === userId);

        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { likes: updatedLikes } }
        );

        res.send({
          liked: likedNow,
          likesCount: updatedLikes.length,
          likes: updatedLikes, // objects পাঠাচ্ছে
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update like" });
      }
    });

    // ✅ Share a post
    // Share handler
    app.post("/socialPost/:id/share", async (req, res) => {
      const { id } = req.params;
      const { userId, userName, userPhoto, text } = req.body;

      const originalPost = await collectionPost.findOne({
        _id: new ObjectId(id),
      });
      if (!originalPost)
        return res.status(404).send({ error: "Original post not found" });

      // নতুন share post
      const newPost = {
        userEmail: originalPost.userEmail,
        userName,
        userPhoto,
        text: text || "",
        likes: [],
        comments: [],
        shares: [],
        // createdAt: new Date(),
        createdAt: new Date().toLocaleString("en-US", {
          timeZone: "Asia/Dhaka", // 👉 তোমার লোকাল টাইমজোন
          hour12: true,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),

        sharedPost: originalPost._id,
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

      // res.send({ success: true, insertedId: result.insertedId });
      // এখানেই তুমি শেষের অংশটা বসাবে 👇
      const updatedPost = await collectionPost.findOne({
        _id: originalPost._id,
      });
      res.send({
        success: true,
        insertedId: result.insertedId,
        sharesCount: updatedPost.shares?.length || 0,
      });
    });

    // DELETE comment from a post
    app.delete("/socialPost/:postId/comment/:commentId", async (req, res) => {
      const { postId, commentId } = req.params;
      const { userEmail } = req.body; // যিনি delete করতে চাচ্ছেন তার email

      try {
        // post খুঁজে বের করা
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ message: "Post not found" });

        // comment খুঁজে বের করা
        const comment = post.comments.find(
          (c) => c._id.toString() === commentId
        );
        if (!comment)
          return res.status(404).send({ message: "Comment not found" });

        // শুধু comment author অথবা post owner delete করতে পারবে
        if (comment.authorEmail !== userEmail && post.userEmail !== userEmail) {
          return res
            .status(403)
            .send({ message: "Not authorized to delete this comment" });
        }

        // comment remove করা
        await collectionPost.updateOne(
          { _id: new ObjectId(postId) },
          { $pull: { comments: { _id: new ObjectId(commentId) } } }
        );

        res.send({ success: true, message: "Comment deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete comment" });
      }
    });

    app.post("/socialPost/:id/comments", async (req, res) => {
      const postId = req.params.id;
      const { userId, userName, text, authorEmail } = req.body;
      console.log(req.body);

      try {
        const newComment = {
          _id: new ObjectId(),
          authorId: userId,
          authorEmail: authorEmail || "unknown@example.com",
          authorName: userName || "Unknown",
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
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

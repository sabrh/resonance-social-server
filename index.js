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
    // await client.connect();
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
      .project({ uid: 1, displayName: 1, email: 1, photoURL: 1 })
      .limit(10)
      .toArray();

    res.send(results);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to search users" });
  }
});





    // ============================
    // Posts
    // ============================

    // Create a post
    app.post("/socialPost", upload.single("photo"), async (req, res) => {
      try {
        const { text, privacy, userName, userPhoto, userEmail, userId } =
          req.body;
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
    app.get("/socialPost", async (req, res) => {
      try {
        const posts = await collectionPost.find({}).toArray();
        res.send(posts);
        console.log(posts);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });

    // Get all posts with sharedPostData
    // app.get("/socialPost", async (req, res) => {
    //   try {
    //     const posts = await collectionPost
    //       .aggregate([
    //         {
    //           $lookup: {
    //             from: "createPost",
    //             localField: "sharedPost",
    //             foreignField: "_id",
    //             as: "sharedPostData",
    //           },
    //         },
    //         {
    //           $unwind: {
    //             path: "$sharedPostData",
    //             preserveNullAndEmptyArrays: true,
    //           },
    //         },
    //         { $sort: { createdAt: -1 } },
    //         {
    //           $project: {
    //             privacy:1,
    //             text: 1,
    //             image: 1,
    //             mimetype: 1,
    //             filename: 1,
    //             likes: 1,
    //             shares: 1,
    //             comments: 1,
    //             userName: 1,
    //             userPhoto: 1,
    //             userEmail: 1,
    //             createdAt: 1,
    //             sharedPostData: {
    //               userName: 1,
    //               userPhoto: 1,
    //               text: 1,
    //               image: 1,
    //               mimetype: 1,
    //               filename: 1,
    //               createdAt: 1,
    //               //  createdAt: "$sharedPostData.createdAt"  // ✅ include this
    //             },
    //           },
    //         },
    //       ])
    //       .toArray();

    //     res.send(posts);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ error: "Failed to fetch posts" });
    //   }
    // });

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
        let updatedLikes;

        if (likes.includes(userId)) {
          updatedLikes = likes.filter((id) => id !== userId);
        } else {
          updatedLikes = [...likes, userId];
        }

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
    app.get("/socialPost/:id/likes", async (req, res) => {
      const postId = req.params.id;
      try {
        const post = await collectionPost.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) return res.status(404).send({ error: "Post not found" });

        const likes = post.likes || [];

        const users = await collectionUsers
          .find({ uid: { $in: likes } })
          .project({ uid: 1, displayName: 1, photoURL: 1 })
          .toArray();

        // Remove duplicates (just in case)
        const uniqueUsers = Array.from(
          new Map(users.map((u) => [u.uid, u])).values()
        );

        res.send(uniqueUsers);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch like users" });
      }
    });

    // Share a post
    // Share handler
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
    // Add reply (top-level or nested)
    app.post("/socialPost/:postId/replies", async (req, res) => {
      const { postId } = req.params;
      const { commentId,authorPhoto, parentReplyId, authorName,authorEmail, text } = req.body;

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
          { $set: { comments: post.comments } }
        );

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
          { $set: { comments: updatedComments } }
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

    // function addReplyRecursive(comments, targetId, newReply) {
    //   return comments.map((c) => {
    //     if (c._id.toString() === targetId.toString()) {
    //       return { ...c, replies: [...(c.replies || []), newReply] };
    //     }
    //     if (c.replies && c.replies.length > 0) {
    //       return {
    //         ...c,
    //         replies: addReplyRecursive(c.replies, targetId, newReply),
    //       };
    //     }
    //     return c;
    //   });
    // }
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
          { $set: { comments: updatedComments } }
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
          { $pull: { comments: { _id: new ObjectId(commentId) } } }
        );

        res.send({ success: true, deletedId: commentId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to delete comment" });
      }
    });

    // Add comment to post
    app.post("/socialPost/:id/comments", async (req, res) => {
      const postId = req.params.id;
      const { userName, text, authorEmail, authorPhoto } = req.body;
      console.log(req.body);

      try {
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

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer setup (memory storage for now)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// HTTP server বানালাম (socket.io এর জন্য দরকার)
const server = http.createServer(app);

// Socket.io server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5174", // frontend URL
        methods: ["GET", "POST"],
    },
});

// 🟢 Socket.io connection
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ইউজারকে রুমে join করানো
    socket.on("join_room", (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
    });

    // মেসেজ রুমে পাঠানো
    socket.on("send_message", (data) => {
        io.to(data.room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
    });
});

// ---------------- MongoDB + Post System ----------------

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qk8emwu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const collectionPost = client.db('createPostDB').collection('createPost');

        // ✅ Create Post API
        app.post('/socialPost', upload.single('photo'), async (req, res) => {
            const text = req.body.text;
            const file = req.file;

            const newQuery = {
                text,
                image: file ? file.buffer.toString('base64') : null,
                filename: file?.originalname,
                mimetype: file?.mimetype
            };

            const result = await collectionPost.insertOne(newQuery);
            res.send({ success: true, insertedId: result.insertedId });
        });

        // ✅ Get Post API
        app.get('/socialPost', async (req, res) => {
            try {
                const posts = await collectionPost.find({}).toArray();
                res.send(posts);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: 'Failed to fetch posts' });
            }
        });

        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // keep client alive
    }
}
run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
    res.send("Resonance server with Socket.io is working 🚀");
});

// Server run
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

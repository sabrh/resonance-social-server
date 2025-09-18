const express = require('express');
const cors = require('cors');
const multer = require('multer');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors());
app.use(express.json());

// Multer setup (memory storage for now)
const storage = multer.memoryStorage(); // file stored in memory buffer
const upload = multer({ 
    storage,
  fileFilter: (req, file, cb) => {
    if (!file) return cb(null, true);
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
 });

app.get('/',(req,res)=> {
    res.send("Resonance server is working")
});
app.listen(port, ()=> {
    console.log(`server is running on port ${port}`);
});





// Connection to MongoDB 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qk8emwu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uwapymk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

// post collection
    const collectionPost = client.db('createPostDB').collection('createPost');
    const usersCollection = client.db('createPostDB').collection('users');



    // save new user after signup
       app.post('/users', async (req, res) => {
      try {
        const { email, name, displayName, photoURL, location, education, gender, about } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const updateDoc = {
          $setOnInsert: { createdAt: new Date() },
          $set: {
            email,
            name: name || displayName || "",
            displayName: displayName || name || "",
            photo: photoURL || null,
            banner: null,
            bio: {
              location: location || null,
              education: education || null,
              gender: gender || null,
              about: about || null
            }
          },
          $setOnInsert2: {} // placeholder
        };

        // upsert user (insert if not exists)
        await usersCollection.updateOne({ email }, updateDoc, { upsert: true });
        const user = await usersCollection.findOne({ email });
        res.json(user);
      } catch (err) {
        console.error("POST /users error:", err);
        res.status(500).json({ error: "Server error" });
      }
    });

    //Get user by email 
    app.get('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send(user);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch user" });
      }
    });


    // Update user profile 
     app.put('/users/:email', upload.single('photo'), async (req, res) => {
      try {
        const email = req.params.email;
        const { name } = req.body;
        let updateDoc = { $set: { name } };

        if (req.file) {
          updateDoc.$set.image = req.file.buffer.toString("base64");
        }

        const result = await usersCollection.updateOne(
          { email },
          updateDoc,
          { upsert: true }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to update profile" });
      }
    });


   app.post('/socialPost', upload.single('photo'), async (req, res) => {
  const text = req.body.text;      // text field
  const file = req.file;           // uploaded image

  const newQuery = {
    text,
    image: file ? file.buffer.toString('base64') : null,
    filename: file?.originalname,
    mimetype: file?.mimetype
  };

  
  const result = await collectionPost.insertOne(newQuery);
  res.send({ success: true, insertedId: result.insertedId });
});




app.get('/socialPost', async (req, res) => {
  try {
    

    const posts = await collectionPost.find({}).toArray(); // get all documents
    res.send(posts); // send JSON array
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to fetch posts' });
  }
});






    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {





    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



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
const upload = multer({ storage: storage });

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
        const user = req.body; // { name, email, image }
        const existingUser = await usersCollection.findOne({ email: user.email });
        if (existingUser) {
          return res.send({ message: "User already exists" });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to save user" });
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



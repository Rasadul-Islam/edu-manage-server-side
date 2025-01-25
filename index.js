const express = require('express');
const app = express();
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT | 5000;

// middleWare
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dzkk6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // await client.connect();

    // Database collection
    const userCollection = client.db('eduLoopDb').collection('users');
    const classCollection = client.db('eduLoopDb').collection('classes');
    const teacherRequestsCollection = client.db("eduLoopDb").collection("teacherRequests");
    const assignmentCollection = client.db("eduLoopDb").collection("assignment");
    const submissionCollection = client.db("eduLoopDb").collection("submission");
    const feedbackCollection = client.db('eduLoopDb').collection('feedback');

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send({ token });
    })

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.athorization);
      if (!req.headers.athorization) {
        return res.status(401).send({ massage: 'unauthorized access' });
      }
      const token = req.headers.athorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ massage: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verifyAdmin After verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ massage: 'forbidden access' });
      }
      next();
    }


    // Users related api

    // get user info
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ massage: 'forbidden access' })

      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    // post user info
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ massage: "users email already added", insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    // update user role
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    // delete use info
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // Get user by email
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });
    // Update User profile
    app.patch("/users/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updatedData };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });




    // Teacher Related Api

    // Post teacher request
    app.post("/teacherRequests", verifyToken, async (req, res) => {
      const request = req.body;
      const result = await teacherRequestsCollection.insertOne(request);
      res.send(result);
    });
    // get teacher request
    app.get('/teacherRequests', verifyToken, async (req, res) => {
      const requests = await teacherRequestsCollection.find().toArray();
      res.send(requests);
    });
    // update accepted teacher request and change role
    app.patch('/teacher/approver/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'accepted'
        }
      }
      // Update status and user role to "teacher"
      const teacherRequest = await teacherRequestsCollection.findOne(filter);
      if (teacherRequest) {
        await userCollection.updateOne(
          { email: teacherRequest.email },
          { $set: { role: 'teacher' } }
        );
      }
      const result = await teacherRequestsCollection.updateOne(filter, updateDoc);
      res.send(result);
    })
    // Reject status
    app.patch('/teacher/reject/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'rejected',
        },
      };
      const result = await teacherRequestsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    










    // Class related api
    //Get all class
    app.get('/classes',verifyToken, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    })
    // Get classes filter enrolment
    app.get('/populerClasses', async (req, res) => {
      const filter = { status: "approved" };
      const sortClass = { enrollmentCount: -1 };
      const populerClass = await classCollection.find(filter).sort(sortClass).limit(6).toArray();
      res.send(populerClass);
    });
    // Get All classes which approve
    app.get('/allClasses', async (req, res) => {
      const filter = { status: "approved" };
      const allClass = await classCollection.find(filter).toArray();
      res.send(allClass);
    });
    // Post classes
    app.post('/classes', verifyToken, async (req, res) => {
      const classes = req.body;
      classes.status = "pending";
      const result = await classCollection.insertOne(classes);
      res.send(result)
    })
    // Get classes by Email
    app.get('/classes/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const classes = await classCollection.find(query).toArray();
      res.send(classes);
    })
    // Delete a class by teacher
    app.delete("/classes/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });
    // Get Classes by id
    app.get("/updateClasses/:id", verifyToken, async (req, res, next) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    })
    // Update Classes by id
    app.patch("/classes/:id", verifyToken, async (req, res, next) => {
      const id = req.params.id;
      const updatedClass = req.body;
      if (updatedClass._id) {
        delete updatedClass._id;
      }
      const filter = { _id: new ObjectId(id) };
      const updateData = { $set: updatedClass };
      const result = await classCollection.updateOne(filter, updateData);
      res.send(result);
    });
    // update approve status
    app.patch('/classes/approve/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "approved" },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // update rejected status
    app.patch('/classes/reject/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "rejected" },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


// enroll class details api
    app.get('/enrollClass/:id', async (req, res) => {
      const { id } = req.params;
      const query={ _id: new ObjectId(id) };
      const classDetails = await classCollection.findOne(query);
      res.send(classDetails);
    });
// teacher see class details by id
    app.get('/classDetails/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const classDetails = await classCollection.findOne({ _id: new ObjectId(id) });
      const assignments = await assignmentCollection.find({ classId: id }).toArray();
      const totalSubmissions = await submissionCollection.countDocuments({ classId: id });
    
      res.send({ classDetails, assignments, totalSubmissions });
    });
    // Post assignment by teacher
    app.post('/assignments', verifyToken, async (req, res) => {
      const assignment = req.body;
      const result = await assignmentCollection.insertOne(assignment);
      res.send(result);
    });
    
    






    // get feedback
    app.get('/feedback', async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('EduLoop Server is running');
})

app.listen(port, () => {
  console.log(`EduLoop is running on port: ${port}`);
})
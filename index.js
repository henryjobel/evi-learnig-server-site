const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    const usersCollection = client.db('evoLearn').collection('users')
    const coursesCollection = client.db('evoLearn').collection('courses')
    const coursesEnrollCollection = client.db('evoLearn').collection('enrollCollection')
    const feedBackCollection = client.db('evoLearn').collection('feedback')
    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      console.log('I need a new jwt', user)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // Save or modify user email, status in DB
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const query = { email: email }
      const options = { upsert: true }
      const isExist = await usersCollection.findOne(query)
      console.log('User found?----->', isExist)
      if (isExist) return res.send(isExist)
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      )
      res.send(result)
    })


    app.get('/users',verifyToken, async(req,res)=>{
      const result = await usersCollection.find().toArray()
      res.send(result)
    })
    // user role update
    app.put('/users/update/:email',verifyToken, async(req,res)=>{
      const email = req.params.email
      const user = req.body
      const query = { email: email }
      const updateDoc = {
        $set : {
          ...user,
        timestamp: Date.now(),
        },
      }
      const result = await usersCollection.updateOne(query,updateDoc)
      res.send(result)

    })
    // beacome a teacher
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      const query = { email: email }
      const options = { upsert: true }
      const isExist = await usersCollection.findOne(query)
      console.log('User found?----->', isExist)
      if (isExist){
        if(user?.status === 'Requsted'){
          const result = await usersCollection.updateOne(
            query,{
              $set: user,
            }
          )
          return res.send(result)
        }
        else{
          return res.send(isExist)
        }
      }
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      )
      res.send(result)
    })


    app.get('/user/:email', async (req,res)=>{
      const email = req.params.email
      const result = await usersCollection.findOne({email})
      res.send(result)
    })

    // get all courses
    app.get('/courses', async (req,res)=>{
      const result = await coursesCollection.find().toArray()
      res.send(result)
    })
    app.get('/feedback', async (req,res)=>{
      const result = await feedBackCollection.find().toArray()
      res.send(result)
    })
    // add one couses in database
    app.post('/courses', verifyToken , async (req,res)=>{
      const courses = req.body
      const result = await coursesCollection.insertOne(courses)
      res.send(result)
    })
    // get single cpurses
    app.get('/courses/:id', async (req,res)=>{
      const id = req.params.id
      const sinleCourse = {_id: new ObjectId(id)}
      const result = await coursesCollection.findOne(sinleCourse)
      res.send(result)
    })
    // get course for teacher
    app.get('/course/:email',async(req,res)=>{
      const email = req.params.email
      const result = await coursesCollection.find({'teacher.email': email}).toArray()
      res.send(result)
    })

    // [payment releted]
    app.post("/create-payment-intent",verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)
      console.log(amount , 'this is amount')
    
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // save enroll collection
    app.post('/payments', verifyToken , async (req,res)=>{
      const payments = req.body
      const result = await coursesEnrollCollection.insertOne(payments)
      res.send(result)
    })

    app.get('/payments',verifyToken, async (req,res)=>{
      const email = req.query.email
      if(!email) return res.send([])
      const query = {'student.email' : email}
      const result = await coursesEnrollCollection.find(query).toArray()
    res.send(result)
    })

    app.get('/admin-stats', async(req,res) =>{
      const users = await usersCollection.estimatedDocumentCount()
      const coursesItems = await coursesCollection.estimatedDocumentCount()
      const payments = await coursesEnrollCollection.estimatedDocumentCount()
      const result = await coursesEnrollCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray()
      const revenue = result.length > 0 ? result[0].totalRevenue : 0 ;
      res.send({
        users,
        coursesItems,
        payments,
        revenue

        
      })
    }),
    // purches satats
    app.get('/order-stats', async(req, res) =>{
      const result = await coursesEnrollCollection.aggregate([
        {
          $unwind: '$courses'
        },
        {
          $lookup: {
            from: 'courses',
            localField: 'courses',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$courses'
        },
        {
          $group: {
            _id: '$courses.category',
            quantity:{ $sum: 1 },
            revenue: { $sum: '$courses.price'} 
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();

      res.send(result);

    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send(' evoLearn server is runung..')
})

app.listen(port, () => {
  console.log(`EvoLearn is running on port ${port}`)
})

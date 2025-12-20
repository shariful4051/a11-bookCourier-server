const express = require('express')
const cors = require('cors');

require('dotenv').config()

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT ||3000;
app.use(express.json())
app.use(cors())
const stripe = require('stripe')(process.env.STRIPE_SECRETE);
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.tn7v7f9.mongodb.net/?appName=Cluster0`;


app.get('/', (req, res) => {
  res.send('Book-Courier server is running...')
})
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
    const db = client.db('bookCourier');
    const booksCollection = db.collection('books')
    const ordersCollection = db.collection('orders')
    const paymentsCollection = db.collection('payments')

    //---------books api ----------

    app.get('/books', async(req,res)=>{
      const {email} = req.query;
      const query = {}
      if(email){
         query.librarian_email = email
      }
      const cursor = booksCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })

    app.get('/books/:id',async(req,res)=>{
      const id = req.params.id;
      const query = {_id:new ObjectId(id)}
      const result = await booksCollection.findOne(query)
      res.send(result)
    })


    app.post('/books',async(req,res)=>{
      const newBook = req.body;
      const result = await booksCollection.insertOne(newBook)
      res.send(result)
    })

    //----------orders api -------
    
    app.get('/orders',async(req,res)=>{
      const {email} = req.query;
      const query = {}
      if(email){
        query.email= email;
      }
      const cursor = ordersCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })
     
    app.post('/orders',async(req,res)=>{
      const orderBook = req.body;
      const result = await ordersCollection.insertOne(orderBook)
      res.send(result)
    })


    //----------stripe api -----
    
    app.post('/payment-checkout-session',async(req,res)=>{
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost)*100;
      const session = await stripe.checkout.sessions.create({
        line_items:[
          {
            price_data:
            {
            currency:'USD',
            unit_amount:amount,
            product_data:{
              name:paymentInfo.bookName
            },
          },
          quantity:1,
        }
        ],
        customer_email:paymentInfo.email,
        mode:'payment',
        metadata:{
          orderId:paymentInfo.orderId,
          bookName:paymentInfo.bookName
        },
        success_url:`${process.env.SITE_DOMAIN}/dashboard/payment-success?sessionid={CHECKOUT_SESSION_ID}`,
        cancel_url:`${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`


      })

        console.log('from session',session);
        res.send({url:session.url})

    })

    //--------------get payment_status =paid from stripe retrieve, create a payment api

    app.patch('/payment-success',async(req,res)=>{
      const sessionId = req.query.sessionid;
      console.log(sessionId);
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      console.log('from session strieve',session);

      const transactionId = session.payment_intent;
      const query = {transactionId:transactionId}
      const paymentExist = await paymentsCollection.findOne(query)
      if(paymentExist){
        return res.send({message:'already exist',transactionId})
      }

      if(session.payment_status==='paid'){
        const id = session.metadata.orderId;
        const query = {_id:new ObjectId(id)}
        const update = {
          $set:{
            payment_status:'paid',
          }
        }
        const result = await ordersCollection.updateOne(query,update)

        //------payment api object-----------


        const payment = {
          amount:session.amount_total/100,
          currency:session.currency,
          email:session.customer_email,
          orderId:session.metadata.orderId,
          bookName:session.metadata.bookName,
          transactionId:session.payment_intent,
          payment_status:session.payment_status,
          paidAt :new Date()

        }
        if(session.payment_status==='paid'){
          const resultPayment = await paymentsCollection.insertOne(payment)
          res.send(
            {
              success:true,
              modifyOrder:result,
              paymentInfo:resultPayment,
              //trackingId:trackingId,
              transactionId:session.payment_intent
            }
          )
        }
       // res.send(result)

      }else{
        res.send({sucess:false})
      }
     })
     //---------payment get api ----
     app.get('/payments',async(req,res)=>{
      const email = req.query.email;
      const query = {}
      if(email){
        query.email = email;
      }
      const cursor = paymentsCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)

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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

// server.js
require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const GridFsStorage = require('multer-gridfs-storage');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(cors()); // Allow cross-origin requests from your React frontend

// MongoDB connection
let gfs;
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
  gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'uploads'
  });
}).catch(err => console.error('MongoDB connection error:', err));

// Google OAuth 2.0 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Endpoints

// 1. OAuth Login
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'], // Request read-only access to Gmail
    prompt: 'consent'
  });
  res.json({ authUrl: url });
});

// 2. OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Store refresh token for offline access
    // In a real app, you would store this refresh token securely in your database
    // for the user, linked to their account.
    console.log('Authentication successful. Refresh Token:', tokens.refresh_token);

    // Redirect back to the frontend
    res.redirect('http://localhost:3000?auth_success=true');
  } catch (error) {
    console.error('Authentication failed:', error);
    res.status(500).send('Authentication failed.');
  }
});

// 3. Scan for Emails and Download Attachments
app.post('/fetch', async (req, res) => {
  if (!oauth2Client.credentials.access_token) {
    return res.status(401).json({ error: 'Not authenticated. Please log in first.' });
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    // Search for unread emails that have attachments
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread has:attachment'
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) {
      return res.json({ message: 'No new unread emails with attachments found.' });
    }

    const filesSaved = [];
    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });
      
      const parts = msg.data.payload.parts || [];
      for (const part of parts) {
        if (part.filename && part.body.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: message.id,
            id: part.body.attachmentId
          });
          
          const fileData = Buffer.from(attachment.data.data, 'base64');
          
          // Save file to MongoDB GridFS
          const uploadStream = gfs.openUploadStream(part.filename, {
            metadata: { messageId: message.id, from: msg.data.payload.headers.find(h => h.name === 'From').value }
          });
          
          const readableStream = new Readable();
          readableStream.push(fileData);
          readableStream.push(null);
          readableStream.pipe(uploadStream);

          filesSaved.push({
            filename: part.filename,
            id: uploadStream.id,
            size: fileData.length
          });
        }
      }

      // Mark the email as read after processing
      await gmail.users.messages.modify({
        userId: 'me',
        id: message.id,
        resource: {
          removeLabelIds: ['UNREAD']
        }
      });
    }

    res.json({ message: `Successfully saved ${filesSaved.length} attachments.`, filesSaved });

  } catch (error) {
    console.error('Failed to fetch and save attachments:', error);
    res.status(500).json({ error: 'Failed to fetch and save attachments.' });
  }
});

// 4. Get List of Files
app.get('/files', async (req, res) => {
  try {
    const files = await gfs.find().toArray();
    res.json(files.map(f => ({
      id: f._id,
      filename: f.filename,
      size: f.length,
      uploadDate: f.uploadDate,
      metadata: f.metadata
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve files.' });
  }
});

// 5. Download a Specific File
app.get('/files/:id/download', (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    gfs.openDownloadStream(fileId).pipe(res);
  } catch (error) {
    res.status(404).json({ error: 'File not found.' });
  }
});

app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
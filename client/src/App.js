// src/App.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:4000'; // Your backend API endpoint

export default function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Function to fetch the list of archived files from the backend
  async function fetchFiles() {
    setLoading(true);
    setMessage('');
    try {
      const response = await axios.get(`${API_BASE_URL}/files`);
      setFiles(response.data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setMessage('Failed to fetch files.');
    } finally {
      setLoading(false);
    }
  }

  // Function to initiate the OAuth login process
  async function handleOAuthLogin() {
    try {
      setMessage('Redirecting to Google for authentication...');
      const response = await axios.get(`${API_BASE_URL}/auth/google`);
      // The backend will handle the redirection, so we simply log a message.
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Authentication failed:', error);
      setMessage('Authentication failed. Check the backend server.');
    }
  }

  // Function to trigger the email scanning process on the backend
  async function triggerFetch() {
    setMessage('Scanning emails for new attachments...');
    try {
      const response = await axios.post(`${API_BASE_URL}/fetch`);
      setMessage(response.data.message || 'Scan completed.');
      fetchFiles(); // Refresh the file list after a successful scan
    } catch (error) {
      console.error('Scan failed:', error);
      setMessage('Scan failed: ' + (error.response?.data?.error || error.message));
    }
  }

  // Check authentication status and fetch files on component mount
    useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_success') === 'true') {
      setIsAuthenticated(true);
      fetchFiles();
      // Clean up the URL to prevent re-authentication on refresh
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Email Attachment Archiver 📧</h1>
      <p>{message}</p>

      {!isAuthenticated ? (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
          <h2>Connect Your Account</h2>
          <button onClick={handleOAuthLogin} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
            Login with Google
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <p>Your account is connected.</p>
            <button onClick={triggerFetch} disabled={loading} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
              {loading ? 'Scanning...' : 'Scan Now for Attachments'}
            </button>
          </div>
          
          <h2>Archived Files</h2>
          {loading ? (
            <p>Loading files...</p>
          ) : files.length === 0 ? (
            <p>No files have been archived yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Filename</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Size</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => (
                  <tr key={file.id || index}>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{file.filename}</td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{file.size} bytes</td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                      <a href={`${API_BASE_URL}/files/${file.id}/download`} target="_blank" rel="noopener noreferrer">
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
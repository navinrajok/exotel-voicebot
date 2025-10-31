// server.js - Complete Exotel Voicebot Bridge
const WebSocket = require('ws');
const fetch = require('node-fetch');
const express = require('express');

// Environment variables
const PORT = process.env.PORT || 10000;
const FLOWISE_URL = process.env.FLOWISE_URL;

console.log('🚀 Starting Exotel Voicebot Bridge');
console.log('📍 Port:', PORT);
console.log('🔗 Flowise:', FLOWISE_URL);

// Express app
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Exotel Voicebot Bridge',
    activeSessions: sessions.size
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

// HTTP server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/voicebot'
});

const sessions = new Map();

console.log('🎧 WebSocket ready at /voicebot');

wss.on('connection', (ws, req) => {
  console.log('\n🔌 New connection');
  
  let session = {
    callSid: null,
    streamSid: null,
    audioChunks: [],
    isProcessing: false,
    startTime: Date.now()
  };

  ws.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString());
      
      switch(event.event) {
        case 'connected':
          session.callSid = event.call_sid;
          session.streamSid = event.stream_sid;
          sessions.set(session.callSid, session);
          console.log('✅ Connected:', session.callSid);
          break;
          
        case 'start':
          console.log('🎙️ Streaming started');
          session.audioChunks = [];
          break;
          
        case 'media':
          session.audioChunks.push(event.media.payload);
          
          // Process after ~2 seconds (20 chunks)
          if (session.audioChunks.length >= 20 && !session.isProcessing) {
            session.isProcessing = true;
            await processAudio(ws, session);
            session.isProcessing = false;
          }
          break;
          
        case 'stop':
          console.log('🛑 Call ended');
          sessions.delete(session.callSid);
          break;
      }
    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Disconnected');
    sessions.delete(session.callSid);
  });
});

async function processAudio(ws, session) {
  const startTime = Date.now();
  
  try {
    // Combine audio
    const combined = session.audioChunks.join('');
    session.audioChunks = [];
    
    console.log(`📦 Audio: ${combined.length} chars`);
    
    // Convert to WAV
    const wavBuffer = base64ToWav(combined);
    
    // Call STT
    console.log('🎤 STT...');
    const transcript = await stt(wavBuffer);
    console.log('📝 Transcript:', transcript);
    
    if (!transcript) {
      console.log('⚠️ Empty transcript');
      return;
    }
    
    // Call Flowise
    console.log('🤖 Calling Flowise...');
    const response = await fetch(FLOWISE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: transcript,
        overrideConfig: { sessionId: session.callSid }
      })
    });
    
    const result = await response.json();
    console.log('💬 Flowise response received');
    
    // Parse response
    let data;
    try {
      data = typeof result.text === 'string' ? JSON.parse(result.text) : result;
    } catch {
      data = { text: result.text, action: 'continue' };
    }
    
    console.log('📊 Action:', data.action);
    
    // Stream audio back
    if (data.audio_url) {
      console.log('🔊 Streaming audio...');
      await streamAudio(ws, data.audio_url, session);
    }
    
    // Check escalation
    if (data.action === 'connect' || data.needsAgent) {
      console.log('📞 Escalating...');
      setTimeout(() => ws.close(), 1000);
    }
    
    console.log(`⏱️ Processed in ${Date.now() - startTime}ms`);
    
  } catch (err) {
    console.error('❌ Processing error:', err.message);
  }
}

async function stt(wavBuffer) {
  try {
    const boundary = '----Boundary' + Date.now();
    const CRLF = '\r\n';
    
    const header = 
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"${CRLF}` +
      `Content-Type: audio/wav${CRLF}${CRLF}`;
    
    const modelPart = 
      `${CRLF}--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="model"${CRLF}${CRLF}saarika:v2.5`;
    
    const langPart = 
      `${CRLF}--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="language_code"${CRLF}${CRLF}en-IN`;
    
    const footer = `${CRLF}--${boundary}--${CRLF}`;
    
    const body = Buffer.concat([
      Buffer.from(header),
      wavBuffer,
      Buffer.from(modelPart),
      Buffer.from(langPart),
      Buffer.from(footer)
    ]);
    
    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': 'sk_a1dhxuu5_DOPwUE44VSuJgrBu4fKUjTOV',
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });
    
    const data = await res.json();
    return data.transcript || '';
    
  } catch (err) {
    console.error('❌ STT error:', err.message);
    return '';
  }
}

async function streamAudio(ws, audioUrl, session) {
  try {
    // Download audio
    const res = await fetch(audioUrl);
    const buffer = await res.buffer();
    
    // Skip WAV header
    const pcm = buffer.slice(44);
    
    // Stream in 100ms chunks
    const chunkSize = 1280;
    
    for (let i = 0; i < pcm.length; i += chunkSize) {
      const chunk = pcm.slice(i, i + chunkSize);
      
      ws.send(JSON.stringify({
        event: 'media',
        stream_sid: session.streamSid,
        media: { payload: chunk.toString('base64') }
      }));
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log('✅ Audio streamed');
    
  } catch (err) {
    console.error('❌ Stream error:', err.message);
  }
}

function base64ToWav(base64) {
  const pcm = Buffer.from(base64, 'base64');
  const header = Buffer.alloc(44);
  
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  
  return Buffer.concat([header, pcm]);
}

console.log('\n✅ Ready!\n');

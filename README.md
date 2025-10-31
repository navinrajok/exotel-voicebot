# Exotel Voicebot Bridge

WebSocket bridge for Exotel Voicebot + Flowise

## Environment Variables
- FLOWISE_URL - Your Flowise chatflow URL
- PORT - Server port (default: 10000)
```

---

## **📋 PART 2: Deploy to Render**

### **Step 1: Sign Up**

1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render

### **Step 2: Create Web Service**

1. Click **"New +"** → **"Web Service"**
2. Connect your `exotel-voicebot` repo
3. Configure:

**Settings:**
- **Name**: `exotel-voicebot`
- **Region**: Singapore
- **Branch**: `main`
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: Free

**Environment Variables:**

Click **"Add Environment Variable"**

Variable 1:
- **Key**: `PORT`
- **Value**: `10000`

Variable 2:
- **Key**: `FLOWISE_URL`
- **Value**: `PASTE_YOUR_FLOWISE_URL_HERE` (we'll update this)

### **Step 3: Deploy**

1. Click **"Create Web Service"**
2. Wait 2-3 minutes
3. Your URL: `https://exotel-voicebot.onrender.com`
4. **WebSocket URL**: `wss://exotel-voicebot.onrender.com/voicebot`

✅ **SAVE THIS URL**

Test: Visit `https://exotel-voicebot.onrender.com/health`

---

## **📋 PART 3: Flowise Flow Modifications**

Your current JSON needs **these changes**:

### **Delete These Nodes:**
1. `customFunctionAgentflow_2` (upload input audio)
2. `customFunctionAgentflow_3` (STT function)

The WebSocket bridge handles STT now!

### **Keep These Nodes:**
1. ✅ `startAgentflow_0` (Start)
2. ✅ `httpAgentflow_0` (SF Token)
3. ✅ `llmAgentflow_2` (Extract Token)
4. ✅ `httpAgentflow_2` (SF Query)
5. ✅ `customFunctionAgentflow_4` (Parse SF)
6. ✅ `llmAgentflow_1` (LLM Response) - ADD state update
7. ✅ `httpAgentflow_1` (TTS) - Change sample rate
8. ✅ `customFunctionAgentflow_0` (Extract audio)
9. ✅ `customFunctionAgentflow_1` (Upload)

### **Modifications:**

#### **Modify Node: `llmAgentflow_1`**

Add this in **"Update Flow State"**:
```
Key: llmResponse
Value: {{ llmAgentflow_1 }}

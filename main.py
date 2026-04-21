from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
import os

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}
        self.meeting_status = "active"
        self.chat_history = [] 

    async def connect(self, websocket: WebSocket, client_id: str, role: str):
        await websocket.accept()
        self.active_connections[websocket] = {"client_id": client_id, "role": role}

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def broadcast(self, message: str, exclude: WebSocket = None):
        for connection in self.active_connections.keys():
            if connection != exclude:
                try:
                    await connection.send_text(message)
                except:
                    pass

    def get_client(self, client_id: str):
        for ws, data in self.active_connections.items():
            if data["client_id"] == client_id:
                return ws
        return None

manager = ConnectionManager()

@app.get("/")
async def get_index():
    return FileResponse(os.path.join(STATIC_DIR, 'index.html'))

@app.post("/api/login")
async def login_api(request: Request):
    data = await request.json()
    username = data.get("username")
    password = data.get("password")
    
    users_file = os.path.join(BASE_DIR, "users.txt")
    if not os.path.exists(users_file):
        return {"success": False, "message": "Database not found."}

    try:
        with open(users_file, "r") as f:
            for line in f:
                parts = line.strip().split(':')
                if len(parts) == 3:
                    u, p, r = parts
                    if u == username and p == password:
                        return {"success": True, "role": r}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}
        
    return {"success": False, "message": "Invalid Credentials."}

@app.websocket("/ws/{client_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, client_id: str, role: str):
    await manager.connect(websocket, client_id, role)
    
    if manager.chat_history:
        await websocket.send_text(json.dumps({"type": "chat-history", "history": manager.chat_history}))
    
    if manager.meeting_status == "paused" and role != 'admin':
        await websocket.send_text(json.dumps({"type": "meeting-paused"}))
    else:
        await manager.broadcast(json.dumps({"type": "user-joined", "client_id": client_id, "role": role}), exclude=websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message['type'] in ['offer', 'answer', 'ice-candidate']:
                target_ws = manager.get_client(message['target'])
                if target_ws:
                    await target_ws.send_text(data)
            
            elif message['type'] in ['cam-state', 'stop-screen']:
                 await manager.broadcast(data, exclude=websocket)

            elif message['type'] == 'chat':
                chat_payload = {
                    "type": "chat",
                    "sender": client_id,
                    "text": message['text'],
                    "senderName": message.get('senderName', 'User'),
                    "role": role
                }
                manager.chat_history.append(chat_payload)
                if len(manager.chat_history) > 200: 
                    manager.chat_history.pop(0)
                await manager.broadcast(json.dumps(chat_payload))
            
            elif message['type'] == 'admin-action':
                if role == 'admin':
                    action = message['action']
                    if action == 'pause-meeting':
                        manager.meeting_status = "paused"
                        await manager.broadcast(json.dumps({"type": "meeting-paused"}))
                    elif action == 'resume-meeting':
                        manager.meeting_status = "active"
                        await manager.broadcast(json.dumps({"type": "meeting-resumed"}))
                    elif action == 'clear-chat':
                        manager.chat_history = []
                        await manager.broadcast(json.dumps({"type": "chat-cleared"}))
                    elif action in ['mute-mic', 'mute-cam']:
                        target_ws = manager.get_client(message['target_id'])
                        if target_ws:
                            await target_ws.send_text(json.dumps({"type": "force-action", "action": action}))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(json.dumps({"type": "user-left", "client_id": client_id}))

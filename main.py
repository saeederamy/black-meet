from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
import os
import uuid
import subprocess

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
ROOMS_FILE = os.path.join(BASE_DIR, "rooms.json")
USERS_FILE = os.path.join(BASE_DIR, "users.txt")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

def load_rooms():
    if not os.path.exists(ROOMS_FILE):
        default = {"default_room": {"name": "General Lounge", "members": []}}
        with open(ROOMS_FILE, "w", encoding="utf-8") as f:
            json.dump(default, f)
        return default
    with open(ROOMS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_rooms(rooms):
    with open(ROOMS_FILE, "w", encoding="utf-8") as f:
        json.dump(rooms, f)

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}
        self.meeting_status = {}
        self.chat_history = {}

    async def connect(self, room_id: str, websocket: WebSocket, client_id: str, role: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
            self.meeting_status[room_id] = "active"
            self.chat_history[room_id] = []
            
        self.active_connections[room_id][websocket] = {"client_id": client_id, "role": role}

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections and websocket in self.active_connections[room_id]:
            del self.active_connections[room_id][websocket]

    async def broadcast(self, room_id: str, message: str, exclude: WebSocket = None):
        if room_id in self.active_connections:
            for connection in list(self.active_connections[room_id].keys()):
                if connection != exclude:
                    try:
                        await connection.send_text(message)
                    except:
                        pass

    def get_client(self, room_id: str, client_id: str):
        if room_id in self.active_connections:
            for ws, data in self.active_connections[room_id].items():
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
    
    if not os.path.exists(USERS_FILE):
        return {"success": False, "message": "Database not found."}

    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split(':')
                if len(parts) >= 3:
                    u, p, r = parts[:3]
                    if u == username and p == password:
                        return {"success": True, "role": r, "username": u}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}
        
    return {"success": False, "message": "Invalid Credentials."}

# --- System Update API ---
def restart_server():
    import time
    time.sleep(2)
    os.system("systemctl restart black-meet.service")

@app.post("/api/system/update")
async def system_update(request: Request, bg_tasks: BackgroundTasks):
    try:
        subprocess.run(["git", "fetch", "--all"], cwd=BASE_DIR, check=True)
        status = subprocess.run(["git", "status", "-uno"], cwd=BASE_DIR, capture_output=True, text=True)
        
        if "Your branch is up to date" in status.stdout:
            return {"success": True, "updated": False, "message": "System is already up-to-date! No changes found."}
        
        subprocess.run(["git", "reset", "--hard", "origin/main"], cwd=BASE_DIR, check=True)
        pip_path = os.path.join(BASE_DIR, "venv", "bin", "pip")
        if os.path.exists(pip_path):
            subprocess.run([pip_path, "install", "-r", "requirements.txt"], cwd=BASE_DIR)
        
        bg_tasks.add_task(restart_server)
        return {"success": True, "updated": True, "message": "Update successfully applied! System is restarting..."}
    except Exception as e:
        return {"success": False, "message": f"Update Error: {str(e)}"}

# --- Rooms API ---
# اضافه شدن متغیر t برای دور زدن کش بدون گرفتن خطای امنیتی از سمت FastAPI
@app.get("/api/rooms")
async def get_rooms(username: str, role: str, t: str = None):
    rooms = load_rooms()
    user_rooms = {}
    for r_id, r_data in rooms.items():
        if role == 'admin' or username in r_data.get("members", []):
            user_rooms[r_id] = r_data
    return {"success": True, "rooms": user_rooms}

@app.get("/api/users")
async def get_users(t: str = None):
    users = []
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split(':')
                if len(parts) >= 3:
                    users.append(parts[0])
    return {"success": True, "users": users}

@app.post("/api/rooms")
async def create_room(request: Request):
    data = await request.json()
    room_name = data.get("name")
    rooms = load_rooms()
    new_id = "room_" + uuid.uuid4().hex[:8]
    rooms[new_id] = {"name": room_name, "members": []}
    save_rooms(rooms)
    return {"success": True, "rooms": rooms}

@app.put("/api/rooms/{room_id}")
async def rename_room(room_id: str, request: Request):
    data = await request.json()
    rooms = load_rooms()
    if room_id in rooms:
        rooms[room_id]["name"] = data.get("name")
        save_rooms(rooms)
        return {"success": True}
    return {"success": False}

@app.delete("/api/rooms/{room_id}")
async def delete_room(room_id: str):
    rooms = load_rooms()
    if room_id in rooms:
        del rooms[room_id]
        save_rooms(rooms)
        return {"success": True}
    return {"success": False}

@app.post("/api/rooms/{room_id}/members")
async def update_members(room_id: str, request: Request):
    data = await request.json()
    rooms = load_rooms()
    if room_id in rooms:
        rooms[room_id]["members"] = data.get("members", [])
        save_rooms(rooms)
        return {"success": True}
    return {"success": False}

@app.websocket("/ws/{room_id}/{client_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str, role: str):
    await manager.connect(room_id, websocket, client_id, role)
    
    if manager.chat_history[room_id]:
        await websocket.send_text(json.dumps({"type": "chat-history", "history": manager.chat_history[room_id]}))
    
    if manager.meeting_status[room_id] == "paused" and role != 'admin':
        await websocket.send_text(json.dumps({"type": "meeting-paused"}))
    else:
        await manager.broadcast(room_id, json.dumps({"type": "user-joined", "client_id": client_id, "role": role}), exclude=websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message['type'] in ['offer', 'answer', 'ice-candidate']:
                target_ws = manager.get_client(room_id, message['target'])
                if target_ws:
                    await target_ws.send_text(data)
            
            elif message['type'] in ['cam-state', 'stop-screen']:
                 await manager.broadcast(room_id, data, exclude=websocket)

            elif message['type'] == 'chat':
                chat_payload = {
                    "type": "chat",
                    "sender": client_id,
                    "text": message['text'],
                    "senderName": message.get('senderName', 'User'),
                    "role": role
                }
                manager.chat_history[room_id].append(chat_payload)
                if len(manager.chat_history[room_id]) > 200: 
                    manager.chat_history[room_id].pop(0)
                await manager.broadcast(room_id, json.dumps(chat_payload))
            
            elif message['type'] == 'admin-action':
                if role == 'admin':
                    action = message['action']
                    if action == 'pause-meeting':
                        manager.meeting_status[room_id] = "paused"
                        await manager.broadcast(room_id, json.dumps({"type": "meeting-paused"}))
                    elif action == 'resume-meeting':
                        manager.meeting_status[room_id] = "active"
                        await manager.broadcast(room_id, json.dumps({"type": "meeting-resumed"}))
                    elif action == 'clear-chat':
                        manager.chat_history[room_id] = []
                        await manager.broadcast(room_id, json.dumps({"type": "chat-cleared"}))
                    elif action in ['mute-mic', 'mute-cam']:
                        target_ws = manager.get_client(room_id, message['target_id'])
                        if target_ws:
                            await target_ws.send_text(json.dumps({"type": "force-action", "action": action}))

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, json.dumps({"type": "user-left", "client_id": client_id}))

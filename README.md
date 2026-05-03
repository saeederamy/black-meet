<div align="center">

# 🚀 Black Meet
### The Ultimate Enterprise Video Conferencing Platform

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg?style=for-the-badge&logo=fastapi&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-orange.svg?style=for-the-badge&logo=webrtc&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-success.svg?style=for-the-badge)

</div>

**Black Meet** is a high-performance, ultra-low latency, and fully responsive WebRTC video conferencing platform. Built with **FastAPI (Python)** and **Vanilla JS**, it delivers a premium Google Meet/Zoom-like experience without the heavy resource footprint.

🌍 **Optimized for Restricted Networks:** This project uses **Zero External Dependencies** (No Google Fonts, no external CDNs, and inline SVGs). It is specifically designed to load at lightning speed and bypass strict national intranets, corporate firewalls, and aggressive CDNs.

---

## ✨ Killer Features

* 🛡️ **Firewall & CDN Bypass Signaling:** Unlike traditional WebRTC platforms that crash behind strict CDNs (like Cloudflare, ParsPack, ArvanCloud) due to WebSocket restrictions, Black Meet uses an advanced **HTTP Long-Polling Architecture**. It masquerades real-time traffic as standard HTTP requests, ensuring 100% connectivity on any network.
* 🏢 **Multi-Room Lobby System:** Admins can create distinct virtual rooms (e.g., "Daily Standup", "Dev Team") and assign specific registered users to them. Users land in a sleek lobby to select their permitted rooms.
* 🎙️ **AI Active Speaker Detection:** Microphones dynamically glow neon green using the browser's native `AudioContext` to detect who is currently speaking.
* 🔴 **Built-in Session Recording (DVR):** Admins can record the entire meeting directly from the browser (Video + Audio) and download the high-quality `.mp4` file instantly.
* 💻 **Independent Screen Sharing:** Share your screen alongside your webcam. Screen shares appear in a separate, dedicated video capsule without conflicting with your camera feed.
* 👑 **God-Mode Admin Controls:** * Force-mute microphones or force-block cameras.
  * Pause the entire meeting (sends all users to a visual "Waiting Room" overlay).    
  * Clear global chat history for all users instantly.
* 🔄 **One-Click Web Updater:** Admins can check for updates and upgrade the server directly from the web panel GUI. The backend safely pulls from GitHub and restarts the service in the background.
* 📱 **Dynamic Grid System:** Auto-scaling video grid that perfectly adapts from 1 to 10+ users on both Desktop and Mobile.
* 🔲 **Native Fullscreen & PiP:** Hardware-accelerated native fullscreen mode with a floating Picture-in-Picture (PiP) for your own webcam.

---

## 🎨 UI/UX Highlights

* **Glossy Glassmorphism:** Deep blacks, translucent panels, and vibrant neon accents (Blue, Red, Orange).
* **Multi-Tab Sidebar:** Clean sidebar navigation for Live Chat, Active Users list, and Admin DVR/Management controls.
* **Smart Avatars:** Automatically displays a sleek initial-based avatar bubble when a user turns off their camera.

---

## ⚡ Easy Installation (One-Liner)

If your server has access to the global internet and GitHub, you can install, configure, and secure the app with a single command. Run this in your Ubuntu root terminal:

```bash
bash <(curl -Ls https://raw.githubusercontent.com/saeederamy/black-meet/main/install.sh)
```

> **Note:** This interactive script will automatically install Python, set up the Nginx proxy, configure systemd services, generate SSL via Let's Encrypt, and create your global `black-meet` CLI command for future management.

---

## 🛠️ Manual Installation (For Restricted / Offline Networks)

If your server is on a restricted network (or behind strict firewalls) where `curl` or direct `git clone` from GitHub is blocked, you can use the local installation method.

### Step 1: Transfer the Files
Download the repository files from GitHub (as a `.zip` or copy them manually) and transfer them to your server. Place all the files in a dedicated directory, for example, `/opt/black-meet`.
Make sure the `install.sh` file is included in this folder.

### Step 2: Navigate to the Directory
Open your server's terminal and navigate to the folder where you placed the files:

```bash
cd /opt/black-meet
```

### Step 3: Make the Installer Executable
Grant execution permissions to the installation script:

```bash
sudo chmod +x install.sh
```

### Step 4: Run the Installer
Execute the script locally:

```bash
sudo ./install.sh
```

### Step 5: Follow the Interactive Prompts
The script will detect that local files are present and will intelligently switch to Local Setup Mode. It will:
* Ask for your desired Port, Admin Username, and Password.
* Install necessary system dependencies (`python3-venv`, `nginx`, etc.).
* Create the isolated Python environment and install `requirements.txt`.
* Automatically generate the `.service` file to keep the app running in the background.
* Provide a menu to automatically or manually configure Nginx & SSL certificates.

Once completed, simply type `black-meet` anywhere in your terminal to manage your server!

---

## 🏗️ Architecture Stack

* **Backend:** FastAPI (Python) - Chosen for unmatched async performance.
* **Signaling:** HTTP Long-Polling & Asyncio Queues - Anti-Censorship Ready.
* **Frontend:** Vanilla JavaScript, HTML5, CSS3.
* **Media Protocol:** Native WebRTC (RTCPeerConnection).
* **Database:** Lightweight JSON & TXT flat-files (Zero-setup).

---


<br>

<div align="center">
<i>Built for high-performance, secure, and uncensorable communication.</i>
</div>

# 🌟 Black Meet - WebRTC Server Setup (Iran Edition) 

This guide provides a robust, anti-filter **STUN/TURN server configuration (Coturn)** optimized for restricted networks (like Iranian ISPs and Mobile Networks). 

It combines the blazing-fast standard UDP port (`3478`) with a highly secure TLS/TCP tunnel (`4433`) to bypass Deep Packet Inspection (DPI) and strict NAT limitations. 🚀

---

## 🛠️ Step 1: Global Installation (Automated)
Update your server and install the core `coturn` package. Run this single command on your Ubuntu/Debian server:

```bash
sudo apt update && sudo apt install coturn -y && sudo systemctl enable coturn
```

---

## 🔒 Step 2: Generate Free SSL Certificate (PunchSalad)
To encrypt the WebRTC traffic and bypass network filters, we need a valid SSL certificate. We will use PunchSalad to get a free certificate via DNS verification.

### Obtaining the Certificate:
1. Go to [PunchSalad Free SSL](https://punchsalad.com/ssl-certificate/).
2. In the domain input box, enter your TURN subdomain (e.g., `turn.<your-domain.com>`).
3. For the verification method, select **DNS (TXT Record)**.
4. Click on **Generate Free SSL**. PunchSalad will provide you with a **TXT Name** and a **TXT Value**.

### Verifying DNS:
5. Open your cloud provider or CDN dashboard (like ParsPack, Cloudflare, etc.) and go to the DNS section.
6. Create a new DNS record:
   - **Type:** `TXT`
   - **Name:** `_acme-challenge.turn` (or exactly what PunchSalad provided)
   - **Value:** Paste the long string provided by PunchSalad.
7. Save the record and wait 2 to 5 minutes for the DNS to propagate.
8. Go back to PunchSalad and click **Verify**.

### Applying the Certificate to Your Server:
9. Download and extract the provided ZIP file.
10. Create two files on your Linux server and paste the text into them:

**Create the Certificate file:**
```bash
sudo nano /etc/turn_cert.crt
```
*(Paste the content of `certificate.crt` or `fullchain.crt` here and save).*

**Create the Private Key file:**
```bash
sudo nano /etc/turn_key.key
```
*(Paste the content of `private.key` here and save).*

---

## ⚙️ Step 3: Configure Coturn
Clear the default configuration and open the file for editing:

```bash
sudo rm /etc/turnserver.conf
sudo nano /etc/turnserver.conf
```

Copy and paste the following configuration. ⚠️ **Make sure to change the IP address and Domain to your own:**

```ini
listening-port=3478
listening-ip=0.0.0.0
external-ip=<ip-server>

# Security and Authentication
fingerprint
lt-cred-mech
user=<YOUR_USERNAME>:<YOUR_SECURE_PASSWORD>
#without subdomain
realm=<domian.ir>
```
💾 *Save and exit the file (`Ctrl+O`, `Enter`, `Ctrl+X`).*

---

## 🧱 Step 4: Open Firewall Ports
Ensure your cloud provider's firewall (and internal UFW) allows traffic through these necessary ports:

```bash
sudo systemctl restart coturn
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 4433/tcp
sudo ufw allow 49152:65535/udp
```

---

## 💻 Step 5: Frontend Configuration (`script-ir.js`)
Update your frontend application's `configuration` object exactly like this to allow the browser to auto-switch between standard and secure routes:

```javascript
const configuration = { 
    'iceServers': [
        {
            // ⚡ Route 1: Direct STUN connection
            'urls': 'stun:turn.<your-domain.com>:3478'
        },
        { 
            // 🔄 Route 2: Standard TURN relay
            'urls': 'turn:turn.<your-domain.com>:3478',
            'username': '<YOUR_USERNAME>',
            'credential': '<YOUR_SECURE_PASSWORD>'
        }
    ],
    // 🌍 Remove strict policies so the browser can negotiate the best path
    'iceTransportPolicy': 'all'
};
```
Or:



**Step 6: Delete the old script**
Navigate to the folder where your `script-ir.js` is located (usually in your `static` or `public` directory) and remove the old file:
```bash
#cd /opt/black-meet/static
sudo rm /opt/black-meet/static/script.js
sudo nano /opt/black-meet/static/script.js
```

💾 *Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).*

**Step 7: Restart and Hard Refresh (Crucial ⚠️)**
Because browsers cache JavaScript files aggressively, you must restart your backend service and force your browser to fetch the new file.

1. Restart your backend service:
```bash
sudo systemctl restart black-meet.service
```
2. Open your website in the browser and press **`Ctrl + F5`** (Windows) or **`Cmd + Shift + R`** (Mac) to perform a Hard Refresh. On mobile, clear your browser cache.
---

## 🚀 Step 8: Start and Restart Services
Apply all configurations by restarting the Coturn service and your main application:

```bash
# 🔄 Restart Coturn (TURN/STUN Server)
sudo systemctl restart coturn
sudo systemctl status coturn

# 🟢 Restart your main service (replace 'blackmeet' with your service name)
sudo systemctl restart black-meet.service
sudo systemctl status black-meet.service
```
🎉 *If both statuses are active (green), your system is fully operational!*

## 🛠 OS Compatibility

* Ubuntu 20.04 / 22.04 / 24.04
* Debian 11 / 12

## 💖 Support the Project

If this tool has helped you manage your Windows services more efficiently, consider supporting its development. Your donations help keep the project updated and maintained.

### 💰 Crypto Donations

You can support me by sending **Litecoin** or **TON** to the following addresses:

| Asset | Wallet Address |
| :--- | :--- |
| **Litecoin (LTC)** | `ltc1qxhuvs6j0suvv50nqjsuujqlr3u4ekfmys2ydps` |
| **TON Network** | `UQAHI_ySJ1HTTCkNxuBB93shfdhdec4LSgsd3iCOAZd5yGmc` |

---

### 🌟 Other Ways to Help
* **Give a Star:** If you can't donate, simply giving this repository a ⭐ **Star** means a lot and helps others find this project.
* **Feedback:** Open an issue if you encounter bugs or have suggestions for improvements.

> **Note:** Please double-check the address before sending. Crypto transactions are irreversible. Thank you for your generosity!

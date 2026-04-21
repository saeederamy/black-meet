#!/bin/bash

# Black Meet Management Script
REPO_URL="https://github.com/saeederamy/black-meet.git"
INSTALL_DIR="/opt/black-meet"
SERVICE_NAME="black-meet.service"

GREEN="\e[32m"
RED="\e[31m"
YELLOW="\e[33m"
RESET="\e[0m"

function check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}Please run as root (sudo ./install.sh)${RESET}"
        exit 1
    fi
}

function install_app() {
    echo -e "${YELLOW}Installing Black Meet...${RESET}"
    apt update && apt install -y python3 python3-pip python3-venv git nginx certbot python3-certbot-nginx
    
    if [ ! -d "$INSTALL_DIR" ]; then
        git clone $REPO_URL $INSTALL_DIR
    fi

    cd $INSTALL_DIR
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt

    # ساخت سرویس systemd
    cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=Black Meet WebRTC Server
After=network.target

[Service]
User=root
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$INSTALL_DIR/venv/bin"
ExecStart=$INSTALL_DIR/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    echo -e "${GREEN}Installation completed! Service is running on port 8000.${RESET}"
}

function stop_app() {
    systemctl stop $SERVICE_NAME
    echo -e "${YELLOW}Service Stopped.${RESET}"
}

function start_app() {
    systemctl start $SERVICE_NAME
    echo -e "${GREEN}Service Started.${RESET}"
}

function update_app() {
    echo -e "${YELLOW}Updating Black Meet from GitHub...${RESET}"
    cd $INSTALL_DIR
    git pull origin main
    source venv/bin/activate
    pip install -r requirements.txt
    systemctl restart $SERVICE_NAME
    echo -e "${GREEN}Update completed and service restarted!${RESET}"
}

function setup_ssl() {
    read -p "Enter your domain name (e.g., meet.yourdomain.com): " DOMAIN
    
    cat <<EOF > /etc/nginx/sites-available/black-meet
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.0:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # پشتیبانی از وب‌سوکت
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

    ln -sf /etc/nginx/sites-available/black-meet /etc/nginx/sites-enabled/
    nginx -t && systemctl restart nginx
    certbot --nginx -d $DOMAIN
    echo -e "${GREEN}SSL configuration completed!${RESET}"
}

function show_info() {
    echo -e "${GREEN}--- Black Meet Info ---${RESET}"
    echo "Directory: $INSTALL_DIR"
    echo "Port: 8000 (Internal), 80/443 (Nginx Proxy)"
    echo "Default Admin: Username: admin | Password: admin"
    echo "Service Status:"
    systemctl is-active $SERVICE_NAME
    echo "-----------------------"
    read -p "Press Enter to continue..."
}

function uninstall_app() {
    read -p "Are you sure you want to completely remove Black Meet? (y/n) " choice
    if [ "$choice" == "y" ]; then
        systemctl stop $SERVICE_NAME
        systemctl disable $SERVICE_NAME
        rm /etc/systemd/system/$SERVICE_NAME
        rm -rf $INSTALL_DIR
        rm /etc/nginx/sites-available/black-meet
        rm /etc/nginx/sites-enabled/black-meet
        systemctl daemon-reload
        systemctl restart nginx
        echo -e "${RED}App completely uninstalled.${RESET}"
    fi
}

check_root

while true; do
    clear
    echo -e "${GREEN}=========================================${RESET}"
    echo -e "${GREEN}      Black Meet Management Panel        ${RESET}"
    echo -e "${GREEN}=========================================${RESET}"
    echo "1. Install & Start Service"
    echo "2. Start Service"
    echo "3. Stop Service"
    echo "4. Update App (Git Pull)"
    echo "5. Setup SSL (Nginx & Certbot)"
    echo "6. Show Panel Info"
    echo "7. Full Uninstall"
    echo "0. Exit"
    echo "-----------------------------------------"
    read -p "Enter your choice: " choice

    case $choice in
        1) install_app ; sleep 2 ;;
        2) start_app ; sleep 2 ;;
        3) stop_app ; sleep 2 ;;
        4) update_app ; sleep 2 ;;
        5) setup_ssl ; sleep 2 ;;
        6) show_info ;;
        7) uninstall_app ; sleep 2 ;;
        0) exit 0 ;;
        *) echo -e "${RED}Invalid option!${RESET}" ; sleep 1 ;;
    esac
done

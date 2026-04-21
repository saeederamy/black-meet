#!/bin/bash

# Black Meet Advanced Management Script
REPO_URL="https://github.com/saeederamy/black-meet.git"
INSTALL_DIR="/opt/black-meet"
SERVICE_NAME="black-meet.service"
ENV_FILE="$INSTALL_DIR/.env"
USERS_FILE="$INSTALL_DIR/users.txt"

GREEN="\e[32m"
RED="\e[31m"
WHITE="\e[97m"
CYAN="\e[36m"
RESET="\e[0m"

function check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}Please run as root (sudo ./install.sh)${RESET}"
        exit 1
    fi
}

function create_global_command() {
    cat <<EOF > /usr/local/bin/black-meet
#!/bin/bash
if [ -f $INSTALL_DIR/install.sh ]; then
    bash $INSTALL_DIR/install.sh
else
    echo "Black Meet is not installed or install.sh is missing."
fi
EOF
    chmod +x /usr/local/bin/black-meet
}

function install_app() {
    echo -e "${WHITE}--- Black Meet Installation ---${RESET}"
    
    # Use -e for readline support (fixes backspace issue)
    read -e -p "Enter Application Port (Default: 8000): " APP_PORT
    APP_PORT=${APP_PORT:-8000}

    read -e -p "Enter Admin Username (Default: admin): " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}

    read -e -p "Enter Admin Password: " ADMIN_PASS
    if [ -z "$ADMIN_PASS" ]; then
        echo -e "${RED}Password cannot be empty! Installation aborted.${RESET}"
        return
    fi

    echo -e "${CYAN}Installing dependencies...${RESET}"
    apt update && apt install -y python3 python3-pip python3-venv git nginx certbot python3-certbot-nginx
    
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
    fi
    git clone $REPO_URL $INSTALL_DIR

    cd $INSTALL_DIR
    echo "APP_PORT=$APP_PORT" > $ENV_FILE
    echo "$ADMIN_USER:$ADMIN_PASS:admin" > $USERS_FILE

    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt

    cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=Black Meet WebRTC Server
After=network.target

[Service]
User=root
WorkingDirectory=$INSTALL_DIR
Environment="PATH=$INSTALL_DIR/venv/bin"
ExecStart=$INSTALL_DIR/venv/bin/uvicorn main:app --host 0.0.0.0 --port $APP_PORT
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    create_global_command
    
    echo -e "${GREEN}Installation completed!${RESET}"
    echo -e "${GREEN}You can now type '${CYAN}black-meet${GREEN}' anywhere to open this menu.${RESET}"
}

function add_user() {
    if [ ! -f "$USERS_FILE" ]; then
        echo -e "${RED}App is not installed yet.${RESET}"
        return
    fi
    echo -e "${WHITE}--- Add New User ---${RESET}"
    read -e -p "Enter Username: " NEW_USER
    if grep -q "^$NEW_USER:" "$USERS_FILE"; then
        echo -e "${RED}User already exists!${RESET}"
        return
    fi
    read -e -p "Enter Password: " NEW_PASS
    read -e -p "Enter Role (admin/user) [Default: user]: " NEW_ROLE
    NEW_ROLE=${NEW_ROLE:-user}

    echo "$NEW_USER:$NEW_PASS:$NEW_ROLE" >> $USERS_FILE
    echo -e "${GREEN}User '$NEW_USER' added successfully!${RESET}"
}

function update_app() {
    if [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${RED}App is not installed.${RESET}"
        return
    fi
    echo -e "${CYAN}Force updating from GitHub...${RESET}"
    cd $INSTALL_DIR
    # Force Git Pull to overwrite local changes
    git fetch --all
    git reset --hard origin/main
    
    source venv/bin/activate
    pip install -r requirements.txt
    systemctl restart $SERVICE_NAME
    echo -e "${GREEN}Update completed!${RESET}"
}

function setup_ssl_auto() {
    if [ ! -f "$ENV_FILE" ]; then echo -e "${RED}Not installed!${RESET}"; return; fi
    source $ENV_FILE
    read -e -p "Enter your domain name (e.g., meet.domain.com): " DOMAIN
    
    cat <<EOF > /etc/nginx/sites-available/black-meet
server {
    listen 80;
    server_name $DOMAIN;
    location / { proxy_pass http://127.0.0.1:$APP_PORT; }
}
EOF
    ln -sf /etc/nginx/sites-available/black-meet /etc/nginx/sites-enabled/
    systemctl restart nginx
    certbot --nginx -d $DOMAIN
    
    cat <<EOF > /etc/nginx/sites-available/black-meet
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
    systemctl restart nginx
    echo -e "${GREEN}Auto SSL Setup Completed!${RESET}"
}

function show_info() {
    if [ ! -f "$ENV_FILE" ]; then echo -e "${RED}Not installed!${RESET}"; return; fi
    source $ENV_FILE
    echo -e "${CYAN}--- System Info ---${RESET}"
    echo "Directory: $INSTALL_DIR"
    echo "Port: $APP_PORT"
    echo -e "Users: \n$(cat $USERS_FILE | awk -F':' '{print " - " $1 " (" $3 ")"}')"
    read -e -p "Press Enter..."
}

function uninstall_app() {
    read -e -p "Completely remove Black Meet? (y/n) " choice
    if [ "$choice" == "y" ]; then
        systemctl stop $SERVICE_NAME
        systemctl disable $SERVICE_NAME
        rm -f /etc/systemd/system/$SERVICE_NAME
        rm -rf $INSTALL_DIR
        rm -f /etc/nginx/sites-available/black-meet
        rm -f /etc/nginx/sites-enabled/black-meet
        rm -f /usr/local/bin/black-meet
        systemctl daemon-reload
        systemctl restart nginx
        echo -e "${RED}Uninstalled.${RESET}"
    fi
}

check_root

while true; do
    clear
    
    # Check Service Status
    if systemctl is-active --quiet $SERVICE_NAME; then
        STATUS="${GREEN}[RUNNING]${RESET}"
    else
        STATUS="${RED}[STOPPED]${RESET}"
    fi

    echo -e "${WHITE}=========================================${RESET}"
    echo -e "${WHITE}      Black Meet Management Panel        ${RESET}"
    echo -e "${WHITE}=========================================${RESET}"
    echo -e "Service Status: $STATUS"
    echo -e "${WHITE}-----------------------------------------${RESET}"
    echo "1. Install & Configure Service"
    echo "2. Add New User"
    echo "3. Start Service"
    echo "4. Stop Service"
    echo "5. Force Update App (Git Pull)"
    echo "6. Setup SSL (Auto)"
    echo "7. Show Panel Info"
    echo "8. Full Uninstall"
    echo "0. Exit"
    echo -e "${WHITE}-----------------------------------------${RESET}"
    read -e -p "Enter choice: " choice

    case $choice in
        1) install_app ; sleep 2 ;;
        2) add_user ; sleep 2 ;;
        3) systemctl start $SERVICE_NAME; echo -e "${GREEN}Started!${RESET}" ; sleep 1 ;;
        4) systemctl stop $SERVICE_NAME; echo -e "${RED}Stopped!${RESET}" ; sleep 1 ;;
        5) update_app ; sleep 2 ;;
        6) setup_ssl_auto ; sleep 2 ;;
        7) show_info ;;
        8) uninstall_app ; sleep 2 ;;
        0) exit 0 ;;
        *) echo -e "${RED}Invalid!${RESET}" ; sleep 1 ;;
    esac
done

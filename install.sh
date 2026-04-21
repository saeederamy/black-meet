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
YELLOW="\e[33m"
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
    
    # برای نصب دستی، اگر پوشه گیت نبود خطا ندهد
    if [ -d ".git" ] || [ -f "main.py" ]; then
        echo -e "${YELLOW}Local files detected. Setting up locally...${RESET}"
        mkdir -p $INSTALL_DIR
        cp -r * $INSTALL_DIR/
    else
        git clone $REPO_URL $INSTALL_DIR
    fi

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
    if [ ! -f "$USERS_FILE" ]; then echo -e "${RED}App is not installed yet.${RESET}"; return; fi
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

function edit_user() {
    if [ ! -f "$USERS_FILE" ]; then echo -e "${RED}App is not installed yet.${RESET}"; return; fi
    echo -e "${WHITE}--- Edit User Password ---${RESET}"
    read -e -p "Enter Username to edit: " TARGET_USER
    
    if ! grep -q "^$TARGET_USER:" "$USERS_FILE"; then
        echo -e "${RED}Error: User '$TARGET_USER' not found!${RESET}"
        return
    fi
    
    read -e -p "Enter New Password: " NEW_PASS
    if [ -z "$NEW_PASS" ]; then
        echo -e "${RED}Password cannot be empty!${RESET}"
        return
    fi
    
    # استخراج نقش کاربر فعلی
    ROLE=$(grep "^$TARGET_USER:" "$USERS_FILE" | cut -d':' -f3)
    
    # حذف خط کاربر قدیمی و اضافه کردن رمز جدید
    grep -v "^$TARGET_USER:" "$USERS_FILE" > "$USERS_FILE.tmp"
    echo "$TARGET_USER:$NEW_PASS:$ROLE" >> "$USERS_FILE.tmp"
    mv "$USERS_FILE.tmp" "$USERS_FILE"
    
    echo -e "${GREEN}Password for '$TARGET_USER' updated successfully!${RESET}"
}

function update_app() {
    if [ ! -d "$INSTALL_DIR" ]; then echo -e "${RED}App is not installed.${RESET}"; return; fi
    echo -e "${CYAN}Force updating from GitHub...${RESET}"
    cd $INSTALL_DIR
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

function setup_ssl_manual() {
    if [ ! -f "$ENV_FILE" ]; then echo -e "${RED}Not installed!${RESET}"; return; fi
    source $ENV_FILE
    echo -e "${WHITE}--- Manual SSL Configuration ---${RESET}"
    read -e -p "Enter your domain name (e.g., meet.domain.com): " DOMAIN
    read -e -p "Enter absolute path to Certificate / Fullchain (e.g., /root/cert.crt): " CERT_PATH
    read -e -p "Enter absolute path to Private Key (e.g., /root/private.key): " KEY_PATH

    if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
        echo -e "${RED}Error: Certificate or Key file does not exist at the provided paths!${RESET}"
        return
    fi

    cat <<EOF > /etc/nginx/sites-available/black-meet
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate $CERT_PATH;
    ssl_certificate_key $KEY_PATH;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
    ln -sf /etc/nginx/sites-available/black-meet /etc/nginx/sites-enabled/
    systemctl restart nginx
    echo -e "${GREEN}Manual SSL Setup successfully applied!${RESET}"
}

function show_info() {
    if [ ! -f "$ENV_FILE" ]; then echo -e "${RED}Not installed!${RESET}"; return; fi
    source $ENV_FILE
    echo -e "${CYAN}--- System Info ---${RESET}"
    echo "Directory: $INSTALL_DIR"
    echo "Port: $APP_PORT"
    echo ""
    echo -e "${WHITE}--- Registered Users ---${RESET}"
    # نمایش کاربر، پسورد و نقش با فرمت‌بندی مرتب
    awk -F':' '{printf " 👤 User: %-15s | 🔑 Pass: %-15s | 🛡️ Role: %s\n", $1, $2, $3}' $USERS_FILE
    echo -e "${WHITE}------------------------${RESET}"
    read -e -p "Press Enter to return to menu..."
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
    echo "3. Edit User Password"
    echo "4. Start Service"
    echo "5. Stop Service"
    echo "6. Force Update App (Git Pull)"
    echo "7. Setup SSL (Auto Let's Encrypt)"
    echo "8. Setup SSL (Manual Paths)"
    echo "9. Show Panel Info (Users & Passwords)"
    echo "10. Full Uninstall"
    echo "0. Exit"
    echo -e "${WHITE}-----------------------------------------${RESET}"
    read -e -p "Enter choice: " choice

    case $choice in
        1) install_app ; sleep 2 ;;
        2) add_user ; sleep 2 ;;
        3) edit_user ; sleep 2 ;;
        4) systemctl start $SERVICE_NAME; echo -e "${GREEN}Started!${RESET}" ; sleep 1 ;;
        5) systemctl stop $SERVICE_NAME; echo -e "${RED}Stopped!${RESET}" ; sleep 1 ;;
        6) update_app ; sleep 2 ;;
        7) setup_ssl_auto ; sleep 2 ;;
        8) setup_ssl_manual ; sleep 3 ;;
        9) show_info ;;
        10) uninstall_app ; sleep 2 ;;
        0) exit 0 ;;
        *) echo -e "${RED}Invalid option!${RESET}" ; sleep 1 ;;
    esac
done

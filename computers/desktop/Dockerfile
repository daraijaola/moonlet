FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 DISPLAY=:1 RES=1280x800
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc openbox tint2 feh xdotool scrot xterm x11-utils \
      chromium fonts-noto-core fonts-noto-color-emoji \
      novnc websockify supervisor ca-certificates curl git jq unzip \
      python3 python3-pip python3-venv python3-pandas python3-matplotlib python3-requests python3-bs4 python3-pil python3-websocket poppler-utils python3-openpyxl \
      nodejs npm \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages --no-cache-dir fastapi==0.115.* uvicorn==0.32.*
RUN npm install -g playwright-core@1.49.1 && npm cache clean --force
RUN curl -fsSL -o /tmp/mm.zip https://github.com/MetaMask/metamask-extension/releases/download/v13.50.0/metamask-chrome-13.50.0.zip \
    && mkdir -p /opt/ext/metamask && unzip -q /tmp/mm.zip -d /opt/ext/metamask && rm /tmp/mm.zip \
    && curl -fsSL -o /tmp/gh.deb https://github.com/cli/cli/releases/download/v2.63.2/gh_2.63.2_linux_amd64.deb && dpkg -i /tmp/gh.deb && rm /tmp/gh.deb
RUN useradd -m -s /bin/bash moon
COPY moonlet-wallpaper.png /usr/share/moonlet/wallpaper.png
COPY supervisord.conf /etc/supervisor/conf.d/moonlet.conf
COPY openbox-autostart /home/moon/.config/openbox/autostart
COPY agentd.py /opt/agentd.py
COPY step.js /usr/local/bin/step
RUN mkdir -p /etc/chromium/policies/managed && printf '{"BrowserSignin":0,"SyncDisabled":true,"PasswordManagerEnabled":false,"DefaultBrowserSettingEnabled":false,"PromotionalTabsEnabled":false}' > /etc/chromium/policies/managed/moonlet.json
RUN chmod +x /usr/local/bin/step && mkdir -p /home/moon/Desktop /home/moon/work && chown -R moon:moon /home/moon \
    && printf '#!/bin/sh\nexec chromium --no-sandbox --test-type --disable-dev-shm-usage --no-first-run --no-default-browser-check --password-store=basic --start-maximized --disable-features=Translate --disable-blink-features=AutomationControlled --disable-gpu --load-extension=/opt/ext/metamask "$@"\n' > /usr/local/bin/browser && chmod +x /usr/local/bin/browser
EXPOSE 8000 6080
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]

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
RUN useradd -m -s /bin/bash moon
COPY moonlet-wallpaper.png /usr/share/moonlet/wallpaper.png
COPY supervisord.conf /etc/supervisor/conf.d/moonlet.conf
COPY openbox-autostart /home/moon/.config/openbox/autostart
COPY tint2rc /home/moon/.config/tint2/tint2rc
COPY agentd.py /opt/agentd.py
RUN mkdir -p /etc/chromium/policies/managed && printf '{"BrowserSignin":0,"SyncDisabled":true,"PasswordManagerEnabled":false,"DefaultBrowserSettingEnabled":false,"PromotionalTabsEnabled":false}' > /etc/chromium/policies/managed/moonlet.json
RUN mkdir -p /home/moon/Desktop /home/moon/work && chown -R moon:moon /home/moon \
    && printf '#!/bin/sh\nexec chromium --no-sandbox --test-type --disable-dev-shm-usage --no-first-run --no-default-browser-check --password-store=basic --start-maximized --disable-features=Translate "$@"\n' > /usr/local/bin/browser && chmod +x /usr/local/bin/browser
EXPOSE 8000 6080
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]

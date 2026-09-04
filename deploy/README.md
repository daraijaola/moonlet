# Hosting moonlet on the 16labs VM

    git clone https://github.com/daraijaola/moonlet.git && cd moonlet/deploy
    cp .env.example .env && $EDITOR .env
    docker compose up -d --build

`web` listens on 127.0.0.1:3000; the VM's nginx proxies `/` to it (see nginx-16labs.conf) and
certbot handles TLS for 16labs.xyz. `tick` calls the scheduler once a minute. SQLite lives in
the `data` volume.

Update: `git pull && docker compose up -d --build`. Logs: `docker compose logs -f web`.

# Hosting moonlet on a VM

    git clone https://github.com/daraijaola/moonlet.git && cd moonlet/deploy
    cp .env.example .env && $EDITOR .env
    docker compose up -d --build

Caddy terminates TLS for 16labs.xyz (DNS A record must point at the VM, ports 80/443 open).
`tick` calls the scheduler once a minute. SQLite lives in the `data` volume.

Update: `git pull && docker compose up -d --build`. Logs: `docker compose logs -f web`.

# Hosting moonlet on the 16labs VM

    git clone https://github.com/daraijaola/moonlet.git && cd moonlet/deploy
    cp .env.example .env && $EDITOR .env
    # from a machine with RAM: builds the image and streams it to the VM
    ./ship.sh ubuntu@VM_IP ~/.ssh/key.pem

`web` listens on 127.0.0.1:3000; the VM's nginx proxies `/` to it (see nginx-16labs.conf) and
certbot handles TLS for 16labs.xyz. `tick` calls the scheduler once a minute. SQLite lives in
the `data` volume.

Update: `deploy/ship.sh ubuntu@VM_IP` (never build on the VM; the small disk and RAM stall it). Logs: `docker compose logs -f web`.

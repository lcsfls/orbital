#!/usr/bin/env bash
# Orbital – Proxmox VE helper: creates a small unprivileged LXC and installs Orbital in it.
#
# Run on the Proxmox host as root:
#   bash proxmox-lxc.sh
#
# Lightweight on purpose: no Docker inside the container. Node.js 22 (official binary,
# checksum verified) runs Orbital as a systemd service. Data lives in /var/lib/orbital.
#
# Storage is never guessed: you pick the storage for the container disk and for the
# template from the storages Proxmox reports as active and suitable.
#
# Non-interactive use: set any of these variables to skip the matching question.
#   CTID HOSTNAME_CT STORAGE TEMPLATE_STORAGE DISK_GB CORES MEMORY_MB BRIDGE IP GATEWAY
#   PORT TZ_CT SETUP_TOKEN HOME_ENABLED REPO BRANCH
#   YES=1 skips the final confirmation.
set -euo pipefail

REPO="${REPO:-https://github.com/lcsfls/orbital.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR=22

# ---------- helpers ----------
info() { printf '\033[1;34m[orbital]\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

HAVE_WHIPTAIL=0
if command -v whiptail >/dev/null 2>&1 && [ -t 0 ] && [ -t 1 ]; then HAVE_WHIPTAIL=1; fi

# menu "Title" "Text" tag1 "desc1" tag2 "desc2" ...  -> prints the chosen tag
menu() {
  local title=$1 text=$2
  shift 2
  if [ "$HAVE_WHIPTAIL" = 1 ]; then
    whiptail --title "$title" --menu "$text" 20 78 10 "$@" 3>&1 1>&2 2>&3 || die "Cancelled."
    return
  fi
  local tags=() i=1
  echo "$title – $text" >&2
  while [ $# -gt 0 ]; do
    tags+=("$1")
    printf '  %d) %s  %s\n' "$i" "$1" "$2" >&2
    shift 2
    i=$((i + 1))
  done
  local n
  read -r -p "Choose 1-${#tags[@]}: " n
  [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "${#tags[@]}" ] || die "Invalid choice."
  printf '%s' "${tags[$((n - 1))]}"
}

# ask "Title" "Text" "default" -> prints the answer
ask() {
  if [ "$HAVE_WHIPTAIL" = 1 ]; then
    whiptail --title "$1" --inputbox "$2" 10 78 "$3" 3>&1 1>&2 2>&3 || die "Cancelled."
    return
  fi
  local a
  read -r -p "$2 [$3]: " a
  printf '%s' "${a:-$3}"
}

yesno() {
  if [ "$HAVE_WHIPTAIL" = 1 ]; then
    whiptail --title "$1" --yesno "$2" 12 78
    return
  fi
  local a
  read -r -p "$2 [y/N]: " a
  [[ "$a" =~ ^[yYjJ] ]]
}

# Lists active storages that allow a content type, as "name|type|free_gib" lines.
storages_for() {
  pvesm status -content "$1" 2>/dev/null | awk 'NR > 1 && $3 == "active" { printf "%s|%s|%.1f\n", $1, $2, $6 / 1048576 }'
}

# Lets the user pick a storage for a content type. Never picks one silently.
pick_storage() {
  local content=$1 purpose=$2 preset=${3:-}
  local lines
  lines=$(storages_for "$content")
  [ -n "$lines" ] || die "No active storage allows '$content' ($purpose). Enable the content type under Datacenter > Storage first."
  if [ -n "$preset" ]; then
    grep -q "^${preset}|" <<<"$lines" || die "Storage '$preset' does not exist, is not active or does not allow '$content'."
    printf '%s' "$preset"
    return
  fi
  local args=()
  while IFS='|' read -r name type free; do
    args+=("$name" "$(printf '%-10s %8s GiB free' "$type" "$free")")
  done <<<"$lines"
  menu "Storage: $purpose" "Pick the storage for $purpose.\nOnly active storages that allow '$content' are listed." "${args[@]}"
}

free_gib() { storages_for "$1" | awk -F'|' -v s="$2" '$1 == s { print int($3) }'; }

# ---------- checks ----------
[ "$(id -u)" = 0 ] || die "Run this as root on the Proxmox host."
command -v pct >/dev/null 2>&1 && command -v pvesm >/dev/null 2>&1 && command -v pveam >/dev/null 2>&1 \
  || die "This does not look like a Proxmox VE host (pct, pvesm or pveam missing)."
info "Proxmox VE $(pveversion | cut -d/ -f2)"
# Containers share the host kernel, so the template must match the host architecture.
HOST_ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
case "$HOST_ARCH" in x86_64) HOST_ARCH=amd64 ;; aarch64) HOST_ARCH=arm64 ;; esac
case "$HOST_ARCH" in amd64 | arm64) ;; *) die "Unsupported host architecture: $HOST_ARCH" ;; esac
info "Host architecture: $HOST_ARCH"

# ---------- questions ----------
NEXT_ID=$(pvesh get /cluster/nextid 2>/dev/null || echo 200)
CTID=${CTID:-$(ask "Container ID" "ID for the new container" "$NEXT_ID")}
[[ "$CTID" =~ ^[0-9]+$ ]] || die "Container ID must be a number."
if pct status "$CTID" >/dev/null 2>&1 || qm status "$CTID" >/dev/null 2>&1; then die "ID $CTID is already in use."; fi

HOSTNAME_CT=${HOSTNAME_CT:-$(ask "Hostname" "Hostname of the container" "orbital")}

STORAGE=$(pick_storage rootdir "the container disk" "${STORAGE:-}")
TEMPLATE_STORAGE=$(pick_storage vztmpl "the Debian template" "${TEMPLATE_STORAGE:-}")

DISK_GB=${DISK_GB:-$(ask "Disk size" "Disk size in GB (Orbital needs well under 1 GB, the rest is for your data)" "4")}
[[ "$DISK_GB" =~ ^[0-9]+$ ]] && [ "$DISK_GB" -ge 2 ] || die "Disk size must be a whole number of at least 2."
FREE=$(free_gib rootdir "$STORAGE")
if [ -n "$FREE" ] && [ "$FREE" -lt "$DISK_GB" ]; then die "Storage '$STORAGE' has only ${FREE} GiB free."; fi

CORES=${CORES:-$(ask "CPU" "CPU cores" "1")}
MEMORY_MB=${MEMORY_MB:-$(ask "Memory" "Memory in MB" "512")}

BRIDGES=$(ip -o link show type bridge 2>/dev/null | awk -F': ' '{ print $2 }' | cut -d@ -f1)
[ -n "$BRIDGES" ] || die "No network bridge found (for example vmbr0)."
if [ -z "${BRIDGE:-}" ]; then
  args=()
  for b in $BRIDGES; do args+=("$b" "bridge"); done
  BRIDGE=$(menu "Network" "Bridge for the container" "${args[@]}")
fi
grep -qx "$BRIDGE" <<<"$BRIDGES" || die "Bridge '$BRIDGE' does not exist."

IP=${IP:-$(ask "Network" "IPv4: 'dhcp' or an address with prefix, for example 192.168.1.50/24" "dhcp")}
NET="name=eth0,bridge=${BRIDGE},ip=${IP}"
if [ "$IP" != "dhcp" ]; then
  [[ "$IP" =~ ^[0-9.]+/[0-9]+$ ]] || die "IP must be 'dhcp' or look like 192.168.1.50/24."
  GATEWAY=${GATEWAY:-$(ask "Network" "Gateway" "$(ip route | awk '/^default/ { print $3; exit }')")}
  NET="${NET},gw=${GATEWAY}"
fi

PORT=${PORT:-$(ask "Port" "Port for the web interface" "8080")}
HOST_TZ=$(cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value 2>/dev/null || echo UTC)
TZ_CT=${TZ_CT:-$HOST_TZ}
HOME_ENABLED=${HOME_ENABLED:-true}
if [ -z "${SETUP_TOKEN+x}" ]; then
  if yesno "Setup token" "Protect the first-run setup with a token?\n\nRecommended if others can reach the container before you create your admin account. The token is shown at the end."; then
    SETUP_TOKEN=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
  else
    SETUP_TOKEN=""
  fi
fi

# ---------- template ----------
info "Looking for the newest Debian standard template"
pveam update >/dev/null 2>&1 || info "Could not refresh the template list, using the cached one."
TEMPLATE=$(pveam available --section system | awk '{ print $2 }' | grep -E "^debian-(13|12)-standard_.*_${HOST_ARCH}\.tar\." | sort -V | tail -1)
[ -n "$TEMPLATE" ] || die "No Debian 12 or 13 standard template for $HOST_ARCH found in 'pveam available'."

# ---------- summary ----------
SUMMARY="ID:        $CTID
Hostname:  $HOSTNAME_CT
Template:  $TEMPLATE ($TEMPLATE_STORAGE, $HOST_ARCH)
Disk:      ${DISK_GB} GB on $STORAGE
CPU / RAM: $CORES core(s), ${MEMORY_MB} MB
Network:   $BRIDGE, $IP
Port:      $PORT
Time zone: $TZ_CT"
if [ "${YES:-0}" != 1 ]; then yesno "Create container?" "$SUMMARY" || die "Cancelled, nothing was created."; fi

if ! pveam list "$TEMPLATE_STORAGE" | awk '{ print $1 }' | grep -q "/${TEMPLATE}$"; then
  info "Downloading $TEMPLATE to $TEMPLATE_STORAGE"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

# ---------- create ----------
info "Creating container $CTID"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME_CT" \
  --cores "$CORES" \
  --memory "$MEMORY_MB" \
  --swap 256 \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "$NET" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1 \
  --tags orbital \
  --description "Orbital – calm idea and project tracker. Data: /var/lib/orbital. Update: orbital-update"
if ! pct start "$CTID"; then
  echo
  echo "Container $CTID was created but does not start."
  echo "Details: pct start $CTID --debug"
  if yesno "Start failed" "Container $CTID was created but does not start.

Remove it again? (Nothing else was changed.)"; then
    pct destroy "$CTID" --purge >/dev/null 2>&1 && info "Container $CTID removed."
  fi
  die "Stopped. Nothing was installed."
fi

info "Waiting for the network"
for _ in $(seq 1 30); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then break; fi
  sleep 2
done
pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 || die "The container has no network or DNS. Check bridge and IP, container $CTID was left in place."

# ---------- install inside the container ----------
INSTALL=$(mktemp)
cat >"$INSTALL" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl git xz-utils >/dev/null

# Node.js ${NODE_MAJOR} (official binary, checksum verified).
ARCH=\$(dpkg --print-architecture)
case "\$ARCH" in amd64) NARCH=x64 ;; arm64) NARCH=arm64 ;; *) echo "Unsupported architecture \$ARCH"; exit 1 ;; esac
BASE=https://nodejs.org/dist/latest-v${NODE_MAJOR}.x
FILE=\$(curl -fsSL "\$BASE/SHASUMS256.txt" | awk -v a="linux-\$NARCH.tar.xz" '\$2 ~ a"\$" { print \$2 }')
curl -fsSL "\$BASE/\$FILE" -o "/tmp/\$FILE"
( cd /tmp && curl -fsSL "\$BASE/SHASUMS256.txt" | grep " \$FILE\\\$" | sha256sum -c - )
tar -xJf "/tmp/\$FILE" -C /usr/local --strip-components=1 --exclude CHANGELOG.md --exclude README.md --exclude LICENSE
rm -f "/tmp/\$FILE"

id orbital >/dev/null 2>&1 || useradd --system --home /var/lib/orbital --shell /usr/sbin/nologin orbital
install -d -o orbital -g orbital -m 750 /var/lib/orbital
install -d -m 755 /etc/orbital

git clone --depth 1 --branch "${BRANCH}" "${REPO}" /opt/orbital
cd /opt/orbital
if ! npm ci --omit=dev --no-audit --no-fund; then
  # Only if no prebuilt better-sqlite3 binary fits: build tools, then retry.
  apt-get install -y -qq --no-install-recommends build-essential python3 >/dev/null
  npm ci --omit=dev --no-audit --no-fund
fi
chown -R root:root /opt/orbital

cat >/etc/orbital/orbital.env <<ENV
PORT=${PORT}
HOST=0.0.0.0
DATA_DIR=/var/lib/orbital
TZ=${TZ_CT}
HOME_ENABLED=${HOME_ENABLED}
SETUP_TOKEN=${SETUP_TOKEN}
COOKIE_SECURE=auto
TRUST_PROXY=
AI_ENABLED=false
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=llama3.2:3b
ENV
chmod 640 /etc/orbital/orbital.env
chgrp orbital /etc/orbital/orbital.env

cat >/etc/systemd/system/orbital.service <<UNIT
[Unit]
Description=Orbital
After=network-online.target
Wants=network-online.target

[Service]
User=orbital
Group=orbital
WorkingDirectory=/opt/orbital
EnvironmentFile=/etc/orbital/orbital.env
ExecStart=/usr/local/bin/node backend/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/orbital

[Install]
WantedBy=multi-user.target
UNIT

cat >/usr/local/bin/orbital-update <<'UPD'
#!/usr/bin/env bash
# Updates Orbital to the newest version of its branch. Data in /var/lib/orbital is kept.
set -euo pipefail
cd /opt/orbital
git fetch --depth 1 origin
git reset --hard FETCH_HEAD
npm ci --omit=dev --no-audit --no-fund
systemctl restart orbital
echo "Orbital updated to \$(git rev-parse --short HEAD)."
UPD
chmod 755 /usr/local/bin/orbital-update

systemctl daemon-reload
systemctl enable --now orbital >/dev/null
for i in \$(seq 1 20); do
  curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && exit 0
  sleep 1
done
echo "Orbital did not answer on /healthz. See: journalctl -u orbital"
exit 1
EOF

info "Installing Orbital inside the container (this takes a minute)"
pct push "$CTID" "$INSTALL" /root/orbital-install.sh --perms 700
rm -f "$INSTALL"
pct exec "$CTID" -- bash /root/orbital-install.sh
pct exec "$CTID" -- rm -f /root/orbital-install.sh

ADDR=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{ print $1 }')
ok "Orbital runs in container $CTID."
echo
echo "  Open:          http://${ADDR:-<container-ip>}:${PORT}"
[ -n "$SETUP_TOKEN" ] && echo "  Setup token:   $SETUP_TOKEN   (asked once, when you create the admin account)"
echo "  Settings:      pct enter $CTID, then edit /etc/orbital/orbital.env and run: systemctl restart orbital"
echo "  Update:        pct exec $CTID -- orbital-update"
echo "  Backup:        a normal Proxmox backup of CT $CTID includes everything (data: /var/lib/orbital)"

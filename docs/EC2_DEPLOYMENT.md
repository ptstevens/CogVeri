# EC2 Deployment Guide

## How Deployment Works

Push to `main` → GitHub Actions builds Docker image → pushes to GHCR → SSHs to EC2 → pulls & restarts container with health check rollback.

## Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret        | Description                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| `EC2_HOST`    | EC2 public IP or hostname                                                        |
| `EC2_USER`    | SSH user (e.g. `ubuntu`, `ec2-user`)                                             |
| `EC2_SSH_KEY` | Private SSH key (PEM format) for the EC2 user                                    |
| `GHCR_PAT`    | GitHub Personal Access Token with `read:packages` scope (for EC2 to pull images) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## EC2 Prerequisites

Run these **once** on the EC2 instance:

```bash
# Install Docker
sudo yum install -y docker  # Amazon Linux
# OR: sudo apt install -y docker.io  # Ubuntu
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER

# Create network and env file
docker network create cogveri-net
sudo mkdir -p /opt/cogveri
sudo cp .env /opt/cogveri/.env
sudo chmod 600 /opt/cogveri/.env
```

## Manual Deploy

```bash
# On EC2 — pull and restart manually
docker pull ghcr.io/ptstevens/cogveri/backend:latest
docker stop cogveri-backend && docker rm cogveri-backend
docker run -d --name cogveri-backend --restart unless-stopped \
  --env-file /opt/cogveri/.env -p 3000:3000 --network cogveri-net \
  ghcr.io/ptstevens/cogveri/backend:latest
```

## Rollback

```bash
docker stop cogveri-backend && docker rm cogveri-backend
docker run -d --name cogveri-backend --restart unless-stopped \
  --env-file /opt/cogveri/.env -p 3000:3000 --network cogveri-net \
  ghcr.io/ptstevens/cogveri/backend:previous
```

## Frontend

Frontend deploys automatically via **Vercel** on push to `main`. No manual action needed.

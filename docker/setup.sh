#!/usr/bin/env bash
# Sets up the WeBWorK PG renderer for the VS Code extension.
#
# This script:
#   1. Clones the renderer source from github.com/openwebwork/renderer
#      (into ./renderer-src).
#   2. Clones the Open Problem Library into ./opl (it'll be bind-mounted into
#      the container at runtime — much faster and more reliable than baking it
#      into the image).
#   3. Builds the renderer image.
#   4. Starts the container.
#
# Re-run this script anytime to update both the renderer and the OPL.
# To stop the renderer: `docker compose down` from this directory.
#
# Requirements: git, docker, docker compose. (All ship with Docker Desktop.)
#
# Disk usage: about 4 GB total (1 GB for the OPL clone, 3 GB for the image).

set -e

cd "$(dirname "$0")"

RENDERER_DIR="./renderer-src"
OPL_DIR="./opl"

# --- Renderer source ---------------------------------------------------------
if [ ! -d "$RENDERER_DIR" ]; then
  echo "==> Cloning openwebwork/renderer into $RENDERER_DIR ..."
  git clone --recursive https://github.com/openwebwork/renderer "$RENDERER_DIR"
else
  echo "==> Updating existing renderer checkout in $RENDERER_DIR ..."
  (cd "$RENDERER_DIR" && git pull --recurse-submodules)
fi

# --- Open Problem Library ----------------------------------------------------
# The renderer expects the OPL at /usr/app/webwork-open-problem-library inside
# the container. We bind-mount our local clone there. A shallow clone is fine
# since you're not contributing to the OPL.
if [ ! -d "$OPL_DIR" ]; then
  echo ""
  echo "==> Cloning the Open Problem Library into $OPL_DIR (1 GB, a few minutes) ..."
  git clone --depth 1 https://github.com/openwebwork/webwork-open-problem-library "$OPL_DIR"
else
  echo ""
  echo "==> Updating existing OPL checkout in $OPL_DIR ..."
  (cd "$OPL_DIR" && git pull)
fi

# --- Build & start -----------------------------------------------------------
echo ""
echo "==> Building the renderer image (first build takes 10-15 min) ..."
docker compose build

echo ""
echo "==> Starting the renderer ..."
docker compose up -d

echo ""
echo "==> Waiting for the renderer to come up ..."
for i in {1..30}; do
  if curl -sf http://localhost:3000/ > /dev/null 2>&1; then
    echo ""
    echo "Renderer is responding at http://localhost:3000/"
    echo "You can now open a .pg file in VS Code and run 'WeBWorK: Show Preview to the Side'."
    exit 0
  fi
  sleep 2
  echo -n "."
done

echo ""
echo "Renderer container is running but didn't answer HTTP within 60s."
echo "Check 'docker compose logs' to see what's going on."
exit 1

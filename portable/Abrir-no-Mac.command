#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node server.mjs
elif command -v python3 >/dev/null 2>&1; then
  python3 server.py
else
  echo "Instale Node.js 18 ou superior pelo site https://nodejs.org/ e abra novamente."
  read -r -p "Pressione Enter para fechar."
fi

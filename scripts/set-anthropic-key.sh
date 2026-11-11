#!/bin/zsh
# Prompt for an Anthropic Console API key, verify it works, then save it to
# Netlify. The key is read silently and never echoed or written to disk.
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"

printf 'Paste your Anthropic API key (starts with sk-ant-), then press Enter. It stays hidden: '
read -rs KEY
echo
KEY="${KEY//[[:space:]]/}"

case "$KEY" in
  sk-ant-*) ;;
  *) echo "That doesn't look like an Anthropic key (should start with sk-ant-). Nothing changed."; unset KEY; exit 1 ;;
esac

code=$(curl -s -o /dev/null -w '%{http_code}' https://api.anthropic.com/v1/models \
  -H "x-api-key: $KEY" -H 'anthropic-version: 2023-06-01')
if [ "$code" != 200 ]; then
  echo "Anthropic rejected that key (HTTP $code). Nothing changed."
  unset KEY
  exit 1
fi

# --force: the variable already exists, and without it the CLI waits on an
# overwrite prompt (or silently skips when it can't ask)
netlify env:set ANTHROPIC_API_KEY "$KEY" --force 2>&1 | grep -v "$KEY"

# Read it back — only a matching fingerprint counts as saved
want=$(printf %s "$KEY" | shasum | cut -c1-12)
got=$(printf %s "$(netlify env:get ANTHROPIC_API_KEY 2>/dev/null | tail -1)" | shasum | cut -c1-12)
unset KEY
if [ "$want" = "$got" ]; then
  echo "Key verified and saved to Netlify (confirmed by reading it back). Tell Claude it's done."
else
  echo "Key works, but Netlify still has the old value. Copy the output above to Claude."
  exit 1
fi

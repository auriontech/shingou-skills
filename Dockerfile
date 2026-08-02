# Packaged form of the Shingou MCP server, for directories and hosts that build
# and launch a server rather than connect to a remote one. The server itself is
# remote; this image is the stdio bridge to it (see src/stdio-proxy.mjs).
#
# There are no dependencies, so there is no install step: the build is two file
# copies on top of the base image, which keeps it fast and offline-safe. The
# entrypoint is plain JavaScript, so nothing here needs a modern Node: the
# package floor is 18 and the image just pins something current.
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY src/ ./src/

ENV NODE_ENV=production

# The protocol only uses stdout, so stderr stays free for real diagnostics.
ENTRYPOINT ["node", "src/stdio-proxy.mjs"]

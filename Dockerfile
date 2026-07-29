# Packaged form of the Shingou MCP server, for directories and hosts that build
# and launch a server rather than connect to a remote one. The server itself is
# remote; this image is the stdio bridge to it (see src/stdio-proxy.ts).
#
# There are no dependencies, so there is no install step: the build is two file
# copies on top of the base image, which keeps it fast and offline-safe. Node 24+
# runs the TypeScript entrypoint directly by stripping type annotations.
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY src/ ./src/

ENV NODE_ENV=production

# Type stripping is still flagged experimental and warns on stderr. The warning is
# harmless to the protocol, which only uses stdout, but a clean stderr makes real
# diagnostics visible.
ENTRYPOINT ["node", "--disable-warning=ExperimentalWarning", "src/stdio-proxy.ts"]

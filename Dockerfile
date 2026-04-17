FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ARG MCP_SERVICE=jira
ENV MCP_SERVICE=${MCP_SERVICE}
ENV MCP_HOST=0.0.0.0

EXPOSE 8090

CMD ["sh", "-lc", "node --env-file=.env src/${MCP_SERVICE}/server.js"]


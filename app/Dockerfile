# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy package files
COPY app/package*.json ./
RUN npm install

# Copy source code
COPY app/ .

# Build the application
RUN npm run build

# Run stage
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config template
COPY app/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Railway provides PORT env var — default to 80 for local
ENV PORT=80

EXPOSE ${PORT}

CMD ["nginx", "-g", "daemon off;"]

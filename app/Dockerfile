# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_DEMO_MODE
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE

# Copy package files
COPY app/package*.json ./
RUN npm ci

# Copy source code
COPY app/ .

# Build the application
RUN npm run build

# Run stage
FROM nginx:1.27-alpine

ENV BACKEND_URL=http://localhost:8080

RUN apk --no-cache add curl

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config template
COPY app/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Run nginx as its default user.
#
# Previously this image dropped to a custom `appuser` non-root user, but
# that turned into a maze of permission gymnastics on DigitalOcean App
# Platform (kaniko build couldn't `touch /var/run/nginx.pid` because of
# the /var/run→/run symlink, and even after rewriting the pid path the
# container still failed the readiness probe with no surfaced logs).
#
# nginx's official image already runs the master as root and drops
# privileges to the `nginx` user for the worker processes, which is the
# recommended deployment posture inside a container sandbox. Sticking
# with that default eliminates an entire class of pid/log/cache write
# permission bugs at deploy time.

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

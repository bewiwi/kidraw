FROM nginx:alpine

# Copy static assets to nginx default public directory
COPY . /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Nginx alpine image starts securely automatically
CMD ["nginx", "-g", "daemon off;"]

FROM node:22-alpine
WORKDIR /app
COPY index.js .
EXPOSE 3000
ENV PORT=3000
ENV POSTS_DIR=/data/posts
ENV APPROVAL_DIR=/data/approvals
ENV APPROVAL_SECRET=searchops-approval-secret-change-me
RUN mkdir -p /data/posts /data/approvals
CMD ["node", "index.js"]

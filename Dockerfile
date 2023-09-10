# get current LTS docker image
FROM node:lts-bookworm-slim AS build

# update packages and install `dumb-init` package
RUN apt-get update && \
    apt-get install -y --no-install-recommends dumb-init

# set working directory
WORKDIR /usr/src/app

# copy `package*.json` to the current working directory
COPY package*.json /usr/src/app/

# install production dependencies
RUN npm ci --only=production

# ------ Release Image ------
FROM node:lts-bookworm-slim AS release

# copy `dumb-init` executable
COPY --from=build /usr/bin/dumb-init /usr/bin/dumb-init

# set environment state
ENV NODE_ENV production

# set process user
USER node

# set working directory
WORKDIR /usr/src/app

# copy `node_modules` to working directory and assign `node` as file owner
#COPY --from=build --chown=node:node /usr/src/app/node_modules /usr/src/app/node_modules

# copy application files and assign `node` as file owner
COPY --chown=node:node . /usr/src/app

# run entrypoint script
CMD ["dumb-init", "node", "/usr/src/app/index.js"]